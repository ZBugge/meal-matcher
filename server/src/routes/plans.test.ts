import { beforeAll, beforeEach, afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { getAll } from '../test/db';
import { commitFailure, observeMutations, clearFailure, databaseSnapshot } from '../test/db';
import { reopenD1, restartTestFixture } from '../test/runtime';
import { startHttpTestServer, type HttpTestServer, type HttpTestClient } from '../test/http';
import type { WeekPlan } from '../types';
const week = '2026-10-12';
describe('Private weekly planning HTTP API', () => {
    let server: HttpTestServer;
    let owner: HttpTestClient;
    let stranger: HttpTestClient;
    let mealId: string;
    beforeAll(async () => { server = await startHttpTestServer(); });
    afterAll(async () => { await server.close(); });
    afterEach(async () => { await clearFailure(); vi.restoreAllMocks(); vi.unstubAllEnvs(); });
    beforeEach(async () => {
        owner = server.client();
        stranger = server.client();
        for (const client of [owner, stranger])
            expect((await client.request('/auth/register', 'POST', { email: `${crypto.randomUUID()}@example.com`, password: 'safe-password123' })).status).toBe(201);
        const meal = await owner.request('/meals', 'POST', { title: 'Family soup', instructions: 'Simmer gently.', ingredients: [{ amount: '2 cans', ingredient: 'Beans' }, { amount: 'a handful', ingredient: 'Spinach' }] });
        expect(meal.status).toBe(201);
        mealId = meal.body.id;
    });
    const get = () => owner.request<WeekPlan>(`/plans/${week}`);
    const add = (body: unknown = { mealId }) => owner.request<WeekPlan>(`/plans/${week}/entries`, 'POST', body);
    const state = async () => ({ entries: await getAll('SELECT * FROM plan_entries ORDER BY id'), items: await getAll('SELECT * FROM shopping_items ORDER BY id'), staples: await getAll('SELECT * FROM dinner_staples ORDER BY id'), recurring: await getAll('SELECT * FROM recurring_groceries ORDER BY id'), disk: await databaseSnapshot(['meals', 'meal_ingredients', 'sessions', 'session_meals', 'participants', 'swipes', 'plan_entries', 'shopping_items', 'recurring_groceries', 'dinner_staples', 'notion_connections', 'notion_recipes']) });
    it('reads an empty week without writing and requires authentication', async () => {
        const initial = await state();
        expect((await get()).body).toEqual({ week, entries: [], shopping: [] });
        expect(await state()).toEqual(initial);
        expect((await server.client().request(`/plans/${week}`)).status).toBe(401);
    });
    it('preserves free amounts/order, dates, takeout and private shopping changes across additions and removals', async () => {
        const write = await observeMutations();
        let response = await add({ mealId, date: '2026-10-14' });
        expect(response.status).toBe(201);
        expect(await write.calls()).toBe(1);
        const first = response.body.entries[0];
        const [beans, spinach] = response.body.shopping;
        expect(first).toMatchObject({ mealId, kind: 'home', title: 'Family soup', date: '2026-10-14' });
        expect(response.body.shopping.map(row => [row.amount, row.ingredient, row.displayOrder])).toEqual([['2 cans', 'Beans', 0], ['a handful', 'Spinach', 1]]);
        await owner.request(`/plans/${week}/items/${beans.id}`, 'PATCH', { state: 'have' });
        await owner.request(`/plans/${week}/items/${spinach.id}`, 'PATCH', { state: 'bought', amount: 'two handfuls' });
        const extra = await owner.request<WeekPlan>(`/plans/${week}/items`, 'POST', { ingredient: 'Milk', amount: '1 carton' });
        const extraId = extra.body.shopping.find(row => row.ingredient === 'Milk')!.id;
        response = await add();
        const second = response.body.entries.find(row => row.id !== first.id)!;
        expect(response.body.shopping.find(row => row.id === beans.id)?.state).toBe('have');
        expect(response.body.shopping.find(row => row.id === spinach.id)).toMatchObject({ state: 'bought', amount: 'two handfuls' });
        response = await add({ kind: 'takeout', title: 'Pizza', date: '2026-10-16' });
        expect(response.body.shopping).toHaveLength(5);
        expect((await owner.request(`/plans/${week}/entries/${second.id}`, 'PATCH', { date: null })).status).toBe(200);
        response = await owner.request(`/plans/${week}/entries/${first.id}`, 'DELETE');
        expect(response.body.shopping).toHaveLength(4);
        expect(response.body.shopping.find(row => row.id === spinach.id)).toMatchObject({ entryId: null, state: 'bought', amount: 'two handfuls' });
        expect(response.body.shopping.some(row => row.id === extraId)).toBe(true);
        expect(response.body.shopping.some(row => row.entryId === first.id)).toBe(false);
        expect((await get()).body).toEqual(response.body);
    });
    it('plans owned quick-session meals and takeout without granting another host access', async () => {
        for (const mode of ['home', 'takeout']) {
            const quick = await owner.request('/quick-session', 'POST', { creatorName: 'Family', mode, meals: [{ title: 'Quick choice' }] });
            expect(quick.status).toBe(200);
            const id = quick.body.meals[0].id;
            expect((await stranger.request(`/plans/${week}/entries`, 'POST', { mealId: id })).status).toBe(404);
            const added = await add({ mealId: id });
            expect(added.status).toBe(201);
            expect(added.body.entries.some(entry => entry.mealId === id && entry.kind === mode)).toBe(true);
            expect((await owner.request(`/meals/${id}`)).status).toBe(200);
        }
    });
    it('reopens durable plans, shopping states and edits after a Worker restart', async () => {
        const plan = (await add({ mealId, date: '2026-10-13' })).body;
        await owner.request(`/plans/${week}/items/${plan.shopping[0].id}`, 'PATCH', { state: 'have', amount: '3 cans' });
        await owner.request(`/plans/${week}/items`, 'POST', { ingredient: 'Bread', amount: 'one loaf' });
        const reopened = await reopenD1();
        try {
            expect((await reopened.exec(`SELECT title, date FROM plan_entries WHERE id = '${plan.entries[0].id}'`))[0].values).toEqual([['Family soup', '2026-10-13']]);
            expect((await reopened.exec(`SELECT ingredient, amount, state FROM shopping_items WHERE id = '${plan.shopping[0].id}'`))[0].values).toEqual([['Beans', '3 cans', 'have']]);
            expect((await reopened.exec(`SELECT ingredient, amount FROM shopping_items WHERE ingredient = 'Bread'`))[0].values).toEqual([['Bread', 'one loaf']]);
        }
        finally {
            reopened.close();
        }
    });
    it('rejects cross-owner reads/mutations and recipe access without exposing another family', async () => {
        const plan = (await add()).body;
        const entry = plan.entries[0];
        const item = plan.shopping[0];
        const before = await state();
        expect((await stranger.request(`/plans/${week}`)).body).toEqual({ week, entries: [], shopping: [] });
        expect((await stranger.request(`/plans/${week}/entries`, 'POST', { mealId })).status).toBe(404);
        for (const method of ['PATCH', 'DELETE']) {
            expect((await stranger.request(`/plans/${week}/entries/${entry.id}`, method, method === 'PATCH' ? { date: null } : undefined)).status).toBe(404);
            expect((await stranger.request(`/plans/${week}/items/${item.id}`, method, method === 'PATCH' ? { state: 'bought' } : undefined)).status).toBe(404);
        }
        expect((await stranger.request(`/meals/${mealId}`)).status).toBe(404);
        expect(await state()).toEqual(before);
    });
    it.each([null, [], {}, { mealId: 12 }, { mealId: [] }, { mealId: 'missing' }, { mealId: 'placeholder', date: '2026-10-19' }, { kind: 'home', title: 'invented' }, { kind: 'takeout', title: '   ' }, { kind: 'takeout', title: 7 }, { kind: 'takeout', title: 'Pizza', date: '2026-02-30' }])('rejects malformed or missing options %j without writes', async (body) => {
        const before = await state();
        const result = await add(body);
        expect([400, 404]).toContain(result.status);
        expect(await state()).toEqual(before);
    });
    it('validates all entry/item fields and date boundaries before mutation', async () => {
        const plan = (await add()).body;
        const entry = plan.entries[0];
        const item = plan.shopping[0];
        const before = await state();
        for (const date of ['2026-10-11', '2026-10-19', '2026-02-30', [], 2, false])
            expect((await owner.request(`/plans/${week}/entries/${entry.id}`, 'PATCH', { date })).status).toBe(400);
        for (const body of [null, [], {}, { state: 'yes' }, { amount: {} }, { ingredient: '' }, { hostId: 'other' }])
            expect((await owner.request(`/plans/${week}/items/${item.id}`, 'PATCH', body)).status).toBe(400);
        for (const date of ['2026-10-13', '2026-02-30', 'garbage'])
            expect((await owner.request(`/plans/${date}`)).status).toBe(400);
        expect(await state()).toEqual(before);
    });
    it('preserves accepted D1 data when add, update, remove, and manual-item batches fail', async () => {
        const plan = (await add()).body;
        const entry = plan.entries[0];
        const item = plan.shopping[0];
        const before = await state();
        await commitFailure();
        for (const [path, method, body] of [
            [`/entries`, 'POST', { mealId }], [`/entries/${entry.id}`, 'PATCH', { date: '2026-10-15' }], [`/entries/${entry.id}`, 'DELETE', undefined],
            ['/items', 'POST', { ingredient: 'Extra' }], [`/items/${item.id}`, 'PATCH', { state: 'have' }], [`/items/${item.id}`, 'DELETE', undefined],
        ] as const) {
            expect((await owner.request(`/plans/${week}${path}`, method, body)).status).toBe(500);
            expect(await state()).toEqual(before);
            expect((await get()).body).toEqual(plan);
        }
    });
    it('keeps requested groceries as editable standalone rows and always retains purchased progress', async () => {
        const plan = (await add()).body;
        await owner.request(`/plans/${week}/items/${plan.shopping[0].id}`, 'PATCH', { state: 'bought', aisle: 'Other' });
        const removed = await owner.request<WeekPlan>(`/plans/${week}/entries/${plan.entries[0].id}?keepGroceries=true`, 'DELETE');
        expect(removed.body.entries).toEqual([]);
        expect(removed.body.shopping).toHaveLength(2);
        expect(removed.body.shopping.every(row => row.entryId === null)).toBe(true);
        expect((await owner.request(`/plans/${week}/items/${plan.shopping[1].id}`, 'PATCH', { amount: '3 bags', state: 'bought' })).status).toBe(200);
        expect((await get()).body.shopping[0]).toMatchObject({ state: 'bought', aisle: 'Other' });
    });
    it('validates every bulk item and restores all accepted states if persistence fails', async () => {
        const plan = (await add()).body;
        const ids = plan.shopping.map(row => row.id);
        const foreign = (await stranger.request<WeekPlan>(`/plans/${week}/items`, 'POST', { ingredient: 'Private' })).body.shopping[0];
        const before = await state();
        for (const body of [{ ids: [ids[0], foreign.id], state: 'have' }, { ids: [ids[0], 'stale'], state: 'have' }, { ids: [], state: 'have' }, { ids: [ids[0], ids[0]], state: 'have' }, { ids, state: 'invalid' }]) {
            expect([400, 404]).toContain((await owner.request(`/plans/${week}/items/bulk`, 'POST', body)).status);
            expect(await state()).toEqual(before);
        }
        const write = await commitFailure();
        expect((await owner.request(`/plans/${week}/items/bulk`, 'POST', { ids, state: 'have' })).status).toBe(500);
        expect(await state()).toEqual(before);
        await write.mockRestore();
        const saved = await owner.request<WeekPlan>(`/plans/${week}/items/bulk`, 'POST', { ids, state: 'have' });
        expect(saved.body.shopping.every(row => row.state === 'have')).toBe(true);
    });
    it('repeats a reviewed source selection with shifted dates, fresh groceries and IDs, appending atomically', async () => {
        await add({ mealId, date: '2026-10-14' });
        await add();
        await add({ kind: 'takeout', title: 'Pizza', date: '2026-10-16' });
        let source = (await get()).body;
        await owner.request(`/plans/${week}/items/bulk`, 'POST', { ids: source.shopping.map(row => row.id), state: 'bought' });
        source = (await get()).body;
        const targetWeek = '2026-10-26';
        const existing = (await owner.request<WeekPlan>(`/plans/${targetWeek}/entries`, 'POST', { kind: 'takeout', title: 'Existing dinner' })).body;
        const entryIds = source.entries.map(entry => entry.id);
        const before = await state();
        for (const body of [{ targetWeek, entryIds: [entryIds[0], 'missing'] }, { targetWeek: week, entryIds }, { targetWeek: '2026-10-27', entryIds }, { targetWeek, entryIds: [] }]) {
            expect([400, 404]).toContain((await owner.request(`/plans/${week}/repeat`, 'POST', body)).status);
            expect(await state()).toEqual(before);
        }
        expect((await stranger.request(`/plans/${week}/repeat`, 'POST', { targetWeek, entryIds })).status).toBe(404);
        const write = await commitFailure();
        expect((await owner.request(`/plans/${week}/repeat`, 'POST', { targetWeek, entryIds })).status).toBe(500);
        expect(await state()).toEqual(before);
        await write.mockRestore();
        const repeated = await owner.request<WeekPlan>(`/plans/${week}/repeat`, 'POST', { targetWeek, entryIds });
        expect(repeated.status).toBe(201);
        expect(repeated.body.entries).toHaveLength(4);
        expect(repeated.body.entries).toContainEqual(existing.entries[0]);
        expect(repeated.body.entries.filter(entry => entry.title === 'Family soup').map(entry => entry.date)).toEqual(['2026-10-28', null]);
        expect(repeated.body.entries.find(entry => entry.title === 'Pizza')?.date).toBe('2026-10-30');
        expect(repeated.body.shopping).toHaveLength(4);
        expect(repeated.body.shopping.every(row => row.state === 'needed' && !source.shopping.some(old => old.id === row.id))).toBe(true);
        expect((await get()).body).toEqual(source);
        const reopened = await reopenD1();
        try {
            expect((await reopened.exec(`SELECT COUNT(*) FROM plan_entries WHERE week = '${targetWeek}'`))[0].values).toEqual([[4]]);
        }
        finally {
            reopened.close();
        }
    });
    it('persists editable/removable household dinner staples across weeks, privately and with rollback', async () => {
        expect((await owner.request(`/plans/${week}/staples`, 'POST', { title: 'Salmon night' })).status).toBe(201);
        const staples = (await owner.request<{
            id: string;
            title: string;
        }[]>(`/plans/2026-10-19/staples`)).body;
        expect(staples).toHaveLength(1);
        const id = staples[0].id;
        const before = await state();
        expect((await stranger.request(`/plans/${week}/staples`)).body).toEqual([]);
        expect((await stranger.request(`/plans/${week}/staples/${id}`, 'PATCH', { title: 'Stolen' })).status).toBe(404);
        expect((await stranger.request(`/plans/${week}/staples/${id}`, 'DELETE')).status).toBe(404);
        expect(await state()).toEqual(before);
        const write = await commitFailure();
        for (const [path, method, body] of [['/staples', 'POST', { title: 'Tofu' }], [`/staples/${id}`, 'PATCH', { title: 'Changed' }], [`/staples/${id}`, 'DELETE', undefined]] as const) {
            expect((await owner.request(`/plans/${week}${path}`, method, body)).status).toBe(500);
            expect(await state()).toEqual(before);
        }
        await write.mockRestore();
        expect((await owner.request(`/plans/${week}/staples/${id}`, 'PATCH', { title: 'Asian tofu' })).status).toBe(200);
        const reopened = await reopenD1();
        try {
            expect((await reopened.exec(`SELECT title FROM dinner_staples WHERE id = '${id}'`))[0].values).toEqual([['Asian tofu']]);
        }
        finally {
            reopened.close();
        }
        expect((await owner.request(`/plans/${week}/staples/${id}`, 'DELETE')).status).toBe(200);
        expect((await owner.request(`/plans/${week}/staples`)).body).toEqual([]);
        expect((await get()).body).toEqual({ week, entries: [], shopping: [] });
    });
    it('applies selected usual groceries once per week and preserves snapshots after edits, deletion and reopening', async () => {
        const route = `/plans/${week}/recurring`;
        const before = await state();
        expect((await owner.request(route)).body).toEqual([]);
        expect(await state()).toEqual(before);
        const saved = await owner.request(route, 'POST', { ingredient: ' Milk ', amount: ' 1 carton ' });
        expect(saved.status).toBe(201);
        expect(saved.body).toEqual({ id: expect.any(String), ingredient: 'Milk', amount: '1 carton' });
        const id = saved.body.id;
        const apply = () => owner.request<WeekPlan>(`${route}/apply`, 'POST', { ids: [id] });
        const first = (await apply()).body.shopping[0];
        expect(first).toMatchObject({ ingredient: 'Milk', state: 'needed', entryId: null });
        expect(first).not.toHaveProperty('recurring_id');
        expect(first).not.toHaveProperty('host_id');
        await owner.request(`/plans/${week}/items/${first.id}`, 'PATCH', { state: 'have' });
        expect((await apply()).body.shopping).toEqual([expect.objectContaining({ id: first.id, state: 'have' })]);
        await owner.request(`/plans/${week}/items/${first.id}`, 'PATCH', { amount: 'half carton', state: 'bought' });
        await owner.request(route + '/' + id, 'PATCH', { ingredient: 'Oat milk', amount: '2 cartons' });
        expect((await apply()).body.shopping).toEqual([expect.objectContaining({ id: first.id, ingredient: 'Milk', amount: 'half carton', state: 'bought' })]);
        const next = await owner.request<WeekPlan>('/plans/2026-10-19/recurring/apply', 'POST', { ids: [id] });
        expect(next.body.shopping).toEqual([expect.objectContaining({ ingredient: 'Oat milk', amount: '2 cartons', state: 'needed' })]);
        await owner.request(`/plans/${week}/items/${first.id}`, 'DELETE');
        const reapplied = (await apply()).body.shopping[0];
        expect(reapplied.id).not.toBe(first.id);
        await owner.request(route + '/' + id, 'DELETE');
        expect((await owner.request(route)).body).toEqual([]);
        expect((await get()).body.shopping).toEqual([reapplied]);
        expect((await owner.request('/plans/2026-10-19')).body.shopping).toEqual(next.body.shopping);
        const reopened = await reopenD1();
        try {
            expect((await reopened.exec(`SELECT ingredient, amount, state FROM shopping_items WHERE id = '${reapplied.id}'`))[0].values).toEqual([['Oat milk', '2 cartons', 'needed']]);
        }
        finally {
            reopened.close();
        }
    });
    it('validates every selected source and rejects foreign IDs before any mutation', async () => {
        const route = `/plans/${week}/recurring`;
        const own = (await owner.request(route, 'POST', { ingredient: 'Tea', amount: '' })).body.id;
        const foreign = (await stranger.request(route, 'POST', { ingredient: 'Coffee', amount: '' })).body.id;
        const before = await state();
        expect((await stranger.request(route)).body).toEqual([{ id: foreign, ingredient: 'Coffee', amount: '' }]);
        for (const method of ['PATCH', 'DELETE'])
            expect((await stranger.request(route + '/' + own, method, method === 'PATCH' ? { ingredient: 'Stolen', amount: '' } : undefined)).status).toBe(404);
        for (const ids of [[own, foreign], [own, 'missing']])
            expect((await owner.request(route + '/apply', 'POST', { ids })).status).toBe(404);
        for (const body of [null, {}, { ids: [] }, { ids: [own, own] }, { ids: [2] }, { ids: [own], hostId: foreign }, { ids: Array(501).fill(own) }])
            expect((await owner.request(route + '/apply', 'POST', body)).status).toBe(400);
        for (const body of [{ ingredient: '', amount: '' }, { ingredient: 'Tea', amount: 3 }, { ingredient: 'a'.repeat(301), amount: '' }, { ingredient: 'Tea', amount: 'a'.repeat(101) }, { ingredient: 'Tea', amount: '', hostId: foreign }]) {
            expect((await owner.request(route, 'POST', body)).status).toBe(400);
            expect((await owner.request(route + '/' + own, 'PATCH', body)).status).toBe(400);
        }
        expect((await server.client().request(route)).status).toBe(401);
        expect(await state()).toEqual(before);
    });
    it('preserves templates and all selected snapshots when a late D1 commit fails', async () => {
        const route = `/plans/${week}/recurring`;
        const first = (await owner.request(route, 'POST', { ingredient: 'Tea', amount: '2 boxes' })).body.id;
        const second = (await owner.request(route, 'POST', { ingredient: 'Milk', amount: '1 carton' })).body.id;
        const before = await state();
        await commitFailure();
        for (const [path, method, body] of [
            [route, 'POST', { ingredient: 'Bread', amount: '' }],
            [route + '/' + first, 'PATCH', { ingredient: 'New tea', amount: '' }],
            [route + '/' + first, 'DELETE', undefined],
            [route + '/apply', 'POST', { ids: [first, second] }],
        ] as const) {
            expect((await owner.request(path, method, body)).status).toBe(500);
            expect(await state()).toEqual(before);
        }
    });
});
