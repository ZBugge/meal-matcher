import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import { createHash } from 'crypto';
import path from 'path';
import { getAll, getDatabase, getOne } from '../db/schema';
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
  afterEach(() => { vi.restoreAllMocks(); });

  const ballot = (votes: unknown[]) => votes.map((vote, index) => ({ mealId: fixture.meals[index].id, vote }));
  const submit = (swipes: unknown, participantId: unknown = fixture.participantId) =>
    client.request(`/swipes/${fixture.session.id}`, 'POST', { participantId, swipes });
  const state = () => ({
    swipes: getAll('SELECT * FROM swipes WHERE participant_id = ? ORDER BY session_meal_id', [fixture.participantId]),
    participant: getOne('SELECT * FROM participants WHERE id = ?', [fixture.participantId]),
    persisted: createHash('sha256').update(fs.readFileSync(process.env.DATABASE_PATH!)).digest('hex'),
  });

  it('preserves the complete accepted ballot when a later replacement vote is invalid', async () => {
    expect((await submit(ballot([1, 2]))).status).toBe(200);
    const accepted = state();
    expect((await submit(ballot([0, 99]))).status).toBe(400);
    expect(state()).toEqual(accepted);
  });

  it.each([0, 1, 2])('persists numeric vote %s and atomically replaces all choices', async vote => {
    const write = vi.spyOn(fs, 'writeFileSync');
    expect((await submit(ballot([vote, 2]))).status).toBe(200);
    expect(write).toHaveBeenCalledTimes(1);
    expect(getOne<{ submitted: number }>('SELECT submitted FROM participants WHERE id = ?', [fixture.participantId])?.submitted).toBe(1);
    write.mockClear();
    expect((await submit(ballot([2, vote]).reverse())).status).toBe(200);
    expect(write).toHaveBeenCalledTimes(1);
    const saved = getAll<{ meal_id: string; vote: number }>(
      `SELECT sm.meal_id, s.vote FROM swipes s JOIN session_meals sm ON sm.id = s.session_meal_id
       WHERE s.participant_id = ? ORDER BY sm.display_order`, [fixture.participantId]);
    expect(saved).toEqual([{ meal_id: fixture.meals[0].id, vote: 2 }, { meal_id: fixture.meals[1].id, vote }]);
  });

  it.each([-1, 3, 99, 1.5, '0', '1', '2', 'yes', true, null, undefined, {}, { toString: null }, [], [1]].map(vote => [vote]))(
    'rejects invalid vote %s without writing an initial or replacement ballot', async vote => {
      const initial = state();
      expect((await submit(ballot([0, vote]))).status).toBe(400);
      expect(state()).toEqual(initial);
      expect((await submit(ballot([1, 2]))).status).toBe(200);
      const accepted = state();
      expect((await submit(ballot([0, vote]))).status).toBe(400);
      expect(state()).toEqual(accepted);
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
    const initial = state();
    expect((await submit(payload())).status).toBe(400);
    expect(state()).toEqual(initial);
    expect((await submit(ballot([1, 2]))).status).toBe(200);
    const accepted = state();
    expect((await submit(payload())).status).toBe(400);
    expect(state()).toEqual(accepted);
  });

  it('rejects malformed participant IDs and participants belonging to another session', async () => {
    const initial = state();
    for (const id of [null, 1, {}, [], '', '   ']) {
      expect((await submit(ballot([1, 2]), id)).status).toBe(400);
      expect(state()).toEqual(initial);
    }
    const other = await createQuickFixture(client);
    expect((await submit(ballot([1, 2]), other.participantId)).status).toBe(404);
    expect(state().swipes).toEqual(initial.swipes);
    expect(state().participant).toEqual(initial.participant);
  });

  it('rejects a real option from another session without changing either ballot', async () => {
    const other = await createQuickFixture(client);
    expect((await submit(ballot([1, 2]))).status).toBe(200);
    const accepted = state();
    expect((await submit([{ mealId: fixture.meals[0].id, vote: 0 }, { mealId: other.meals[1].id, vote: 1 }])).status).toBe(400);
    expect(state()).toEqual(accepted);
    expect(getAll('SELECT * FROM swipes WHERE participant_id = ?', [other.participantId])).toEqual([]);
  });

  it.each([false, true])('rolls back an insert failure, including submitted=%s and persisted bytes', async submitted => {
    if (submitted) expect((await submit(ballot([1, 2]))).status).toBe(200);
    const original = state();
    // Abort the SECOND insert after the first row has been written inside the transaction.
    getDatabase().run(`CREATE TEMP TRIGGER reject_second_swipe BEFORE INSERT ON swipes
      WHEN NEW.vote = 0 BEGIN SELECT RAISE(ABORT, 'synthetic insert failure'); END`);
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect((await submit(ballot([2, 0]))).status).toBe(500);
      expect(state()).toEqual(original);
      expect(error).toHaveBeenCalled();
    } finally {
      getDatabase().run('DROP TRIGGER reject_second_swipe');
    }
    expect((await submit(ballot([0, 1]))).status).toBe(200);
  });

  it.each([false, true])('restores memory and disk when a partial write fails with submitted=%s', async submitted => {
    if (submitted) expect((await submit(ballot([1, 2]))).status).toBe(200);
    const original = state();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const writeFile = fs.writeFileSync;
    const write = vi.spyOn(fs, 'writeFileSync').mockImplementationOnce((filename) => {
      writeFile(filename, 'synthetic partial database');
      throw new Error('Synthetic disk failure');
    });
    expect((await submit(ballot([2, 0]))).status).toBe(500);
    expect(state()).toEqual(original);
    expect(fs.readdirSync(path.dirname(process.env.DATABASE_PATH!))).toEqual(['database.db']);
    write.mockRestore();
    expect((await submit(ballot([0, 1]))).status).toBe(200);
  });

  it('preserves memory and disk when atomic file replacement fails', async () => {
    expect((await submit(ballot([1, 2]))).status).toBe(200);
    const original = state();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const rename = vi.spyOn(fs, 'renameSync').mockImplementationOnce(() => { throw new Error('Synthetic rename failure'); });
    expect((await submit(ballot([0, 1]))).status).toBe(500);
    expect(state()).toEqual(original);
    expect(fs.readdirSync(path.dirname(process.env.DATABASE_PATH!))).toEqual(['database.db']);
    rename.mockRestore();
    expect((await submit(ballot([0, 1]))).status).toBe(200);
  });

  it.each(['EPERM', 'EACCES', 'EBUSY'])('retries transient %s file locks and persists the complete ballot', async code => {
    const realRename = fs.renameSync;
    let attempts = 0;
    const rename = vi.spyOn(fs, 'renameSync').mockImplementation((source, target) => {
      attempts++;
      if (attempts < 3) throw Object.assign(new Error('Transient file lock'), { code });
      realRename(source, target);
    });
    expect((await submit(ballot([1, 2]))).status).toBe(200);
    expect(rename).toHaveBeenCalledTimes(3);
    expect(getAll<{ vote: number }>('SELECT vote FROM swipes WHERE participant_id = ? ORDER BY vote', [fixture.participantId])).toEqual([{ vote: 1 }, { vote: 2 }]);
    expect(getOne<{ submitted: number }>('SELECT submitted FROM participants WHERE id = ?', [fixture.participantId])?.submitted).toBe(1);
    const SQL = (await import('sql.js')).default;
    const engine = await SQL();
    const persisted = new engine.Database(fs.readFileSync(process.env.DATABASE_PATH!));
    const savedVotes = persisted.prepare('SELECT vote FROM swipes WHERE participant_id = ? ORDER BY vote');
    savedVotes.bind([fixture.participantId]);
    const votes = [];
    while (savedVotes.step()) votes.push(savedVotes.getAsObject());
    savedVotes.free();
    expect(votes).toEqual([{ vote: 1 }, { vote: 2 }]);
    const savedParticipant = persisted.prepare('SELECT submitted FROM participants WHERE id = ?');
    savedParticipant.bind([fixture.participantId]);
    expect(savedParticipant.step()).toBe(true);
    expect(savedParticipant.getAsObject()).toEqual({ submitted: 1 });
    savedParticipant.free();
    persisted.close();
    expect(fs.readdirSync(path.dirname(process.env.DATABASE_PATH!))).toEqual(['database.db']);
  });

  it('bounds persistent file-lock retries and preserves the accepted ballot', async () => {
    expect((await submit(ballot([1, 2]))).status).toBe(200);
    const original = state();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const rename = vi.spyOn(fs, 'renameSync').mockImplementation(() => {
      throw Object.assign(new Error('Persistent file lock'), { code: 'EPERM' });
    });
    expect((await submit(ballot([0, 1]))).status).toBe(500);
    expect(rename).toHaveBeenCalledTimes(5);
    expect(state()).toEqual(original);
    expect(fs.readdirSync(path.dirname(process.env.DATABASE_PATH!))).toEqual(['database.db']);
  });

  it('returns sessionClosed for closed sessions and preserves accepted choices', async () => {
    expect((await submit(ballot([1, 2]))).status).toBe(200);
    expect((await client.request(`/close-session/${fixture.session.id}`, 'POST', { creatorToken: fixture.creatorToken })).status).toBe(200);
    const closed = state();
    expect(await submit(ballot([0, 0]))).toEqual({ status: 400, body: { error: 'This session has ended', sessionClosed: true } });
    expect(state()).toEqual(closed);
    expect(await client.request(`/join/${fixture.session.inviteCode}`)).toEqual({ status: 400, body: { error: 'This session has ended', sessionClosed: true } });
  });
});
