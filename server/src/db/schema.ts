import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash, randomUUID } from 'node:crypto';
export interface D1Result<T = Record<string, unknown>> {
    results: T[];
    success: boolean;
    meta: {
        changes: number;
    };
}
export interface D1Statement {
    bind(...values: unknown[]): D1Statement;
    all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
    first<T = Record<string, unknown>>(): Promise<T | null>;
    run(): Promise<D1Result>;
}
export interface D1Database {
    prepare(sql: string): D1Statement;
    batch<T = Record<string, unknown>>(statements: D1Statement[]): Promise<D1Result<T>[]>;
}
export interface RuntimeEnv {
    DB: D1Database;
    SESSION_SECRET: string;
    NOTION_ENCRYPTION_KEY?: string;
}
const context = new AsyncLocalStorage<RuntimeEnv>();
export function withRuntime<T>(env: RuntimeEnv, action: () => T): T { return context.run(env, action); }
export function runtime(): RuntimeEnv { const env = context.getStore(); if (!env)
    throw new Error('Missing request database context'); return env; }
export function getDatabase(): D1Database { return runtime().DB; }
export async function initializeDatabase(): Promise<D1Database> { return getDatabase(); }
export function statement(sql: string, params: unknown[] = []): D1Statement { return getDatabase().prepare(sql).bind(...params.map(value => value === undefined ? null : value)); }
// Immutable references survive library, result and planning projections. Hydration
// runs only after SQL selected the columns permitted for that response.
const PREFIX = '\u001fmealmatch:text:';
export async function storedText(value: string | null | undefined, owner: string): Promise<string | null> {
    if (value == null)
        return null;
    if (Buffer.byteLength(value, 'utf8') <= 32768 && !value.startsWith(PREFIX))
        return value;
    const ref = randomUUID();
    const chunks: string[] = [];
    let part = '';
    let bytes = 0;
    for (const point of value) {
        const size = Buffer.byteLength(point);
        if (bytes + size > 65536) {
            chunks.push(part);
            part = '';
            bytes = 0;
        }
        part += point;
        bytes += size;
    }
    chunks.push(part);
    const digest = createHash('sha256').update(value).digest('hex');
    for (let offset = 0; offset < chunks.length; offset += 30)
        await getDatabase().batch(chunks.slice(offset, offset + 30).map((chunk, index) => statement('INSERT INTO text_chunks(ref, owner, ordinal, value, digest, chunk_count) VALUES (?, ?, ?, ?, ?, ?)', [ref, owner, offset + index, chunk, digest, chunks.length])));
    return PREFIX + ref + ':' + digest;
}
const storedFields = new Set(['title', 'description', 'instructions', 'notes', 'amount', 'ingredient', 'sourceTitle', 'source_title', 'selected_meal_title', 'meal_title', 'meal_description']);
const reference = (value: unknown): value is string => typeof value === 'string' && /^\u001fmealmatch:text:[a-f0-9-]{36}:[a-f0-9]{64}$/.test(value);
async function hydrate<T>(rows: T[]): Promise<T[]> {
    const pointers = rows.flatMap(row => Object.entries(row as object).filter(([key, value]) => storedFields.has(key) && reference(value)).map(([, value]) => value as string));
    const refs = [...new Set(pointers.map(value => value.slice(PREFIX.length).split(':')[0]))];
    if (!refs.length)
        return rows;
    const chunks = (await statement('SELECT ref, ordinal, value, digest, chunk_count FROM text_chunks WHERE ref IN (SELECT value FROM json_each(?)) ORDER BY ref, ordinal', [JSON.stringify(refs)]).all<{
        ref: string;
        ordinal: number;
        value: string;
        digest: string;
        chunk_count: number;
    }>()).results;
    const values = new Map<string, string>();
    for (const ref of refs) {
        const found = chunks.filter(row => row.ref === ref);
        const value = found.map(row => row.value).join('');
        if (!found.length || pointers.filter(pointer => pointer.slice(PREFIX.length).split(':')[0] === ref).some(pointer => pointer.split(':').at(-1) !== found[0].digest) || found.length !== found[0].chunk_count || found.some((row, index) => row.ordinal !== index || row.digest !== found[0].digest) || createHash('sha256').update(value).digest('hex') !== found[0].digest)
            throw new Error('Incomplete immutable text');
        values.set(ref, value);
    }
    return rows.map(row => Object.fromEntries(Object.entries(row as object).map(([key, value]) => [key, storedFields.has(key) && reference(value) ? values.get(value.slice(PREFIX.length).split(':')[0]) : value])) as T);
}
export async function getAll<T>(sql: string, params: unknown[] = []): Promise<T[]> { return hydrate((await statement(sql, params).all<T>()).results); }
export async function getOne<T>(sql: string, params: unknown[] = []): Promise<T | undefined> { return (await getAll<T>(sql, params))[0]; }
export async function runQuery(sql: string, params: unknown[] = []): Promise<D1Result> { return statement(sql, params).run(); }
export class ConflictError extends Error {
    status = 409;
}
// Describes one D1 batch transaction; no reads, awaits or interactive BEGIN.
export class Mutation {
    readonly statements: D1Statement[] = [];
    readonly receipt = randomUUID();
    run(sql: string, params: unknown[] = []): void { this.statements.push(statement(sql, params)); }
    assert(sql: string, params: unknown[] = []): void { const id = randomUUID(); this.run(`INSERT INTO mutation_assertions(id, ok) SELECT ?, CASE WHEN (${sql}) THEN 1 ELSE 0 END`, [id, ...params]); this.run('DELETE FROM mutation_assertions WHERE id = ?', [id]); }
    library(host: string, revision: number): void { this.run('UPDATE hosts SET library_revision = library_revision + 1 WHERE id = ? AND library_revision = ?', [host, revision]); this.assert('changes() = 1'); }
    open(session: string): void { this.assert("EXISTS(SELECT 1 FROM sessions WHERE id = ? AND status = 'open')", [session]); }
    async commit(): Promise<void> { if (!this.statements.length)
        return; try {
        await getDatabase().batch([...this.statements, statement('INSERT INTO mutation_receipts(id,created_at) VALUES (?,?)', [this.receipt, Date.now()])]);
    }
    catch (error) {
        // Resolve a lost acknowledgement using the receipt written in the same
        // transaction. Accepted state is never compensated or replayed.
        try {
            if (await statement('SELECT id FROM mutation_receipts WHERE id = ?', [this.receipt]).first()) return;
        } catch { /* Preserve the original error when confirmation is unavailable. */ }
        if (String(error).includes('mutation_assertions') || String(error).includes('CHECK constraint failed: ok'))
            throw new ConflictError('The data changed. Reload and try again.');
        throw error;
    } }
}
export async function libraryRevision(host: string): Promise<number> { const row = await getOne<{
    library_revision: number;
}>('SELECT library_revision FROM hosts WHERE id = ?', [host]); if (!row)
    throw new Error('Missing host'); return row.library_revision; }
