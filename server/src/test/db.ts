import * as schema from '../db/schema';
import { inTestRuntime, testEnv } from './runtime';
export async function initializeDatabase() { return (await testEnv()).DB; }
export const getDatabase = initializeDatabase;
export function getOne<T>(sql: string, params: unknown[] = []) { return inTestRuntime(() => schema.getOne<T>(sql, params)); }
export function getAll<T>(sql: string, params: unknown[] = []) { return inTestRuntime(() => schema.getAll<T>(sql, params)); }
export function runQuery(sql: string, params: unknown[] = []) { return inTestRuntime(() => schema.runQuery(sql, params)); }
export async function failWrites(table: string, event = 'INSERT') {
    if (!/^[a-z_]+$/.test(table) || !['INSERT', 'UPDATE', 'DELETE'].includes(event))
        throw new Error('Unsafe failure fixture');
    await runQuery(`CREATE TRIGGER synthetic_failure BEFORE ${event} ON ${table} BEGIN SELECT RAISE(ABORT,'Synthetic late D1 failure'); END`);
    return async () => { await runQuery('DROP TRIGGER synthetic_failure'); };
}
export async function databaseSnapshot(tables: string[]) { return Promise.all(tables.map(async (table) => { if (!/^[a-z_]+$/.test(table))
    throw new Error('Unsafe table'); return getAll(`SELECT * FROM ${table} ORDER BY rowid`); })); }
export async function commitFailure() { const restore = await failWrites('mutation_receipts'); return { mockRestore: restore }; }
export async function observeMutations() { let before = (await getOne<{
    count: number;
}>('SELECT COUNT(*) AS count FROM mutation_receipts'))!.count; return { async calls() { return (await getOne<{
        count: number;
    }>('SELECT COUNT(*) AS count FROM mutation_receipts'))!.count - before; }, async mockClear() { before = (await getOne<{
        count: number;
    }>('SELECT COUNT(*) AS count FROM mutation_receipts'))!.count; }, mockRestore() { } }; }
export async function clearFailure() { await runQuery('DROP TRIGGER IF EXISTS synthetic_failure'); }
