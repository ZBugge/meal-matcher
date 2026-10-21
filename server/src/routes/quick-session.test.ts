import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'crypto';
import { getAll, getOne } from '../test/db';
import { createQuickFixture, startHttpTestServer, type HttpTestServer, type HttpTestClient } from '../test/http';
function expectPublic(payload: unknown, secrets: string[] = []) {
    const text = JSON.stringify(payload);
    for (const field of ['creatorToken', 'creator_token', 'instructions', 'ingredients', 'notes', 'voters', 'host_id', 'password_hash']) {
        expect(text).not.toContain(`"${field}"`);
    }
    for (const secret of secrets)
        expect(text).not.toContain(secret);
}
describe('Quick session HTTP API', () => {
    let server: HttpTestServer;
    beforeAll(async () => { server = await startHttpTestServer(); });
    afterAll(async () => { await server.close(); });
    it.each(['home', 'takeout'])('creates a real %s session, temporary options and joined creator', async (mode) => {
        const client = server.client();
        const response = await client.request('/quick-session', 'POST', {
            creatorName: 'Creator', mode, meals: [{ title: '  Soup  ', description: '  A bowl  ' }, { title: 'Pasta' }],
        });
        expect(response.status).toBe(200);
        const { session, meals, participantId, creatorToken } = response.body;
        expect(session).toMatchObject({ status: 'open', mode });
        expect(session.inviteCode).toMatch(/^[A-Z2-9]{6}$/);
        expect(creatorToken).toMatch(/^[a-f0-9]{64}$/);
        expect(meals).toHaveLength(2);
        expect(meals[0]).toMatchObject({ title: 'Soup', type: mode === 'home' ? 'meal' : 'category', description: mode === 'home' ? 'A bowl' : null });
        expect(await getOne('SELECT session_id, display_name, submitted FROM participants WHERE id = ?', [participantId]))
            .toEqual({ session_id: session.id, display_name: 'Creator', submitted: 0 });
        expect(await getAll('SELECT temporary, creator_token, type FROM meals WHERE id IN (?, ?)', meals.map((meal: {
            id: string;
        }) => meal.id)))
            .toEqual(Array(2).fill({ temporary: 1, creator_token: creatorToken, type: mode === 'home' ? 'meal' : 'category' }));
        const join = await client.request(`/join/${session.inviteCode.toLowerCase()}`, 'POST', { displayName: 'Guest' });
        expect(join.status).toBe(201);
        expect(join.body.meals).toHaveLength(2);
        expectPublic(join.body, [creatorToken]);
        const status = await client.request(`/session-status/${session.id}`);
        expect(status.status).toBe(200);
        expect(status.body.participants).toHaveLength(2);
        expect(status.body.participants.every((participant: {
            submitted: unknown;
        }) => participant.submitted === false)).toBe(true);
        expectPublic(status.body, [creatorToken]);
    });
    it.each([
        { meals: [{ title: 'Soup' }] }, { creatorName: 'Creator', meals: [] },
        { creatorName: 'Creator', meals: [{ title: '  ' }] },
        { creatorName: 'Creator', mode: 'invalid', meals: [{ title: 'Soup' }] },
        { creatorName: 'Creator', meals: [{ title: 'Soup' }, { title: ' soup ' }] },
    ])('rejects an invalid quick session before creating records: %j', async (payload) => {
        const counts = async () => await Promise.all(['sessions', 'meals', 'participants', 'session_meals'].map(async (table) => await getOne(`SELECT COUNT(*) AS count FROM ${table}`)));
        const before = await counts();
        expect((await server.client().request('/quick-session', 'POST', payload)).status).toBe(400);
        expect(await counts()).toEqual(before);
    });
    it('rejects missing, wrong and other-session creator tokens without closing or leaking votes', async () => {
        const client = server.client();
        const fixture = await createQuickFixture(client);
        const other = await createQuickFixture(client);
        const guestName = 'Guest ballot identity';
        const joined = await client.request(`/join/${fixture.session.inviteCode}`, 'POST', { displayName: guestName });
        expect(joined.status).toBe(201);
        expect((await client.request(`/swipes/${fixture.session.id}`, 'POST', {
            participantId: joined.body.participantId,
            swipes: fixture.meals.map(meal => ({ mealId: meal.id, vote: 2 })),
        })).status).toBe(200);
        for (const [creatorToken, expectedStatus] of [[undefined, 400], ['wrong-token', 403], [other.creatorToken, 403]] as const) {
            const response = await client.request(`/close-session/${fixture.session.id}`, 'POST', { creatorToken });
            expect(response.status).toBe(expectedStatus);
            expectPublic(response.body, [fixture.creatorToken]);
            expect(await getOne('SELECT status, closed_at FROM sessions WHERE id = ?', [fixture.session.id])).toEqual({ status: 'open', closed_at: null });
        }
        const closed = await client.request(`/close-session/${fixture.session.id}`, 'POST', { creatorToken: fixture.creatorToken });
        expect(closed.status).toBe(200);
        expect(closed.body.results).toHaveLength(2);
        expect(closed.body.results[0]).toMatchObject({ totalVotes: 1, maybeCount: 1, percentage: 100 });
        expectPublic(closed.body, [fixture.creatorToken, guestName]);
        expect((await client.request(`/close-session/${fixture.session.id}`, 'POST', { creatorToken: fixture.creatorToken })).status).toBe(400);
        const results = await client.request(`/results/${fixture.session.id}?host=true`);
        expect(results.status).toBe(200);
        expect(results.body.isHost).toBe(false);
        expectPublic(results.body, [fixture.creatorToken]);
    });
});
describe('Private host data HTTP boundaries', () => {
    let server: HttpTestServer;
    let owner: HttpTestClient;
    let other: HttpTestClient;
    let publicClient: HttpTestClient;
    let mealId: string;
    let sessionId: string;
    let inviteCode: string;
    const instructions = 'Private instructions synthetic secret';
    const notes = 'Private notes synthetic secret';
    const ingredient = 'Private ingredient synthetic secret';
    const voterName = 'Private vote identity synthetic secret';
    beforeAll(async () => {
        server = await startHttpTestServer();
        owner = server.client();
        other = server.client();
        publicClient = server.client();
        for (const client of [owner, other]) {
            const response = await client.request('/auth/register', 'POST', { email: `${randomUUID()}@example.test`, password: 'synthetic-password' });
            expect(response.status).toBe(201);
        }
        const meal = await owner.request('/meals', 'POST', { title: 'Private recipe', type: 'meal', instructions, ingredients: [{ amount: '2 cups', ingredient }] });
        expect(meal.status).toBe(201);
        mealId = meal.body.id;
        expect((await owner.request(`/meals/${mealId}`, 'PATCH', { notes })).status).toBe(200);
        const session = await owner.request('/sessions', 'POST', { mealIds: [mealId], mode: 'home' });
        expect(session.status).toBe(201);
        sessionId = session.body.id;
        inviteCode = session.body.inviteCode;
        const joined = await publicClient.request(`/join/${inviteCode}`, 'POST', { displayName: voterName });
        expect(joined.status).toBe(201);
        expectPublic(joined.body, [instructions, notes, ingredient]);
        expect((await publicClient.request(`/swipes/${sessionId}`, 'POST', { participantId: joined.body.participantId, swipes: [{ mealId, vote: 2 }] })).status).toBe(200);
    });
    afterAll(async () => { await server.close(); });
    it('allows the owner recipe view but rejects anonymous and other-owner reads and mutations', async () => {
        expect(await owner.request(`/meals/${mealId}`)).toMatchObject({ status: 200, body: { instructions, notes, ingredients: [{ amount: '2 cups', ingredient }] } });
        const before = await getOne('SELECT * FROM meals WHERE id = ?', [mealId]);
        for (const [client, status] of [[publicClient, 401], [other, 404]] as const) {
            for (const [method, path, body] of [
                ['GET', `/meals/${mealId}`, undefined],
                ['PATCH', `/meals/${mealId}`, { instructions: 'stolen', notes: 'changed' }],
                ['DELETE', `/meals/${mealId}`, undefined],
                ['POST', `/meals/${mealId}/restore`, {}],
            ] as const) {
                const response = await client.request(path, method, body);
                expect(response.status).toBe(status);
                expectPublic(response.body, [instructions, notes, ingredient]);
            }
        }
        expect(await getOne('SELECT * FROM meals WHERE id = ?', [mealId])).toEqual(before);
        expect((await owner.request(`/meals/${mealId}`)).body.ingredients).toEqual([{ amount: '2 cups', ingredient }]);
        expect((await other.request('/sessions', 'POST', { mealIds: [mealId], mode: 'home' })).status).toBe(400);
    });
    it('rejects other-host session reads and close/select operations without changing session state', async () => {
        const before = await getOne('SELECT * FROM sessions WHERE id = ?', [sessionId]);
        for (const [client, status] of [[publicClient, 401], [other, 404]] as const) {
            expect((await client.request(`/sessions/${sessionId}`)).status).toBe(status);
            expect((await client.request(`/sessions/${sessionId}/close`, 'POST', {})).status).toBe(status);
            expect((await client.request(`/sessions/${sessionId}/select`, 'POST', { mealId })).status).toBe(status);
        }
        expect(await getOne('SELECT * FROM sessions WHERE id = ?', [sessionId])).toEqual(before);
        const hostSession = await owner.request(`/sessions/${sessionId}`);
        expect(hostSession.status).toBe(200);
        expectPublic(hostSession.body, [instructions, notes, ingredient]);
    });
    it('keeps voter identities and recipe fields private even with ?host=true on public or other-host results', async () => {
        const closed = await owner.request(`/sessions/${sessionId}/close`, 'POST', {});
        expect(closed.status).toBe(200);
        expect(closed.body.results[0].voters).toEqual([{ name: voterName, vote: 2 }]);
        expect((await other.request(`/sessions/${sessionId}/select`, 'POST', { mealId })).status).toBe(404);
        expect(await getOne('SELECT selected_meal_id FROM sessions WHERE id = ?', [sessionId])).toEqual({ selected_meal_id: null });
        expect((await owner.request(`/sessions/${sessionId}/select`, 'POST', { mealId })).status).toBe(200);
        for (const client of [publicClient, other]) {
            for (const suffix of ['', '?host=true']) {
                const response = await client.request(`/results/${sessionId}${suffix}`);
                expect(response.status).toBe(200);
                expect(response.body.isHost).toBe(false);
                expect(response.body.results).toHaveLength(1);
                expect(response.body.results[0]).toMatchObject({ mealId, yesCount: 0, maybeCount: 1, totalVotes: 1, percentage: 100, isUnanimous: false });
                expect(response.body.selectedMeal.id).toBe(mealId);
                expectPublic(response.body, [instructions, notes, ingredient, voterName]);
            }
        }
        const ownerResults = await owner.request(`/results/${sessionId}?host=true`);
        expect(ownerResults.status).toBe(200);
        expect(ownerResults.body.isHost).toBe(true);
        expect(ownerResults.body.results[0].voters).toEqual([{ name: voterName, vote: 2 }]);
        const unrequested = await owner.request(`/results/${sessionId}`);
        expectPublic(unrequested.body, [instructions, notes, ingredient, voterName]);
        for (const field of ['instructions', 'ingredients', 'notes'])
            expect(JSON.stringify(ownerResults.body)).not.toContain(`"${field}"`);
    });
});
