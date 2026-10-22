import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { getAll, runQuery, getOne } from '../test/db';
import { commitFailure, observeMutations, clearFailure, databaseSnapshot } from '../test/db';
import { reopenD1, restartTestFixture } from '../test/runtime';
import { createQuickFixture, startHttpTestServer, type HttpTestServer, type HttpTestClient, type QuickFixture } from '../test/http';
describe('Swipe HTTP API', () => {
    let server: HttpTestServer;
    let client: HttpTestClient;
    let fixture: QuickFixture;
    beforeAll(async () => { server = await startHttpTestServer(); });
    afterAll(async () => { await server.close(); });
    beforeEach(async () => {
        client = server.client();
        fixture = await createQuickFixture(client);
    });
    afterEach(async () => { await clearFailure(); vi.restoreAllMocks(); vi.unstubAllEnvs(); });
    const ballot = (votes: unknown[]) => votes.map((vote, index) => ({ mealId: fixture.meals[index].id, vote }));
    const submit = (swipes: unknown, participantId: unknown = fixture.participantId) => client.request(`/swipes/${fixture.session.id}`, 'POST', { participantId, swipes });
    const state = async () => ({
        swipes: await getAll('SELECT * FROM swipes WHERE participant_id = ? ORDER BY session_meal_id', [fixture.participantId]),
        participant: await getOne('SELECT * FROM participants WHERE id = ?', [fixture.participantId]),
        persisted: await databaseSnapshot(['meals', 'meal_ingredients', 'sessions', 'session_meals', 'participants', 'swipes', 'plan_entries', 'shopping_items', 'recurring_groceries', 'dinner_staples', 'notion_connections', 'notion_recipes']),
    });
    it('identifies only the authenticated owner while results are waiting', async () => {
        const owner = server.client();
        expect((await owner.request('/auth/register', 'POST', { email: 'results-owner@example.com', password: 'test-password123' })).status).toBe(201);
        const meal = await owner.request('/meals', 'POST', { title: 'Host soup' });
        const session = await owner.request('/sessions', 'POST', { mealIds: [meal.body.id], mode: 'home' });
        expect(session.status).toBe(201);
        expect((await owner.request(`/results/${session.body.id}`)).body).toMatchObject({ status: 'waiting', isHost: true });
        const visitor = server.client();
        expect((await visitor.request(`/results/${session.body.id}?host=true`)).body).toMatchObject({ status: 'waiting', isHost: false });
        expect((await visitor.request('/auth/register', 'POST', { email: 'other-results-host@example.com', password: 'test-password123' })).status).toBe(201);
        expect((await visitor.request(`/results/${session.body.id}?host=true`)).body.isHost).toBe(false);
        expect((await visitor.request(`/sessions/${session.body.id}/close`, 'POST', {})).status).toBe(404);
        expect((await owner.request(`/sessions/${session.body.id}/close`, 'POST', {})).status).toBe(200);
    });
    it('preserves the complete accepted ballot when a later replacement vote is invalid', async () => {
        expect((await submit(ballot([1, 2]))).status).toBe(200);
        const accepted = await state();
        expect((await submit(ballot([0, 99]))).status).toBe(400);
        expect(await state()).toEqual(accepted);
    });
    it.each([0, 1, 2])('persists numeric vote %s and atomically replaces all choices', async (vote) => {
        const write = await observeMutations();
        expect((await submit(ballot([vote, 2]))).status).toBe(200);
        expect(await write.calls()).toBe(1);
        expect((await getOne<{
            submitted: number;
        }>('SELECT submitted FROM participants WHERE id = ?', [fixture.participantId]))?.submitted).toBe(1);
        await write.mockClear();
        expect((await submit(ballot([2, vote]).reverse())).status).toBe(200);
        expect(await write.calls()).toBe(1);
        const saved = await getAll<{
            meal_id: string;
            vote: number;
        }>(`SELECT sm.meal_id, s.vote FROM swipes s JOIN session_meals sm ON sm.id = s.session_meal_id
       WHERE s.participant_id = ? ORDER BY sm.display_order`, [fixture.participantId]);
        expect(saved).toEqual([{ meal_id: fixture.meals[0].id, vote: 2 }, { meal_id: fixture.meals[1].id, vote }]);
    });
    it.each([-1, 3, 99, 1.5, '0', '1', '2', 'yes', true, null, undefined, {}, { toString: null }, [], [1]].map(vote => [vote]))('rejects invalid vote %s without writing an initial or replacement ballot', async (vote) => {
        const initial = await state();
        expect((await submit(ballot([0, vote]))).status).toBe(400);
        expect(await state()).toEqual(initial);
        expect((await submit(ballot([1, 2]))).status).toBe(200);
        const accepted = await state();
        expect((await submit(ballot([0, vote]))).status).toBe(400);
        expect(await state()).toEqual(accepted);
    });
    it.each([
        ['missing', (): unknown => undefined], ['null', (): unknown => null], ['object', (): unknown => ({ length: 2 })],
        ['string', (): unknown => 'votes'], ['empty', (): unknown => []], ['null row', (): unknown => [null, {}]],
        ['string row', (): unknown => ['vote', {}]], ['boolean row', (): unknown => [true, {}]],
        ['array row', (): unknown => [[], []]], ['missing meal ID', (): unknown => [{ vote: 0 }, { vote: 1 }]],
        ['numeric meal ID', (): unknown => [{ mealId: 1, vote: 0 }, { mealId: 2, vote: 1 }]],
        ['unknown meal ID', (): unknown => [{ mealId: fixture.meals[0].id, vote: 0 }, { mealId: 'unknown', vote: 1 }]],
        ['duplicate meal ID', (): unknown => [{ mealId: fixture.meals[0].id, vote: 0 }, { mealId: fixture.meals[0].id, vote: 1 }]],
        ['incomplete ballot', (): unknown => ballot([1])],
        ['extra ballot row', (): unknown => [...ballot([1, 2]), { mealId: 'extra', vote: 1 }]],
    ] as const)('rejects %s without changing initial or submitted choices', async (_name, payload) => {
        const initial = await state();
        expect((await submit(payload())).status).toBe(400);
        expect(await state()).toEqual(initial);
        expect((await submit(ballot([1, 2]))).status).toBe(200);
        const accepted = await state();
        expect((await submit(payload())).status).toBe(400);
        expect(await state()).toEqual(accepted);
    });
    it('rejects malformed participant IDs and participants belonging to another session', async () => {
        const initial = await state();
        for (const id of [null, 1, {}, [], '', '   ']) {
            expect((await submit(ballot([1, 2]), id)).status).toBe(400);
            expect(await state()).toEqual(initial);
        }
        const other = await createQuickFixture(client);
        expect((await submit(ballot([1, 2]), other.participantId)).status).toBe(404);
        expect((await state()).swipes).toEqual(initial.swipes);
        expect((await state()).participant).toEqual(initial.participant);
    });
    it('rejects a real option from another session without changing either ballot', async () => {
        const other = await createQuickFixture(client);
        expect((await submit(ballot([1, 2]))).status).toBe(200);
        const accepted = await state();
        expect((await submit([{ mealId: fixture.meals[0].id, vote: 0 }, { mealId: other.meals[1].id, vote: 1 }])).status).toBe(400);
        expect(await state()).toEqual(accepted);
        expect(await getAll('SELECT * FROM swipes WHERE participant_id = ?', [other.participantId])).toEqual([]);
    });
    it.each([false, true])('rolls back a second-row D1 insert failure, including submitted=%s and durable records', async (submitted) => {
        if (submitted)
            expect((await submit(ballot([1, 2]))).status).toBe(200);
        const original = await state();
        // Abort the SECOND insert after the first row has been written inside the transaction.
        await runQuery(`CREATE TRIGGER reject_second_swipe BEFORE INSERT ON swipes
      WHEN NEW.vote = 0 BEGIN SELECT RAISE(ABORT, 'synthetic insert failure'); END`);
        const error = await observeMutations();
        try {
            expect((await submit(ballot([2, 0]))).status).toBe(500);
            expect(await state()).toEqual(original);
            expect(await error.calls()).toBe(0);
        }
        finally {
            await runQuery('DROP TRIGGER reject_second_swipe');
        }
        expect((await submit(ballot([0, 1]))).status).toBe(200);
    });
    it.each([false, true])('preserves accepted records when a late D1 batch fails with submitted=%s', async (submitted) => {
        if (submitted)
            expect((await submit(ballot([1, 2]))).status).toBe(200);
        const original = await state();
        vi.spyOn(console, 'error').mockImplementation(() => { });
        const write = await commitFailure();
        expect((await submit(ballot([2, 0]))).status).toBe(500);
        expect(await state()).toEqual(original);
        expect(await getAll('SELECT * FROM mutation_assertions')).toEqual([]);
        await write.mockRestore();
        expect((await submit(ballot([0, 1]))).status).toBe(200);
    });
    it('preserves the accepted ballot after a late D1 rejection and Worker restart', async () => {
        expect((await submit(ballot([1, 2]))).status).toBe(200);
        const original = await state();
        vi.spyOn(console, 'error').mockImplementation(() => { });
        const rename = await commitFailure();
        expect((await submit(ballot([0, 1]))).status).toBe(500);
        await restartTestFixture();
        expect(await state()).toEqual(original);
        expect(await getAll('SELECT * FROM mutation_assertions')).toEqual([]);
        await rename.mockRestore();
        expect((await submit(ballot([0, 1]))).status).toBe(200);
    });
    it.each([0,1,2])('allows explicit retry after rejected D1 batches and durably preserves vote %s',async vote=>{
      // D1 owns storage locks; the app permits explicit retry after a rejected
      // transaction. Two late failures followed by one accepted complete batch.
      const failure=await commitFailure();let attempts=0;
      const accepted=await state();
      for(let index=0;index<2;index++){attempts++;expect((await submit(ballot([vote,2]))).status).toBe(500);expect(await state()).toEqual(accepted);}
      await failure.mockRestore();attempts++;expect((await submit(ballot([vote,2]))).status).toBe(200);expect(attempts).toBe(3);
      expect(await getAll('SELECT vote FROM swipes WHERE participant_id=? ORDER BY vote',[fixture.participantId])).toEqual([{vote},{vote:2}]);
      expect(await getOne('SELECT submitted FROM participants WHERE id=?',[fixture.participantId])).toEqual({submitted:1});
      const reopened=await reopenD1();
      expect((await reopened.exec(`SELECT vote FROM swipes WHERE participant_id='${fixture.participantId}' ORDER BY vote`))[0].values).toEqual([[vote],[2]]);
      expect((await reopened.exec(`SELECT submitted FROM participants WHERE id='${fixture.participantId}'`))[0].values).toEqual([[1]]);
      expect(await getAll('SELECT * FROM mutation_assertions')).toEqual([]);
    });
    it('preserves the accepted ballot when a D1 commit remains unavailable', async () => {
        expect((await submit(ballot([1, 2]))).status).toBe(200);
        const original = await state();
        vi.spyOn(console, 'error').mockImplementation(() => { });
        const rename = await commitFailure();
        expect((await submit(ballot([0, 1]))).status).toBe(500);
        expect(await getAll('SELECT * FROM mutation_assertions')).toEqual([]);
        expect(await state()).toEqual(original);
        expect(await getAll('SELECT * FROM mutation_assertions')).toEqual([]);
    });
    it('returns sessionClosed for closed sessions and preserves accepted choices', async () => {
        expect((await submit(ballot([1, 2]))).status).toBe(200);
        expect((await client.request(`/close-session/${fixture.session.id}`, 'POST', { creatorToken: fixture.creatorToken })).status).toBe(200);
        const closed = await state();
        expect(await submit(ballot([0, 0]))).toEqual({ status: 400, body: { error: 'This session has ended', sessionClosed: true } });
        expect(await state()).toEqual(closed);
        expect(await client.request(`/join/${fixture.session.inviteCode}`)).toEqual({ status: 400, body: { error: 'This session has ended', sessionClosed: true } });
    });
});
