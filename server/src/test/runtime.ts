import { randomUUID, createHash } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { withRuntime, RuntimeEnv, D1Database } from '../db/schema';
import type { readNotionRecipes } from '../services/notion-reader';
const root = path.resolve(process.env.MEALMATCH_TEST_ROOT || path.join(__dirname, '../../..'));
const dynamicImport = (name: string): Promise<any> => import(/* @vite-ignore */ name);
let provider: typeof readNotionRecipes | undefined;
export function configureNotionFixture(value: typeof readNotionRecipes) { provider = value; }
let fixture: Promise<any> | undefined;
// A binding belongs to one emulator instance. Reuse it during that instance's
// lifetime instead of repeatedly crossing the Node RPC bridge for every query;
// restart creates a new key and therefore cannot reuse a poisoned old stub.
const runtimeEnvironments = new WeakMap<object, Promise<RuntimeEnv>>();
let dataset: Awaited<ReturnType<typeof readNotionRecipes>> | undefined;
const networkDiagnostics: {
    endpoints: string[];
    failure?: string;
} = { endpoints: [] };
export function notionFixtureDiagnostics() { return networkDiagnostics; }
const rich = (plain_text: string) => [{ plain_text }];
const uuid = (seed: string) => { const h = createHash('sha256').update(seed).digest('hex'); return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`; };
// Real Notion HTTP protocol fixture. Route tests control synthetic source data;
// the bundled production parser still validates every response and replay.
async function notionTransport(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const endpoint = url.pathname.replace('/v1', '');
    networkDiagnostics.endpoints.push(endpoint);
    try {
        if (/^\/data_sources\/[^/]+$/.test(endpoint)) {
            if (!provider)
                throw new Error('Synthetic upstream provider not configured');
            if (!dataset)
                dataset = await provider(request.headers.get('authorization')?.replace('Bearer ', '') || '', endpoint.split('/')[2]);
            return Response.json({ object: 'data_source', id: dataset.dataSourceId, properties: { Name: { type: 'title' } } });
        }
        if (!dataset)
            throw new Error('No active fixture');
        const data = dataset;
        const pages = data.recipes.map(recipe => ({ object: 'page', id: recipe.pageId, parent: { type: 'data_source_id', data_source_id: data.dataSourceId }, last_edited_time: '2026-10-20T00:00:00Z', properties: { Name: { type: 'title', title: rich(recipe.title) } } }));
        const list = (results: unknown[]) => Response.json({ object: 'list', results, has_more: false, next_cursor: null });
        if (endpoint.endsWith('/query'))
            return list(pages);
        const blockId = endpoint.split('/')[2];
        for (const recipe of data.recipes) {
            const table = uuid(recipe.pageId + ':table');
            const block = (type: string, value: unknown, index: number, children = false) => ({ object: 'block', id: uuid(recipe.pageId + ':' + index), type, has_children: children, [type]: value });
            if (blockId === recipe.pageId) {
                const lines = recipe.instructions.split('\n\n');
                const instructionBlocks = lines.map((line, index) => line.startsWith('### ') ? block('heading_3', { rich_text: rich(line.slice(4)) }, index + 10) : /^\d+\. /.test(line) ? block('numbered_list_item', { rich_text: rich(line.replace(/^\d+\. /, '')) }, index + 10) : line.startsWith('- ') ? block('bulleted_list_item', { rich_text: rich(line.slice(2)) }, index + 10) : block('paragraph', { rich_text: rich(line) }, index + 10));
                return list([block('heading_2', { rich_text: rich('Ingredients') }, 0), { ...block('table', { table_width: 2, has_column_header: true, has_row_header: false }, 1, true), id: table }, block('heading_2', { rich_text: rich('Instructions') }, 2), ...instructionBlocks]);
            }
            if (blockId === table)
                return list([{ amount: 'Amount', ingredient: 'Ingredient' }, ...recipe.ingredients].map((row, index) => block('table_row', { cells: [rich(row.amount), rich(row.ingredient)] }, 100 + index)));
        }
        return new Response('missing synthetic resource', { status: 404 });
    }
    catch (error) {
        networkDiagnostics.failure = error instanceof Error ? error.name + ': ' + error.message : 'Unknown synthetic fixture failure';
        return new Response('synthetic upstream failure', { status: 503, headers: { 'retry-after': '0' } });
    }
}
export function resetNotionFixture(): void { dataset = undefined; networkDiagnostics.endpoints = []; delete networkDiagnostics.failure; }
export async function testFixture() {
    fixture ??= (async () => {
        const { startLocalWorker } = await dynamicImport(pathToFileURL(path.join(root, 'scripts/worker-local.mjs')).href);
        const directory = path.join(root, '.verification', `unit-${randomUUID()}`);
        const template = process.env.MEALMATCH_TEST_EMPTY_STATE;
        const initializeState = template ? async (candidate: { sourceSha256: string }) => {
            const { cloneEmptyTestState } = await dynamicImport(pathToFileURL(path.join(root, 'scripts/test-state.mjs')).href);
            await cloneEmptyTestState(root, template, directory, { verifiedSourceSha256: candidate.sourceSha256 });
        } : undefined;
        return startLocalWorker({ root, directory, migrate: !template, initializeState, bundleDirectory: process.env.MEALMATCH_TEST_BUNDLE || path.join(root, '.verification/release-bundle'), secrets: { SESSION_SECRET: 'synthetic-local-unit-session-secret-over-32-characters', NOTION_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64') }, outboundService: notionTransport });
    })();
    return fixture;
}
export async function testEnv(): Promise<RuntimeEnv> {
    const active = await testFixture();
    let environment = runtimeEnvironments.get(active.runtime);
    if (!environment) {
        environment = active.runtime.getD1Database('DB').then((DB: D1Database) => ({ ...active.secrets, DB } as RuntimeEnv));
        runtimeEnvironments.set(active.runtime, environment!);
    }
    return environment!;
}
export async function inTestRuntime<T>(action: () => T): Promise<Awaited<T>> { return await withRuntime(await testEnv(), action) as Awaited<T>; }
export async function closeTestFixture() { if (fixture) {
    const active = await fixture;
    await active.runtime.dispose();
    fixture = undefined;
} }
export async function restartTestFixture() { if (!fixture)
    return; const active = await fixture; await active.runtime.dispose(); fixture = undefined; const { startLocalWorker } = await dynamicImport(pathToFileURL(path.join(root, 'scripts/worker-local.mjs')).href); fixture = startLocalWorker({ root, directory: active.directory, migrate: false, secrets: active.secrets, outboundService: notionTransport }); return fixture; }
export async function databaseView() { return { async exec(sql: string) { const env = await testEnv(); const result = await env.DB.prepare(sql).all<Record<string, unknown>>(); const rows = result.results; const columns = rows.length ? Object.keys(rows[0]) : []; return [{ columns, values: rows.map(row => columns.map(column => row[column])) }]; }, close() { } }; }
export async function reopenD1() { await restartTestFixture(); return databaseView(); }
