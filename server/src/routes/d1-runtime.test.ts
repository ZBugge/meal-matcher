import { beforeAll, describe, expect, it } from 'vitest';
import { randomUUID, createHash } from 'node:crypto';
import { startHttpTestServer, HttpTestServer, HttpTestClient, createQuickFixture } from '../test/http';
import { getAll, getOne, runQuery } from '../test/db';
import { inTestRuntime, restartTestFixture, testEnv } from '../test/runtime';
import { Mutation, libraryRevision, stageRows, publishRows, storedText, statement, withRuntime } from '../db/schema';
describe('Distributed D1 runtime invariants', () => {
    let server: HttpTestServer, owner: HttpTestClient, stranger: HttpTestClient, host: string;
    beforeAll(async () => { server = await startHttpTestServer(); owner = server.client(); stranger = server.client(); host = (await owner.request('/auth/register', 'POST', { email: `${randomUUID()}@example.test`, password: 'synthetic-password' })).body.id; expect(host).toBeTypeOf('string'); expect((await stranger.request('/auth/register', 'POST', { email: `${randomUUID()}@example.test`, password: 'synthetic-password' })).status).toBe(201); });
    const create = async (title = randomUUID()) => { const response = await owner.request('/meals', 'POST', { title }); expect(response.status).toBe(201); return response.body; };
    const importOptions = (options: unknown[]) => owner.request('/meals/import', 'POST', { data: { version: 1, options }, dryRun: false });
    it('confirms a durable batch receipt after a lost acknowledgement without repeating its writes', async () => {
        const env = await testEnv();
        const id = randomUUID();
        let batches = 0;
        const uncertain = { ...env, DB: { prepare: (sql: string) => env.DB.prepare(sql), async batch(statements: Parameters<typeof env.DB.batch>[0]) { batches++; await env.DB.batch(statements); throw new Error('Synthetic lost acknowledgement'); } } };
        await withRuntime(uncertain, async () => { const batch = new Mutation(); batch.run('INSERT INTO meals(id,host_id,title) VALUES (?,?,?)', [id, host, 'Accepted once']); await batch.commit(); await batch.commit(); });
        expect(batches).toBe(2);
        expect(await getOne('SELECT title FROM meals WHERE id=?', [id])).toEqual({ title: 'Accepted once' });
    });
    it('rejects a duplicate registration racing after password hashing', async () => {
        const email = `${randomUUID()}@example.test`;
        const clients = [server.client(), server.client()];
        const responses = await Promise.all(clients.map(client => client.request('/auth/register', 'POST', { email, password: 'synthetic-password' })));
        expect(responses.map(response => response.status).sort()).toEqual([201, 400]);
        expect(await getOne('SELECT COUNT(*) AS count FROM hosts WHERE email=?', [email])).toEqual({ count: 1 });
    });
    it('rotates and persists auth identifiers, revokes old cookies, and rejects cross-origin mutation', async () => {
        const client = server.client();
        const email = `${randomUUID()}@example.test`;
        expect((await client.request('/auth/register', 'POST', { email, password: 'synthetic-password' })).status).toBe(201);
        const old = client.getCookie();
        expect((await client.request('/auth/login', 'POST', { email, password: 'synthetic-password' })).status).toBe(200);
        expect(client.getCookie()).not.toBe(old);
        const stale = server.client();
        stale.setCookie(old);
        expect((await stale.request('/auth/me')).status).toBe(401);
        expect((await client.request('/meals', 'POST', { title: 'Cross-origin blocked' }, { origin: 'https://untrusted.invalid' })).status).toBe(403);
        await restartTestFixture();
        expect((await client.request('/auth/me')).status).toBe(200);
        expect((await client.request('/auth/logout', 'POST')).status).toBe(200);
        expect((await client.request('/auth/me')).status).toBe(401);
    });
    it('guards stale library revisions and sealed owner/digest/completeness manifests atomically', async () => {
        await inTestRuntime(async () => {
            const revision = await libraryRevision(host);
            const meal = await create();
            const stale = new Mutation();
            stale.library(host, revision);
            stale.run('UPDATE meals SET title=? WHERE id=?', ['Rejected stale title', meal.id]);
            await expect(stale.commit()).rejects.toThrow();
            expect((await owner.request(`/meals/${meal.id}`)).body.title).toBe(meal.title);
            const stage = await stageRows(host, [{ id: randomUUID(), title: 'Private staged option' }]);
            expect((await owner.request('/meals')).body.some((row: {
                title: string;
            }) => row.title === 'Private staged option')).toBe(false);
            for (const invalid of [{ ...stage, owner: randomUUID() }, { ...stage, digest: '0'.repeat(64) }]) {
                const batch = new Mutation();
                batch.library(host, await libraryRevision(host));
                publishRows(batch, invalid, `INSERT INTO meals(id,host_id,title) SELECT json_extract(j.value,'$.id'),?,json_extract(j.value,'$.title') FROM $ROWS WHERE $STAGE`, [host]);
                await expect(batch.commit()).rejects.toThrow();
            }
            const missing = randomUUID();
            await runQuery('INSERT INTO mutation_stages(id,owner,expected_chunks,expected_rows,digest,expires,sealed) VALUES (?,?,2,2,?,?,1)', [missing, host, 'missing-chunk', Date.now() + 60000]);
            const batch = new Mutation();
            publishRows(batch, { id: missing, owner: host, chunks: 2, rows: 2, digest: 'missing-chunk' }, `INSERT INTO meals(id,host_id,title) SELECT json_extract(j.value,'$.id'),?,json_extract(j.value,'$.title') FROM $ROWS WHERE $STAGE`, [host]);
            await expect(batch.commit()).rejects.toThrow();
            await runQuery('UPDATE mutation_stages SET expires=? WHERE id=?', [Date.now() - 10, stage.id]);
            const expired = new Mutation();
            publishRows(expired, stage, `INSERT INTO meals(id,host_id,title) SELECT json_extract(j.value,'$.id'),?,json_extract(j.value,'$.title') FROM $ROWS WHERE $STAGE`, [host]);
            await expect(expired.commit()).rejects.toThrow();
        });
    });
    it('serializes competing final selections and both close routes exactly once', async () => {
        const quick = await owner.request('/quick-session', 'POST', { creatorName: 'Host', meals: [{ title: 'One' }, { title: 'Two' }] });
        expect(quick.status).toBe(200);
        const id = quick.body.session.id;
        const token = (await getOne<{
            creator_token: string;
        }>('SELECT creator_token FROM meals WHERE id=?', [quick.body.meals[0].id]))!.creator_token;
        const closed = await Promise.all([owner.request(`/sessions/${id}/close`, 'POST', {}), server.client().request(`/close-session/${id}`, 'POST', { creatorToken: token })]);
        expect(closed.map(row => row.status).sort()).toEqual([200, 400]);
        const responses = await Promise.all(quick.body.meals.map((meal: {
            id: string;
        }) => owner.request(`/sessions/${id}/select`, 'POST', { mealId: meal.id })));
        expect(responses.map(row => row.status).sort()).toEqual([200, 409]);
        expect(await getOne('SELECT COUNT(*) AS count FROM session_history WHERE session_id=?', [id])).toEqual({ count: 1 });
        const selected = (await getOne<{
            selected_meal_id: string;
        }>('SELECT selected_meal_id FROM sessions WHERE id=?', [id]))!.selected_meal_id;
        expect((await owner.request(`/sessions/${id}/select`, 'POST', { mealId: selected })).status).toBe(200);
        expect(await getOne('SELECT SUM(pick_count) AS count FROM meals WHERE id IN (SELECT meal_id FROM session_meals WHERE session_id=?)', [id])).toEqual({ count: 1 });
    });
    it('accepts a complete ballot before close or preserves the prior complete ballot after close', async () => {
        const client = server.client();
        const quick = await createQuickFixture(client);
        const ballot = (vote: number) => ({ participantId: quick.participantId, swipes: quick.meals.map(meal => ({ mealId: meal.id, vote })) });
        expect((await client.request(`/swipes/${quick.session.id}`, 'POST', ballot(1))).status).toBe(200);
        const [replacement, closed] = await Promise.all([client.request(`/swipes/${quick.session.id}`, 'POST', ballot(2)), client.request(`/close-session/${quick.session.id}`, 'POST', { creatorToken: quick.creatorToken })]);
        expect(closed.status).toBe(200);
        expect([200, 400]).toContain(replacement.status);
        expect(await getAll('SELECT vote FROM swipes WHERE participant_id=? ORDER BY session_meal_id', [quick.participantId])).toEqual([{ vote: replacement.status === 200 ? 2 : 1 }, { vote: replacement.status === 200 ? 2 : 1 }]);
    });
    it('accepts the exact near-5MiB import with 169122 ordered ingredients without exposing partials', async () => {
        const ingredients = Array.from({ length: 169122 }, () => ({ amount: '', ingredient: 'a' }));
        const body = { data: { version: 1, options: [{ title: 'x', type: 'meal', ingredients }] }, dryRun: false };
        expect(Buffer.byteLength(JSON.stringify(body))).toBe(5242875);
        const response = await owner.request('/meals/import', 'POST', body);
        expect(response.status, response.body.error).toBe(200);
        expect(response.body.imported).toBe(1);
        const meal = (await getAll<{
            id: string;
            title: string;
        }>('SELECT id,title FROM meals WHERE host_id=?', [host])).find(row => row.title === 'x')!;
        expect(await getOne('SELECT COUNT(*) AS count, MIN(display_order) AS first, MAX(display_order) AS last FROM meal_ingredients WHERE meal_id=?', [meal.id])).toEqual({ count: 169122, first: 0, last: 169121 });
        const recipe = await owner.request(`/meals/${meal.id}`);
        expect(recipe.body.ingredients).toHaveLength(169122);
        expect(recipe.body.ingredients[0]).toEqual({ amount: '', ingredient: 'a' });
        expect(recipe.body.ingredients.at(-1)).toEqual({ amount: '', ingredient: 'a' });
    }, 30000);
    it('reconstructs oversized Unicode fields and combined rows through private/public and planning snapshots', async () => {
        const instructions = 'Head\ufeff\u0000' + '😀'.repeat(550000) + 'tail';
        const title = randomUUID();
        expect(Buffer.byteLength(instructions)).toBeGreaterThan(2200000);
        expect((await importOptions([{ title, type: 'meal', instructions, ingredients: [{ amount: '1\u0000 cup', ingredient: 'Beans\u0000and greens' }] }])).status).toBe(200);
        const meal = (await getAll<{
            id: string;
            title: string;
        }>('SELECT id,title FROM meals WHERE host_id=?', [host])).find(row => row.title === title)!;
        const full = await owner.request(`/meals/${meal.id}`);
        expect(full.body.instructions).toBe(instructions);
        expect(full.body.ingredients).toEqual([{ amount: '1\u0000 cup', ingredient: 'Beans\u0000and greens' }]);
        const largeTitle = 'T'.repeat(2200000);
        expect((await importOptions([{ title: largeTitle, type: 'meal' }])).status).toBe(200);
        const publicMeal = (await getAll<{
            id: string;
            title: string;
        }>('SELECT id,title FROM meals WHERE host_id=?', [host])).find(row => row.title === largeTitle)!;
        const session = await owner.request('/sessions', 'POST', { mealIds: [publicMeal.id] });
        const visitor = server.client();
        const joined = await visitor.request(`/join/${session.body.inviteCode}`, 'POST', { displayName: 'Guest' });
        expect(joined.body.meals[0].title).toBe(largeTitle);
        expect(JSON.stringify(joined.body)).not.toContain('instructions');
        await visitor.request(`/swipes/${session.body.id}`, 'POST', { participantId: joined.body.participantId, swipes: [{ mealId: publicMeal.id, vote: 1 }] });
        await owner.request(`/sessions/${session.body.id}/close`, 'POST');
        expect((await visitor.request(`/results/${session.body.id}`)).body.results[0].title).toBe(largeTitle);
        await owner.request(`/sessions/${session.body.id}/select`, 'POST', { mealId: publicMeal.id });
        expect((await visitor.request(`/results/${session.body.id}`)).body.selectedMeal.title).toBe(largeTitle);
        expect((await owner.request('/sessions')).body.find((row: {
            id: string;
        }) => row.id === session.body.id).selectedMeal.title).toBe(largeTitle);
        const combined = { title: 'C'.repeat(1050000), type: 'meal', description: 'D'.repeat(1050000), instructions: 'I'.repeat(1050000), notes: 'N'.repeat(1050000), ingredients: [{ amount: 'A'.repeat(300000), ingredient: 'G'.repeat(300000) }] };
        expect((await importOptions([combined])).status).toBe(200);
        const combinedMeal = (await getAll<{
            id: string;
            title: string;
        }>('SELECT id,title FROM meals WHERE host_id=?', [host])).find(row => row.title === combined.title)!;
        const plan = await owner.request('/plans/2026-11-02/entries', 'POST', { mealId: combinedMeal.id });
        expect(plan.status).toBe(201);
        expect(plan.body.entries[0].title).toBe(combined.title);
        expect(plan.body.shopping[0]).toMatchObject({ sourceTitle: combined.title, ...combined.ingredients[0] });
        expect((await owner.request(`/meals/${combinedMeal.id}`, 'PATCH', { title: 'Edited later', ingredients: [] })).status).toBe(200);
        expect((await owner.request('/plans/2026-11-02')).body).toEqual(plan.body);
        const repeat = await owner.request('/plans/2026-11-02/repeat', 'POST', { targetWeek: '2026-11-09', entryIds: [plan.body.entries[0].id] });
        expect(repeat.status).toBe(201);
        expect(repeat.body.entries[0].title).toBe(combined.title);
        expect(repeat.body.shopping[0]).toMatchObject({ sourceTitle: combined.title, ...combined.ingredients[0] });
    }, 30000);
    it('round-trips literal reference-like input without reading another account private chunks', async () => {
        const privateText = 'Host private recipe content '.repeat(2000);
        const pointer = (await inTestRuntime(() => storedText(privateText, host)))!;
        const created = await stranger.request('/meals', 'POST', { title: pointer, instructions: pointer, ingredients: [{ amount: pointer, ingredient: pointer }] });
        expect(created.status).toBe(201);
        expect(created.body).toMatchObject({ title: pointer, instructions: pointer, ingredients: [{ amount: pointer, ingredient: pointer }] });
        expect(JSON.stringify(created.body)).not.toContain(privateText);
        expect((await stranger.request(`/meals/${created.body.id}`, 'PATCH', { notes: pointer })).body.notes).toBe(pointer);
        const patchedRecipe = await stranger.request(`/meals/${created.body.id}`, 'PATCH', { ingredients: [{ amount: pointer, ingredient: pointer }] });
        expect(patchedRecipe.status).toBe(200);
        expect(patchedRecipe.body.ingredients).toEqual([{ amount: pointer, ingredient: pointer }]);
        expect(JSON.stringify(patchedRecipe.body)).not.toContain(privateText);
        const rereadRecipe = await stranger.request(`/meals/${created.body.id}`);
        expect(rereadRecipe.status).toBe(200);
        expect(rereadRecipe.body.ingredients).toEqual([{ amount: pointer, ingredient: pointer }]);
        expect(JSON.stringify(rereadRecipe.body)).not.toContain(privateText);
        const quick = await server.client().request('/quick-session', 'POST', { creatorName: pointer, meals: [{ title: pointer, description: pointer }] });
        expect(quick.status).toBe(200);
        const joined = await server.client().request(`/join/${quick.body.session.inviteCode}`, 'POST', { displayName: pointer });
        expect(joined.body.meals[0]).toMatchObject({ title: pointer, description: pointer });
        expect((await stranger.request('/plans/2026-11-16/entries', 'POST', { kind: 'takeout', title: pointer })).body.entries[0].title).toBe(pointer);
        expect((await stranger.request('/plans/2026-11-16/items', 'POST', { ingredient: pointer })).body.shopping[0].ingredient).toBe(pointer);
        const recurring = await stranger.request('/plans/2026-11-16/recurring', 'POST', { ingredient: pointer, amount: '' });
        expect(recurring.body.ingredient).toBe(pointer);
        const patchedRecurring = await stranger.request(`/plans/2026-11-16/recurring/${recurring.body.id}`, 'PATCH', { ingredient: pointer, amount: '' });
        expect(patchedRecurring.status).toBe(200);
        expect(patchedRecurring.body.ingredient).toBe(pointer);
        const rereadRecurring = await stranger.request('/plans/2026-11-16/recurring');
        expect(rereadRecurring.status).toBe(200);
        expect(rereadRecurring.body.find((row: { id: string }) => row.id === recurring.body.id).ingredient).toBe(pointer);
        expect(JSON.stringify(rereadRecurring.body)).not.toContain(privateText);
        expect((await stranger.request('/plans/2026-11-16/recurring/apply', 'POST', { ids: [recurring.body.id] })).body.shopping.every((row: {
            ingredient: string;
        }) => row.ingredient === pointer)).toBe(true);
        await expect(inTestRuntime(async () => { await statement('UPDATE text_chunks SET value=? WHERE ref=?', ['Rejected', pointer.split(':')[2]]).run(); })).rejects.toThrow('Immutable');
        const short = await stranger.request('/meals', 'POST', { title: 'Short\u0000title', description: 'Middle\ufeffand\u0000tail' });
        expect(short.body).toMatchObject({ title: 'Short\u0000title', description: 'Middle\ufeffand\u0000tail' });
        const aliasText = 'Alias\u0000title'.repeat(4000);
        const alias = await inTestRuntime(async () => { const title = await storedText(aliasText, host); return getAll('SELECT ? AS meal_title, ? AS meal_description, ? AS selected_meal_title', [title, title, title]); });
        expect(alias).toEqual([{ meal_title: aliasText, meal_description: aliasText, selected_meal_title: aliasText }]);
        const mismatched = pointer.slice(0, -64) + '0'.repeat(64);
        await expect(getAll('SELECT ? AS title', [mismatched])).rejects.toThrow('Incomplete immutable text');
    });
    it('applies 500 recurring templates, updates 1000 shopping items, and repeats 500 entries atomically', async () => {
        const templates = Array.from({ length: 500 }, (_, index) => ({ id: randomUUID(), ingredient: `Usual ${index}`, amount: 'a free-text handful' }));
        await runQuery(`INSERT INTO recurring_groceries(id,host_id,ingredient,amount) SELECT json_extract(value,'$.id'),?,json_extract(value,'$.ingredient'),json_extract(value,'$.amount') FROM json_each(?)`, [host, JSON.stringify(templates)]);
        const applied = await owner.request('/plans/2026-12-07/recurring/apply', 'POST', { ids: templates.map(row => row.id).reverse() });
        expect(applied.status).toBe(200);
        expect(applied.body.shopping).toHaveLength(500);
        expect(applied.body.shopping[0].ingredient).toBe('Usual 499');
        const entries = Array.from({ length: 500 }, () => ({ id: randomUUID(), item: randomUUID() }));
        await runQuery(`INSERT INTO plan_entries(id,host_id,week,kind,title) SELECT json_extract(value,'$.id'),?,'2026-12-07','home','Snapshot' FROM json_each(?)`, [host, JSON.stringify(entries)]);
        await runQuery(`INSERT INTO shopping_items(id,host_id,week,entry_id,ingredient,amount) SELECT json_extract(value,'$.item'),?,'2026-12-07',json_extract(value,'$.id'),'Beans','two cans' FROM json_each(?)`, [host, JSON.stringify(entries)]);
        const ids = [...applied.body.shopping.map((row: {
                id: string;
            }) => row.id), ...entries.map(row => row.item)];
        expect(ids).toHaveLength(1000);
        const bulk = await owner.request('/plans/2026-12-07/items/bulk', 'POST', { ids, state: 'bought' });
        expect(bulk.status).toBe(200);
        expect(bulk.body.shopping.every((row: {
            state: string;
        }) => row.state === 'bought')).toBe(true);
        const repeated = await owner.request('/plans/2026-12-07/repeat', 'POST', { targetWeek: '2026-12-14', entryIds: entries.map(row => row.id) });
        expect(repeated.status).toBe(201);
        expect(repeated.body.entries).toHaveLength(500);
        expect(repeated.body.shopping).toHaveLength(500);
        expect(repeated.body.shopping.every((row: {
            state: string;
        }) => row.state === 'needed')).toBe(true);
        expect((await owner.request('/plans/2026-12-07/recurring/apply', 'POST', { ids: templates.map(row => row.id) })).body.shopping.filter((row: {
            state: string;
        }) => row.state === 'bought')).toHaveLength(1000);
    }, 15000);
    it('normalizes trusted provider IPs, ignores forwarded identity, and persists shared account abuse limits', async () => {
        const client = server.client();
        for (const ip of ['2001:0DB8:0:0:0:0:0:1', '2001:db8::1'])
            expect((await client.request('/auth/login', 'POST', { email: 'nobody@invalid.test', password: 'bad' }, { 'cf-connecting-ip': ip, 'x-forwarded-for': randomUUID() })).status).toBe(401);
        const key = createHash('sha256').update('auth:ip:2001:db8::1').digest('hex');
        expect(await getOne('SELECT key FROM abuse_windows WHERE key=?', [key])).toEqual({ key });
        const target = `${randomUUID()}@invalid.test`;
        let rejected = false;
        for (let index = 0; index < 41; index++) {
            const response = await client.request('/auth/login', 'POST', { email: target, password: 'bad' }, { 'cf-connecting-ip': `198.18.0.${index + 1}` });
            if (response.status === 429) {
                rejected = true;
                break;
            }
            expect(response.status).toBe(401);
        }
        expect(rejected).toBe(true);
        await restartTestFixture();
        expect(await getOne('SELECT key FROM abuse_windows WHERE key=?', [key])).toEqual({ key });
    });
});
