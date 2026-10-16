import { beforeAll, afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import { randomUUID } from 'crypto';
import { getAll } from '../db/schema';
import { startHttpTestServer, type HttpTestServer, type HttpTestClient } from '../test/http';

describe('private recipe metadata', () => {
  let server: HttpTestServer;
  let owner: HttpTestClient;
  let stranger: HttpTestClient;
  beforeAll(async () => {
    server = await startHttpTestServer(); owner = server.client(); stranger = server.client();
    for (const client of [owner, stranger]) expect((await client.request('/auth/register', 'POST', { email: `${randomUUID()}@example.com`, password: 'safe-password123' })).status).toBe(201);
  });
  afterAll(async () => { await server.close(); });
  afterEach(() => { vi.restoreAllMocks(); });
  const create = (extra = {}) => owner.request('/meals', 'POST', { title: randomUUID(), totalMinutes: 30, effort: 'easy', ...extra });
  it('retains omitted metadata, clears null, and protects ownership and public payloads', async () => {
    const created = await create(); expect(created.status).toBe(201);
    const id = created.body.id;
    expect(created.body).toMatchObject({ totalMinutes: 30, effort: 'easy' });
    expect((await owner.request('/meals')).body).toContainEqual(expect.objectContaining({ id, totalMinutes: 30, effort: 'easy' }));
    expect((await server.client().request(`/meals/${id}`)).status).toBe(401);
    expect((await stranger.request(`/meals/${id}`)).status).toBe(404);
    expect((await stranger.request(`/meals/${id}`, 'PATCH', { totalMinutes: 2 })).status).toBe(404);
    expect((await owner.request(`/meals/${id}`, 'PATCH', { title: 'Renamed soup' })).body).toMatchObject({ totalMinutes: 30, effort: 'easy' });
    const session = await owner.request('/sessions', 'POST', { mealIds: [id], mode: 'home' });
    expect(session.status).toBe(201);
    const joined = await server.client().request(`/join/${session.body.inviteCode}`, 'POST', { displayName: 'Guest' });
    expect(joined.status).toBe(201);
    for (const field of ['totalMinutes', 'total_minutes', 'effort']) expect(JSON.stringify(joined.body)).not.toContain(`"${field}"`);
    expect((await owner.request(`/meals/${id}`, 'PATCH', { totalMinutes: null, effort: null })).body).toMatchObject({ totalMinutes: null, effort: null });
  });
  it.each([{totalMinutes: 1.5}, {totalMinutes: '15'}, {totalMinutes: 0}, {totalMinutes: 1441}, {totalMinutes: true}, {effort: 'hard'}, {effort: 1}])('rejects invalid metadata before any write: %j', async extra => {
    const created = await create(); const before = getAll('SELECT * FROM meals');
    expect((await create(extra)).status).toBe(400);
    expect((await owner.request(`/meals/${created.body.id}`, 'PATCH', { title: 'Should not change', ...extra })).status).toBe(400);
    expect(getAll('SELECT * FROM meals')).toEqual(before);
  });
  it('rejects category metadata and round-trips old and new transfer files with fresh IDs', async () => {
    expect((await create({ type: 'category' })).status).toBe(400);
    const category = await owner.request('/meals', 'POST', { title: randomUUID(), type: 'category' });
    expect((await owner.request(`/meals/${category.body.id}`, 'PATCH', { effort: 'easy' })).status).toBe(400);
    const meal = await create();
    const exported = await owner.request('/meals/export');
    const option = exported.body.options.find((row: {title: string}) => row.title === meal.body.title);
    expect(option).toMatchObject({ totalMinutes: 30, effort: 'easy' });
    const imported = await stranger.request('/meals/import', 'POST', { data: { version: 1, options: [option, {title: 'Legacy recipe', type: 'meal'}] }, dryRun: false });
    expect(imported.body.imported).toBe(2);
    const library = await stranger.request('/meals');
    expect(library.body).toContainEqual(expect.objectContaining({title: option.title, totalMinutes: 30, effort: 'easy'}));
    expect(library.body.find((row: {title: string}) => row.title === option.title).id).not.toBe(meal.body.id);
  });
  it('restores accepted metadata, ingredients, and unrelated data after persistence failure', async () => {
    const created = await create({ ingredients: [{amount: '2 cans', ingredient: 'Beans'}] });
    const before = getAll('SELECT * FROM meals'); const ingredients = getAll('SELECT * FROM meal_ingredients');
    const disk = fs.readFileSync(process.env.DATABASE_PATH!);
    vi.spyOn(fs, 'renameSync').mockImplementationOnce(() => { throw new Error('disk unavailable'); });
    expect((await owner.request(`/meals/${created.body.id}`, 'PATCH', { totalMinutes: 60, effort: 'involved', ingredients: [] })).status).toBe(500);
    expect(getAll('SELECT * FROM meals')).toEqual(before);
    expect(getAll('SELECT * FROM meal_ingredients')).toEqual(ingredients);
    expect(fs.readFileSync(process.env.DATABASE_PATH!)).toEqual(disk);
  });
});
