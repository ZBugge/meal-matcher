import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { getAll, getOne, runQuery } from '../test/db';
import { commitFailure, observeMutations, clearFailure, databaseSnapshot } from '../test/db';
import { reopenD1, restartTestFixture, configureNotionFixture, notionFixtureDiagnostics } from '../test/runtime';
import { startHttpTestServer, HttpTestClient, HttpTestServer } from '../test/http';
import { readNotionRecipes, NotionError, NotionRecipe } from '../services/notion-reader';
vi.mock('../services/notion-reader', async (importOriginal) => ({ ...await importOriginal<typeof import('../services/notion-reader')>(), readNotionRecipes: vi.fn() }));
const token = 'synthetic-notion-token-never-echo';
const source = '11111111-1111-4111-8111-111111111111';
const sourceUrl = `https://www.notion.so/${source.replaceAll('-', '')}`;
const fixture = (): NotionRecipe[] => ['Soup', 'Burgers', 'Salad'].map((title, index) => ({
    pageId: `${index + 2}1111111-1111-4111-8111-111111111111`,
    url: `https://www.notion.so/${index + 2}1111111111141118111111111111111`, title,
    instructions: '### Sauce\n\n1. Stir gently.\n\nRecipe notes\n\n- Keep warm.',
    ingredients: [{ amount: '1–2 cups', ingredient: 'Beans, rinsed' }, { amount: '', ingredient: 'Salt to taste' }],
}));
describe('Account-owned Notion connection and atomic refresh', () => {
    let server: HttpTestServer, owner: HttpTestClient, stranger: HttpTestClient;
    let regularId: string;
    beforeAll(async () => { server = await startHttpTestServer(); });
    afterAll(async () => { await server.close(); });
    beforeEach(async () => {
        vi.stubEnv('NOTION_ENCRYPTION_KEY', Buffer.alloc(32, 7).toString('base64'));
        vi.mocked(readNotionRecipes).mockReset();
        configureNotionFixture(readNotionRecipes);
        vi.mocked(readNotionRecipes).mockResolvedValue({ dataSourceId: source, sourceUrl, recipes: fixture() });
        owner = server.client();
        stranger = server.client();
        for (const client of [owner, stranger])
            expect((await client.request('/auth/register', 'POST', { email: `${crypto.randomUUID()}@example.com`, password: 'safe-password123' })).status).toBe(201);
        regularId = (await owner.request('/meals', 'POST', { title: 'Soup', instructions: 'Regular recipe.', ingredients: [{ amount: 'a handful', ingredient: 'Lentils' }] })).body.id;
    });
    afterEach(async () => { await clearFailure(); vi.restoreAllMocks(); vi.unstubAllEnvs(); });
    const connect = (body: unknown = { token, source: sourceUrl }) => owner.request('/notion', 'PUT', body);
    const refresh = () => owner.request('/notion/refresh', 'POST');
    const list = async () => (await owner.request('/meals?type=meal')).body as Array<{
        id: string;
        title: string;
        source?: string;
        ingredients: unknown[];
    }>;
    const snapshot = async () => ({
        connections: await getAll('SELECT * FROM notion_connections ORDER BY host_id'), mappings: await getAll('SELECT * FROM notion_recipes ORDER BY meal_id'),
        meals: await getAll('SELECT * FROM meals ORDER BY id'), ingredients: await getAll('SELECT * FROM meal_ingredients ORDER BY id'),
        plans: await getAll('SELECT * FROM plan_entries ORDER BY id'), shopping: await getAll('SELECT * FROM shopping_items ORDER BY id'),
        disk: await databaseSnapshot(['meals', 'meal_ingredients', 'sessions', 'session_meals', 'participants', 'swipes', 'plan_entries', 'shopping_items', 'recurring_groceries', 'dinner_staples', 'notion_connections', 'notion_recipes']),
    });
    it('requires authentication on every operation and never writes on status reads', async () => {
        const before = await snapshot();
        const anonymous = server.client();
        for (const [path, method] of [['/notion', 'GET'], ['/notion', 'PUT'], ['/notion/refresh', 'POST'], ['/notion', 'DELETE']])
            expect((await anonymous.request(path, method, method === 'GET' ? undefined : { token, source })).status).toBe(401);
        expect((await owner.request('/notion')).body).toEqual({ connected: false, sourceUrl: null, lastRefreshedAt: null, lastError: null, recipeCount: 0 });
        expect(await snapshot()).toEqual(before);
        expect(readNotionRecipes).not.toHaveBeenCalled();
    });
    it('connects, encrypts credentials and isolates recipes and status per account', async () => {
        const result = await connect();
        expect(result.status, JSON.stringify({ body: result.body, network: notionFixtureDiagnostics() })).toBe(200);
        expect(result.body).toMatchObject({ connected: true, added: 3, updated: 0, removed: 0, recipeCount: 3 });
        expect(JSON.stringify(result.body)).not.toContain(token);
        expect(JSON.stringify(await getAll('SELECT * FROM notion_connections'))).not.toContain(token);
        const rows = await list();
        expect(rows).toHaveLength(4);
        expect(rows.find(row => row.id === regularId)).not.toHaveProperty('source');
        const imported = rows.filter(row => row.source === 'notion');
        expect(imported).toHaveLength(3);
        expect(imported[0].ingredients).toEqual(fixture()[0].ingredients);
        expect((await stranger.request('/notion')).body).toMatchObject({ connected: false, recipeCount: 0 });
        for (const row of imported)
            expect((await stranger.request(`/meals/${row.id}`)).status).toBe(404);
        expect((await stranger.request('/notion/refresh', 'POST')).status).toBe(400);
        const exported = (await owner.request('/meals/export')).body;
        expect(exported.options).toHaveLength(1);
        expect(exported.options[0]).toMatchObject({ title: 'Soup', instructions: 'Regular recipe.' });
        expect(exported.options.every((row: object) => !('notionUrl' in row) && !('token' in row))).toBe(true);
        expect((await stranger.request('/meals/import', 'POST', { data: exported, dryRun: false })).body).toMatchObject({ imported: 1, duplicates: [] });
        expect((await stranger.request('/meals')).body[0]).toMatchObject({ title: 'Soup', instructions: 'Regular recipe.' });
        expect((await owner.request('/meals', 'POST', { title: 'Burgers' })).status).toBe(201);
    });
    it('refreshes repeatedly without duplicates and updates ingredient-only changes and renames in place', async () => {
        await connect();
        const initial = await list();
        const soup = initial.find(row => row.source === 'notion' && row.title === 'Soup')!;
        const beforeIngredients = await getAll('SELECT * FROM meal_ingredients WHERE meal_id = ?', [soup.id]);
        expect((await refresh()).body).toMatchObject({ added: 0, updated: 0, removed: 0 });
        expect(await getAll('SELECT * FROM meal_ingredients WHERE meal_id = ?', [soup.id])).toEqual(beforeIngredients);
        const recipes = fixture();
        recipes[0] = { ...recipes[0], title: 'New Soup', ingredients: [{ amount: 'a generous handful', ingredient: 'Spinach' }] };
        vi.mocked(readNotionRecipes).mockResolvedValue({ dataSourceId: source, sourceUrl, recipes });
        expect((await refresh()).body).toMatchObject({ added: 0, updated: 1 });
        const saved = await owner.request(`/meals/${soup.id}`);
        expect(saved.body).toMatchObject({ title: 'New Soup', ingredients: recipes[0].ingredients });
        expect(await list()).toHaveLength(4);
        expect((await owner.request(`/meals/${regularId}`)).body).toMatchObject({ title: 'Soup', instructions: 'Regular recipe.' });
    });
    it('preserves shopping snapshots/states when source recipes change, disappear and reappear', async () => {
        await connect();
        const soup = (await list()).find(row => row.source === 'notion' && row.title === 'Soup')!;
        const plan = await owner.request('/plans/2026-10-19/entries', 'POST', { mealId: soup.id });
        expect(plan.status).toBe(201);
        await owner.request(`/plans/2026-10-19/items/${plan.body.shopping[0].id}`, 'PATCH', { state: 'bought' });
        const originalPlan = (await owner.request('/plans/2026-10-19')).body;
        vi.mocked(readNotionRecipes).mockResolvedValue({ dataSourceId: source, sourceUrl, recipes: [] });
        expect((await refresh()).body).toMatchObject({ removed: 3, recipeCount: 0 });
        expect((await list()).map(row => row.id)).toEqual([regularId]);
        expect((await owner.request('/plans/2026-10-19')).body).toEqual(originalPlan);
        expect((await owner.request(`/meals/${soup.id}`)).body).toMatchObject({ archived: true, title: 'Soup' });
        vi.mocked(readNotionRecipes).mockResolvedValue({ dataSourceId: source, sourceUrl, recipes: fixture() });
        expect((await refresh()).body).toMatchObject({ added: 0, updated: 3 });
        expect((await list()).find(row => row.title === 'Soup' && row.source === 'notion')?.id).toBe(soup.id);
        expect((await owner.request('/plans/2026-10-19')).body).toEqual(originalPlan);
    });
    it('rejects local edits/archive/restore for linked recipes and protects public participant payloads', async () => {
        await connect();
        const soup = (await list()).find(row => row.source === 'notion')!;
        const before = await snapshot();
        for (const [path, method, body] of [[`/meals/${soup.id}`, 'PATCH', { title: 'Bad local edit' }], [`/meals/${soup.id}`, 'DELETE', undefined], [`/meals/${soup.id}/restore`, 'POST', undefined]] as const)
            expect((await owner.request(path, method, body)).status).toBe(403);
        expect(await snapshot()).toEqual(before);
        const session = await owner.request('/sessions', 'POST', { mode: 'home', mealIds: [soup.id] });
        const participant = server.client();
        const join = await participant.request(`/join/${session.body.inviteCode}`, 'POST', { displayName: 'Guest' });
        expect(join.status).toBe(201);
        const publicText = JSON.stringify(join.body);
        for (const privateField of ['notionUrl', 'source_url', 'instructions', 'ingredients', 'token_ciphertext', token])
            expect(publicText).not.toContain(privateField);
        const recipes = fixture();
        recipes[0].title = 'Changed during vote';
        vi.mocked(readNotionRecipes).mockResolvedValue({ dataSourceId: source, sourceUrl, recipes });
        const accepted = await snapshot();
        expect((await refresh()).status).toBe(409);
        expect(await snapshot()).toEqual(accepted);
    });
    it('retains every accepted value after remote errors, validation errors, failed replacement and late D1 failure', async () => {
        await connect();
        const before = await snapshot();
        vi.mocked(readNotionRecipes).mockRejectedValue(new NotionError('Notion access failed.', 502));
        expect((await refresh()).status).toBe(502);
        expect(await snapshot()).toEqual(before);
        expect((await connect({ token: 'replacement-token', source })).status).toBe(502);
        expect(await snapshot()).toEqual(before);
        vi.mocked(readNotionRecipes).mockResolvedValue({ dataSourceId: source, sourceUrl, recipes: fixture().slice(0, 1) });
        const write = await commitFailure();
        expect((await refresh()).status).toBe(500);
        expect(await snapshot()).toEqual(before);
        await write.mockRestore();
        expect((await owner.request('/notion')).body).toMatchObject({ connected: true, recipeCount: 3 });
    });
    it('serializes account connection changes and disconnects without deleting accepted recipe copies', async () => {
        await connect();
        let finish!: (value: Awaited<ReturnType<typeof readNotionRecipes>>) => void;
        vi.mocked(readNotionRecipes).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
        const pending = refresh();
        await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
        expect((await owner.request('/notion', 'DELETE')).status).toBe(409);
        expect((await refresh()).status).toBe(409);
        finish({ dataSourceId: source, sourceUrl, recipes: fixture() });
        expect((await pending).status).toBe(200);
        const beforeMeals = await list();
        expect((await owner.request('/notion', 'DELETE')).body).toMatchObject({ connected: false, recipeCount: 3 });
        expect(await list()).toEqual(beforeMeals);
        expect((await refresh()).status).toBe(400);
    });
    it('creates the Notion tables and protects malformed connection requests', async () => {
        const before = await snapshot();
        for (const body of [{}, { token: '', source }, { token, source: [] }, { token, source: 'x'.repeat(2001) }])
            expect((await connect(body)).status).toBe(400);
        expect(await snapshot()).toEqual(before);
        expect(readNotionRecipes).not.toHaveBeenCalled();
        expect(await getOne("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'notion_connections'")).toBeDefined();
        expect(await getOne("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'notion_recipes'")).toBeDefined();
    });
    it('switches collections without overwriting regular recipes and restores original mapping IDs on return', async () => {
        await connect();
        const original = (await list()).filter(row => row.source === 'notion');
        const nextSource = '99999999-1111-4111-8111-111111111111';
        vi.mocked(readNotionRecipes).mockResolvedValue({ dataSourceId: nextSource, sourceUrl, recipes: fixture() });
        expect((await connect({ token: 'new-synthetic-token', source: nextSource })).body).toMatchObject({ added: 3, removed: 3, recipeCount: 3 });
        const next = (await list()).filter(row => row.source === 'notion');
        expect(next.every(row => !original.some(previous => previous.id === row.id))).toBe(true);
        expect((await owner.request(`/meals/${regularId}`)).body.instructions).toBe('Regular recipe.');
        vi.mocked(readNotionRecipes).mockResolvedValue({ dataSourceId: source, sourceUrl, recipes: fixture() });
        expect((await connect()).body).toMatchObject({ added: 0, updated: 3, removed: 3 });
        expect((await list()).filter(row => row.source === 'notion').map(row => row.id).sort()).toEqual(original.map(row => row.id).sort());
    });
    it('restores accepted state after failed saves on initial connection and disconnection', async () => {
        const original = await snapshot();
        let write = await commitFailure();
        expect((await connect()).status).toBe(500);
        expect(await snapshot()).toEqual(original);
        await write.mockRestore();
        expect((await connect()).status).toBe(200);
        const connected = await snapshot();
        write = await commitFailure();
        expect((await owner.request('/notion', 'DELETE')).status).toBe(500);
        expect(await snapshot()).toEqual(connected);
        await write.mockRestore();
        expect((await refresh()).body).toMatchObject({ added: 0, updated: 0, removed: 0, recipeCount: 3 });
    });
    it.each(['expiry', 'token', 'revision'] as const)('fences a late Notion response after %s changes without replacing accepted recipes', async (change) => {
        expect((await connect()).status).toBe(200);
        let finish!: (value: Awaited<ReturnType<typeof readNotionRecipes>>) => void;
        vi.mocked(readNotionRecipes).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
        const pending = refresh();
        await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
        const host = (await owner.request('/auth/me')).body.id;
        let replacementToken: string | undefined;
        if (change === 'expiry')
            await runQuery('UPDATE notion_leases SET expires=? WHERE host_id=?', [Date.now() - 10, host]);
        else if (change === 'token') {
            replacementToken = crypto.randomUUID();
            await runQuery('UPDATE notion_leases SET token=? WHERE host_id=?', [replacementToken, host]);
        }
        else
            expect((await owner.request(`/meals/${regularId}`, 'PATCH', { notes: 'Accepted independent edit' })).status).toBe(200);
        const accepted = await snapshot();
        const recipes = fixture();
        recipes[0].title = 'Rejected stale response';
        finish({ dataSourceId: source, sourceUrl, recipes });
        expect((await pending).status).toBe(409);
        expect(await snapshot()).toEqual(accepted);
        if (replacementToken)
            expect((await getOne<{
                token: string;
            }>('SELECT token FROM notion_leases WHERE host_id=?', [host]))?.token).toBe(replacementToken);
    });
    it('keeps a disconnected connection revoked when an expired refresh returns later', async () => {
        expect((await connect()).status).toBe(200);
        let finish!: (value: Awaited<ReturnType<typeof readNotionRecipes>>) => void;
        vi.mocked(readNotionRecipes).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
        const pending = refresh();
        await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
        const host = (await owner.request('/auth/me')).body.id;
        await runQuery('UPDATE notion_leases SET expires=? WHERE host_id=?', [Date.now() - 10, host]);
        expect((await owner.request('/notion', 'DELETE')).body).toMatchObject({ connected: false, recipeCount: 3 });
        const accepted = await snapshot();
        finish({ dataSourceId: source, sourceUrl, recipes: fixture() });
        expect((await pending).status).toBe(409);
        expect(await snapshot()).toEqual(accepted);
        expect((await owner.request('/notion')).body.connected).toBe(false);
    });
});