export interface Stage {
    id: string;
    owner: string;
    chunks: number;
    rows: number;
    digest: string;
}
export async function stageRows(owner: string, rows: Iterable<Record<string, unknown>> | AsyncIterable<Record<string, unknown>>): Promise<Stage> {
    const id = randomUUID();
    const hash = createHash('sha256');
    let rowCount = 0;
    let chunkCount = 0;
    let current: Record<string, unknown>[] = [];
    let size = 2;
    let pending: D1Statement[] = [];
    await runQuery("INSERT INTO mutation_stages(id,owner,expected_chunks,expected_rows,digest,expires,sealed) VALUES (?,?,-1,-1,'',?,0)", [id, owner, Date.now() + 600000]);
    const flush = async () => {
        if (!current.length)
            return;
        const value = JSON.stringify(current);
        hash.update(value);
        pending.push(statement(`INSERT INTO mutation_chunks(stage_id,ordinal,value) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM mutation_stages WHERE id=? AND owner=? AND sealed=0 AND expires>CAST((julianday('now')-2440587.5)*86400000 AS INTEGER))`, [id, chunkCount++, value, id, owner]));
        current = [];
        size = 2;
        if (pending.length === 30) {
            await getDatabase().batch(pending);
            pending = [];
        }
    };
    for await (const row of rows) {
        const bytes = Buffer.byteLength(JSON.stringify(row));
        if (current.length && size + bytes + 1 > 131072)
            await flush();
        current.push(row);
        size += bytes + 1;
        rowCount++;
    }
    await flush();
    if (pending.length)
        await getDatabase().batch(pending);
    const digest = hash.digest('hex');
    const sealed = await runQuery(`UPDATE mutation_stages SET expected_chunks=?,expected_rows=?,digest=?,sealed=1 WHERE id=? AND owner=? AND sealed=0 AND expires>CAST((julianday('now')-2440587.5)*86400000 AS INTEGER)`, [chunkCount, rowCount, digest, id, owner]);
    if (!sealed.meta.changes)
        throw new ConflictError('The staged operation expired. Try again.');
    return { id, owner, chunks: chunkCount, rows: rowCount, digest };
}
export function publishRows(batch: Mutation, stage: Stage, sql: string, params: unknown[] = []): void {
    batch.assert(`EXISTS(SELECT 1 FROM mutation_stages s WHERE id = ? AND owner = ? AND digest = ? AND sealed=1 AND expires>CAST((julianday('now')-2440587.5)*86400000 AS INTEGER) AND expected_chunks = (SELECT COUNT(*) FROM mutation_chunks WHERE stage_id = s.id) AND expected_rows = (SELECT COALESCE(SUM(json_array_length(value)), 0) FROM mutation_chunks WHERE stage_id = s.id))`, [stage.id, stage.owner, stage.digest]);
    batch.run(sql.replace('$ROWS', 'mutation_chunks c, json_each(c.value) j').replace('$STAGE', 'c.stage_id = ?'), [...params, stage.id]);
    batch.run('DELETE FROM mutation_chunks WHERE stage_id = ?', [stage.id]);
    batch.run('DELETE FROM mutation_stages WHERE id = ?', [stage.id]);
}
