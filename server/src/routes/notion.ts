import { Router, Response } from 'express';
import { createHash, randomUUID } from 'node:crypto';
import { getAll, getOne, runQuery, Mutation, ConflictError, libraryRevision, storedText, stageRows, publishRows } from '../db/schema';
import { requireAuth } from '../middleware/auth';
import { NotionConnection, NotionConnectionStatus, NotionRefreshResult } from '../types';
import { readNotionRecipes, NotionError, NotionRecipe } from '../services/notion-reader';
import { decryptNotionToken, encryptNotionToken } from '../services/notion-credentials';
const router = Router();
router.use(requireAuth);
interface Mapping {
    host_id: string;
    data_source_id: string;
    page_id: string;
    meal_id: string;
    source_url: string;
    content_hash: string;
    archived: number;
}
interface Lease {
    token: string;
    revision: number;
}
const connection = (host: string) => getOne<NotionConnection>('SELECT * FROM notion_connections WHERE host_id=?', [host]);
async function status(host: string): Promise<NotionConnectionStatus> {
    const saved = await connection(host);
    const count = await getOne<{
        count: number;
    }>(`SELECT COUNT(*) AS count FROM notion_recipes n JOIN meals m ON m.id=n.meal_id WHERE n.host_id=? AND m.archived=0`, [host]);
    return { connected: Boolean(saved), sourceUrl: saved?.source_url ?? null, lastRefreshedAt: saved?.last_refreshed_at ?? null, lastError: saved?.last_error ?? null, recipeCount: count?.count ?? 0 };
}
async function acquire(host: string): Promise<Lease> {
    const revision = await libraryRevision(host);
    const token = randomUUID();
    const now = Date.now();
    const result = await runQuery(`INSERT INTO notion_leases(host_id,token,expires,revision) VALUES (?,?,?,?) ON CONFLICT(host_id) DO UPDATE SET token=excluded.token,expires=excluded.expires,revision=excluded.revision WHERE notion_leases.expires<=?`, [host, token, now + 600000, revision, now]);
    if (!result.meta.changes)
        throw new NotionError('A Notion request is already in progress. Wait for it to finish.', 409);
    return { token, revision };
}
async function applyRecipes(host: string, lease: Lease, data: {
    dataSourceId: string;
    sourceUrl: string;
    recipes: NotionRecipe[];
}, ciphertext: string, saved?: NotionConnection): Promise<NotionRefreshResult> {
    const maps = await getAll<Mapping>('SELECT n.*,m.archived FROM notion_recipes n JOIN meals m ON m.id=n.meal_id WHERE n.host_id=?', [host]);
    const previous = new Map(maps.filter(row => row.data_source_id === data.dataSourceId).map(row => [row.page_id, row]));
    const incoming = new Set(data.recipes.map(recipe => recipe.pageId));
    if (incoming.size !== data.recipes.length)
        throw new NotionError('Notion returned duplicate recipe pages. Refresh again.');
    const recipes: Record<string, unknown>[] = [];
    const ingredients: Record<string, unknown>[] = [];
    const affected: string[] = [];
    let added = 0, updated = 0, removed = 0;
    for (const recipe of data.recipes) {
        const old = previous.get(recipe.pageId);
        const hash = createHash('sha256').update(JSON.stringify({ title: recipe.title, ingredients: recipe.ingredients, instructions: recipe.instructions })).digest('hex');
        const id = old?.meal_id ?? randomUUID();
        const changed = !old || old.content_hash !== hash;
        const activate = changed || old?.archived === 1;
        if (!old)
            added++;
        else if (activate)
            updated++;
        if (old && activate)
            affected.push(id);
        recipes.push({ id, pageId: recipe.pageId, url: recipe.url, hash, changed: changed ? 1 : 0, activate: activate ? 1 : 0, title: await storedText(recipe.title, host), instructions: await storedText(recipe.instructions, host) });
        if (changed)
            for (const [order, row] of recipe.ingredients.entries())
                ingredients.push({ id: randomUUID(), mealId: id, amount: await storedText(row.amount, host), ingredient: await storedText(row.ingredient, host), order });
    }
    const absent = maps.filter(row => row.data_source_id !== data.dataSourceId || !incoming.has(row.page_id));
    for (const row of absent) {
        affected.push(row.meal_id);
        if (!row.archived)
            removed++;
    }
    const open = await getOne(`SELECT s.id FROM sessions s JOIN session_meals sm ON sm.session_id=s.id WHERE s.status='open' AND sm.meal_id IN (SELECT value FROM json_each(?)) LIMIT 1`, [JSON.stringify(affected)]);
    if (open)
        throw new NotionError('Close the open voting session before refreshing changed Notion recipes.', 409);
    const recipeStage = await stageRows(host, recipes);
    const ingredientStage = await stageRows(host, ingredients);
    const batch = new Mutation();
    batch.library(host, lease.revision);
    batch.assert("NOT EXISTS(SELECT 1 FROM notion_recipes n JOIN meals m ON m.id=n.meal_id WHERE n.host_id=? AND (m.host_id IS NULL OR m.host_id<>?))", [host, host]);
    batch.assert("EXISTS(SELECT 1 FROM notion_leases WHERE host_id=? AND token=? AND revision=? AND expires>CAST((julianday('now')-2440587.5)*86400000 AS INTEGER))", [host, lease.token, lease.revision]);
    if (saved)
        batch.assert("EXISTS(SELECT 1 FROM notion_connections WHERE host_id=? AND token_ciphertext=? AND data_source_id=?)", [host, saved.token_ciphertext, saved.data_source_id]);
    batch.assert(`NOT EXISTS(SELECT 1 FROM sessions s JOIN session_meals sm ON sm.session_id=s.id WHERE s.status='open' AND sm.meal_id IN (SELECT value FROM json_each(?)))`, [JSON.stringify(affected)]);
    batch.assert("EXISTS(SELECT 1 FROM mutation_stages WHERE id=? AND owner=? AND digest=? AND sealed=1 AND expires>CAST((julianday('now')-2440587.5)*86400000 AS INTEGER) AND expected_chunks=(SELECT COUNT(*) FROM mutation_chunks WHERE stage_id=?) AND expected_rows=(SELECT COALESCE(SUM(json_array_length(value)),0) FROM mutation_chunks WHERE stage_id=?))", [recipeStage.id, host, recipeStage.digest, recipeStage.id, recipeStage.id]);
    batch.run(`INSERT INTO meals(id,host_id,title,instructions,type) SELECT json_extract(j.value,'$.id'),?,json_extract(j.value,'$.title'),json_extract(j.value,'$.instructions'),'meal' FROM mutation_chunks c,json_each(c.value) j WHERE c.stage_id=? AND json_extract(j.value,'$.activate')=1 ON CONFLICT(id) DO UPDATE SET title=excluded.title,instructions=excluded.instructions,archived=0`, [host, recipeStage.id]);
    batch.run(`DELETE FROM meal_ingredients WHERE meal_id IN (SELECT json_extract(j.value,'$.id') FROM mutation_chunks c,json_each(c.value) j WHERE c.stage_id=? AND json_extract(j.value,'$.changed')=1)`, [recipeStage.id]);
    publishRows(batch, ingredientStage, `INSERT INTO meal_ingredients(id,meal_id,amount,ingredient,display_order) SELECT json_extract(j.value,'$.id'),json_extract(j.value,'$.mealId'),json_extract(j.value,'$.amount'),json_extract(j.value,'$.ingredient'),json_extract(j.value,'$.order') FROM $ROWS WHERE $STAGE ORDER BY c.ordinal,CAST(j.key AS INTEGER)`);
    batch.run(`INSERT INTO notion_recipes(host_id,data_source_id,page_id,meal_id,source_url,content_hash) SELECT ?,?,json_extract(j.value,'$.pageId'),json_extract(j.value,'$.id'),json_extract(j.value,'$.url'),json_extract(j.value,'$.hash') FROM mutation_chunks c,json_each(c.value) j WHERE c.stage_id=? ON CONFLICT(host_id,data_source_id,page_id) DO UPDATE SET source_url=excluded.source_url,content_hash=excluded.content_hash`, [host, data.dataSourceId, recipeStage.id]);
    batch.run('UPDATE meals SET archived=1 WHERE host_id=? AND id IN (SELECT value FROM json_each(?))', [host, JSON.stringify(absent.map(row => row.meal_id))]);
    batch.run(`INSERT INTO notion_connections(host_id,token_ciphertext,data_source_id,source_url,last_refreshed_at,last_error) VALUES (?,?,?,?,?,NULL) ON CONFLICT(host_id) DO UPDATE SET token_ciphertext=excluded.token_ciphertext,data_source_id=excluded.data_source_id,source_url=excluded.source_url,last_refreshed_at=excluded.last_refreshed_at,last_error=NULL`, [host, ciphertext, data.dataSourceId, data.sourceUrl, new Date().toISOString()]);
    batch.run('DELETE FROM mutation_chunks WHERE stage_id=?', [recipeStage.id]);
    batch.run('DELETE FROM mutation_stages WHERE id=?', [recipeStage.id]);
    batch.run('DELETE FROM notion_leases WHERE host_id=? AND token=?', [host, lease.token]);
    await batch.commit();
    return { ...await status(host), added, updated, removed };
}
function fail(res: Response, error: unknown) { if (error instanceof NotionError || error instanceof ConflictError) {
    res.status(error.status).json({ error: error.message });
    return;
} res.status(500).json({ error: 'Could not save the Notion connection or recipes. Reload your recipes to confirm the saved state before trying again.' }); }
router.get('/', async (req, res) => { res.json(await status(req.session.hostId!)); });
router.put('/', async (req, res) => {
    const host = req.session.hostId!;
    if (!req.body || typeof req.body.token !== 'string' || !req.body.token.trim() || req.body.token.length > 4096 || typeof req.body.source !== 'string' || !req.body.source.trim() || req.body.source.length > 2000) {
        res.status(400).json({ error: 'Enter your Notion token and recipe database link.' });
        return;
    }
    let lease: Lease | undefined;
    try {
        lease = await acquire(host);
        const encrypted = encryptNotionToken(req.body.token.trim(), host);
        const data = await readNotionRecipes(req.body.token.trim(), req.body.source.trim());
        res.json(await applyRecipes(host, lease, data, encrypted));
    }
    catch (error) {
        fail(res, error);
    }
    finally {
        if (lease) {
            try { await runQuery('DELETE FROM notion_leases WHERE host_id=? AND token=?', [host, lease.token]); }
            catch { /* Expiry releases a failed cleanup; preserve the accepted response. */ }
        }
    }
});
router.post('/refresh', async (req, res) => {
    const host = req.session.hostId!;
    let lease: Lease | undefined;
    try {
        lease = await acquire(host);
        const saved = await connection(host);
        if (!saved) {
            res.status(400).json({ error: 'Connect your Notion recipe database first.' });
            return;
        }
        const data = await readNotionRecipes(decryptNotionToken(saved.token_ciphertext, host), saved.data_source_id);
        if (data.dataSourceId !== saved.data_source_id)
            throw new NotionError('Notion returned a different recipe collection. Your saved recipes are unchanged.');
        data.sourceUrl = saved.source_url;
        res.json(await applyRecipes(host, lease, data, saved.token_ciphertext, saved));
    }
    catch (error) {
        fail(res, error);
    }
    finally {
        if (lease) {
            try { await runQuery('DELETE FROM notion_leases WHERE host_id=? AND token=?', [host, lease.token]); }
            catch { /* Expiry releases a failed cleanup; preserve the accepted response. */ }
        }
    }
});
router.delete('/', async (req, res) => { const host = req.session.hostId!; try {
    const active = await getOne("SELECT host_id FROM notion_leases WHERE host_id=? AND expires>CAST((julianday('now')-2440587.5)*86400000 AS INTEGER)", [host]);
    if (active)
        throw new NotionError('A Notion request is already in progress. Wait for it to finish.', 409);
    const revision = await libraryRevision(host);
    const batch = new Mutation();
    batch.library(host, revision);
    batch.run('DELETE FROM notion_leases WHERE host_id=?', [host]);
    batch.run('DELETE FROM notion_connections WHERE host_id=?', [host]);
    await batch.commit();
    res.json(await status(host));
}
catch (error) {
    fail(res, error);
} });
export default router;
