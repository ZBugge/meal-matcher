import { beforeAll, describe, expect, it } from 'vitest';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { Mutation, libraryRevision } from '../db/schema';
import { commitSessionCreation } from '../services/session-creation';
import { getAll, getOne, runQuery } from '../test/db';
import { startHttpTestServer, type HttpTestClient, type HttpTestServer } from '../test/http';
import { inTestRuntime, restartTestFixture } from '../test/runtime';

describe('Durable create retries', () => {
    let server: HttpTestServer, owner: HttpTestClient, other: HttpTestClient, host: string;
    const week = '2026-10-12', nextWeek = '2026-10-19';
    beforeAll(async () => {
        server = await startHttpTestServer(); owner = server.client(); other = server.client();
        const register = (client: HttpTestClient) => client.request('/auth/register', 'POST', { email: `${randomUUID()}@example.test`, password: 'synthetic-password' });
        const registered = await register(owner); expect(registered.status).toBe(201); host = registered.body.id;
        expect((await register(other)).status).toBe(201);
    });
    it('retries an actual invite uniqueness collision with all guards, bounds exhaustion, and never retries a general write failure', async () => {
        await runQuery("INSERT INTO sessions(id,host_id,invite_code) VALUES ('collision-existing',?,'COLLID')", [host]);
        await inTestRuntime(async () => {
            const revision = await libraryRevision(host);
            let attempts = 0;
            const build = (code: string) => {
                attempts++; const batch = new Mutation(); batch.library(host, revision);
                batch.run('INSERT INTO sessions(id,host_id,invite_code) VALUES (?,?,?)', ['collision-new', host, code]);
                return batch;
            };
            expect(await commitSessionCreation(build, () => attempts === 0 ? 'COLLID' : 'UNUSED')).toBe('UNUSED');
            expect(attempts).toBe(2);
            expect(await libraryRevision(host)).toBe(revision + 1);
            expect(await getOne("SELECT COUNT(*) AS count FROM sessions WHERE id='collision-new'")).toEqual({ count: 1 });
            attempts = 0;
            await expect(commitSessionCreation(code => { attempts++; const batch = new Mutation(); batch.run('INSERT INTO sessions(id,host_id,invite_code) VALUES (?,?,?)', [randomUUID(), host, code]); return batch; }, () => 'COLLID')).rejects.toThrow('Failed to generate unique invite code');
            expect(attempts).toBe(10);
            attempts = 0;
            await runQuery("CREATE TRIGGER retry_general_failure BEFORE INSERT ON mutation_receipts BEGIN SELECT RAISE(ABORT,'Synthetic general write failure'); END");
            try {
                await expect(commitSessionCreation(code => { attempts++; const batch = new Mutation(); batch.run('INSERT INTO sessions(id,host_id,invite_code) VALUES (?,?,?)', [randomUUID(), host, code]); return batch; }, () => 'ERROR1')).rejects.toThrow('Synthetic general write failure');
                expect(attempts).toBe(1);
                expect(await getOne("SELECT id FROM sessions WHERE invite_code='ERROR1'")).toBeUndefined();
            } finally { await runQuery('DROP TRIGGER retry_general_failure'); }
        });
    });
    it('handles deterministic invite collisions through both HTTP create routes without partial domain writes', async () => {
        const meal = await owner.request('/meals', 'POST', { title: 'Collision-safe meal' }); expect(meal.status).toBe(201);
        const snapshot = async () => ({
            revision: await getOne('SELECT library_revision FROM hosts WHERE id=?', [host]),
            counts: await Promise.all(['sessions', 'session_meals', 'meals', 'participants'].map(table => getOne(`SELECT COUNT(*) AS count FROM ${table}`))),
        });
        const before = await snapshot();
        await runQuery("CREATE TRIGGER deterministic_invite_collision BEFORE INSERT ON sessions BEGIN SELECT RAISE(ABORT,'UNIQUE constraint failed: sessions.invite_code'); END");
        try {
            const authenticated = await owner.request('/sessions', 'POST', { mealIds: [meal.body.id], mode: 'home' });
            const quick = await owner.request('/quick-session', 'POST', { creatorName: 'Host', meals: [{ title: 'One' }, { title: 'Two' }] });
            for (const response of [authenticated, quick]) { expect(response.status).toBe(500); expect(response.body.error).toBe('Failed to generate unique invite code'); }
            expect(await snapshot()).toEqual(before);
        } finally { await runQuery('DROP TRIGGER deterministic_invite_collision'); }
    });
    it('replays every planning create after discarding the first HTTP acknowledgement and a Worker restart', async () => {
        const source = await owner.request(`/plans/${week}/entries`, 'POST', { kind: 'takeout', title: 'Original repeat source' });
        expect(source.status).toBe(201);
        const sourceId = source.body.entries.find((entry: { title: string }) => entry.title === 'Original repeat source').id;
        const cases = [
            { resource: 'entries', body: { kind: 'takeout', title: 'Acknowledgement lost dinner' } },
            { resource: 'items', body: { ingredient: 'Acknowledgement lost milk', amount: 'one carton' } },
            { resource: 'repeat', body: { targetWeek: nextWeek, entryIds: [sourceId] } },
            { resource: 'staples', body: { title: 'Acknowledgement lost staple' } },
            { resource: 'recurring', body: { ingredient: 'Acknowledgement lost usual', amount: 'two' } },
        ];
        const requests = cases.map(test => ({ ...test, key: randomUUID() }));
        for (const test of requests) {
            // Deliberately discard the first successful HTTP response.
            await owner.request(`/plans/${week}/${test.resource}`, 'POST', test.body, { 'Idempotency-Key': test.key });
        }
        await restartTestFixture();
        for (const test of requests) expect((await owner.request(`/plans/${week}/${test.resource}`, 'POST', test.body, { 'Idempotency-Key': test.key })).status).toBe(201);
        expect(await getOne("SELECT COUNT(*) AS count FROM plan_entries WHERE host_id=? AND title='Acknowledgement lost dinner'", [host])).toEqual({ count: 1 });
        expect(await getOne("SELECT COUNT(*) AS count FROM shopping_items WHERE host_id=? AND ingredient='Acknowledgement lost milk'", [host])).toEqual({ count: 1 });
        expect(await getOne('SELECT COUNT(*) AS count FROM plan_entries WHERE host_id=? AND week=?', [host, nextWeek])).toEqual({ count: 1 });
        expect(await getOne("SELECT COUNT(*) AS count FROM dinner_staples WHERE host_id=? AND title='Acknowledgement lost staple'", [host])).toEqual({ count: 1 });
        expect(await getOne("SELECT COUNT(*) AS count FROM recurring_groceries WHERE host_id=? AND ingredient='Acknowledgement lost usual'", [host])).toEqual({ count: 1 });
        // An accepted repeat remains replayable after its original source is removed.
        expect((await owner.request(`/plans/${week}/entries/${sourceId}`, 'DELETE')).status).toBe(200);
        expect((await owner.request(`/plans/${week}/repeat`, 'POST', requests[2].body, { 'Idempotency-Key': requests[2].key })).status).toBe(201);
    });
    it('commits concurrent identical keys once, rejects changed data, and isolates host and resource scopes', async () => {
        const key = randomUUID(), headers = { 'Idempotency-Key': key }, path = `/plans/${week}/recurring`;
        const body = { ingredient: 'Concurrent usual', amount: 'one' };
        const accepted = await Promise.all([owner.request(path, 'POST', body, headers), owner.request(path, 'POST', body, headers)]);
        expect(accepted.map(response => response.status)).toEqual([201, 201]);
        expect(accepted[0].body).toEqual(accepted[1].body);
        expect(await getOne("SELECT COUNT(*) AS count FROM recurring_groceries WHERE host_id=? AND ingredient='Concurrent usual'", [host])).toEqual({ count: 1 });
        expect((await owner.request(path, 'POST', { amount: 'one', ingredient: 'Concurrent usual' }, headers)).body).toEqual(accepted[0].body);
        expect((await owner.request(path, 'POST', { ...body, amount: 'changed' }, headers)).status).toBe(409);
        const isolated = await other.request(path, 'POST', body, headers); expect(isolated.status).toBe(201); expect(isolated.body.id).not.toBe(accepted[0].body.id);
        expect((await owner.request(`/plans/${week}/items`, 'POST', { ingredient: 'Scoped item' }, headers)).status).toBe(201);
        expect((await owner.request(`/plans/${nextWeek}/items`, 'POST', { ingredient: 'Scoped item' }, headers)).status).toBe(201);
        expect((await owner.request(path, 'POST', body, { 'Idempotency-Key': 'short' })).status).toBe(400);
        const concurrentMismatch = randomUUID();
        const mismatch = await Promise.all(['First', 'Second'].map(title => owner.request(`/plans/${week}/entries`, 'POST', { kind: 'takeout', title }, { 'Idempotency-Key': concurrentMismatch })));
        expect(mismatch.map(response => response.status).sort()).toEqual([201, 409]);
    });
    it('rolls back an operation receipt on late D1 failure and allows an explicit retry', async () => {
        const key = randomUUID(), headers = { 'Idempotency-Key': key }, path = `/plans/${week}/items`, body = { ingredient: 'Recoverable failed item' };
        await runQuery("CREATE TRIGGER retry_receipt_failure BEFORE INSERT ON mutation_receipts BEGIN SELECT RAISE(ABORT,'Synthetic late failure'); END");
        try { expect((await owner.request(path, 'POST', body, headers)).status).toBe(500); }
        finally { await runQuery('DROP TRIGGER retry_receipt_failure'); }
        expect(await getAll('SELECT key FROM operation_receipts WHERE key=?', [key])).toEqual([]);
        expect(await getOne("SELECT COUNT(*) AS count FROM shopping_items WHERE ingredient='Recoverable failed item'")).toEqual({ count: 0 });
        expect((await owner.request(path, 'POST', body, headers)).status).toBe(201);
        expect((await owner.request(path, 'POST', body, headers)).status).toBe(201);
        expect(await getOne("SELECT COUNT(*) AS count FROM shopping_items WHERE ingredient='Recoverable failed item'")).toEqual({ count: 1 });
    });
    it('deduplicates authenticated session creation across lost acknowledgements, concurrent requests and restart', async () => {
        const meal = await owner.request('/meals', 'POST', { title: 'Retry session meal' }); expect(meal.status).toBe(201);
        const body = { mode: 'home', mealIds: [meal.body.id] }, key = randomBytes(32).toString('hex'), headers = { 'Idempotency-Key': key };
        await owner.request('/sessions', 'POST', body, headers);
        const accepted = await getOne<{ response: string }>('SELECT response FROM operation_receipts WHERE host_id=? AND key=?', [host, key]);
        expect(accepted).toBeDefined();
        await restartTestFixture();
        const replay = await owner.request('/sessions', 'POST', body, headers);
        expect(replay.status).toBe(201); expect(replay.body).toEqual(JSON.parse(accepted!.response).value);
        expect(await getOne('SELECT COUNT(*) AS count FROM sessions WHERE id=?', [replay.body.id])).toEqual({ count: 1 });
        expect((await owner.request('/sessions', 'POST', { ...body, mealIds: [] }, headers)).status).toBe(409);
        expect((await other.request('/sessions', 'POST', body, headers)).status).toBe(400);
        const concurrentKey = { 'Idempotency-Key': randomBytes(32).toString('hex') };
        const concurrent = await Promise.all([owner.request('/sessions', 'POST', body, concurrentKey), owner.request('/sessions', 'POST', body, concurrentKey)]);
        expect(concurrent.map(result => result.status)).toEqual([201, 201]); expect(concurrent[0].body).toEqual(concurrent[1].body);
        expect(await getOne('SELECT COUNT(*) AS count FROM session_meals WHERE session_id=?', [concurrent[0].body.id])).toEqual({ count: 1 });
    });
    it('replays anonymous quick creates only with the original hashed capability and matching request data', async () => {
        const client = server.client(), key = randomBytes(32).toString('hex'), headers = { 'Idempotency-Key': key };
        const body = { creatorName: 'Retry creator', meals: [{ title: 'Retry soup' }, { title: 'Retry pasta' }] };
        await client.request('/quick-session', 'POST', body, headers);
        const hash = createHash('sha256').update(key).digest('hex');
        const receipt = await getOne<{ response: string; key_hash: string }>('SELECT key_hash,response FROM anonymous_operation_receipts WHERE key_hash=?', [hash]);
        expect(receipt?.key_hash).not.toBe(key); expect(receipt).toBeDefined();
        await restartTestFixture();
        const replay = await server.client().request('/quick-session', 'POST', body, headers);
        expect(replay.status).toBe(200); expect(replay.body).toEqual(JSON.parse(receipt!.response).value);
        expect(replay.body.creatorToken).toMatch(/^[a-f0-9]{64}$/);
        expect(await getOne('SELECT COUNT(*) AS count FROM participants WHERE session_id=?', [replay.body.session.id])).toEqual({ count: 1 });
        expect((await client.request('/quick-session', 'POST', { ...body, creatorName: 'Different' }, headers)).status).toBe(409);
        const wrongKey = await server.client().request('/quick-session', 'POST', body, { 'Idempotency-Key': randomBytes(32).toString('hex') });
        expect(wrongKey.status).toBe(200); expect(wrongKey.body.session.id).not.toBe(replay.body.session.id); expect(wrongKey.body.creatorToken).not.toBe(replay.body.creatorToken);
        expect(JSON.stringify(wrongKey.body)).not.toContain(replay.body.creatorToken);
        expect((await server.client().request(`/join/${replay.body.session.inviteCode}`, 'POST', { displayName: 'Public voter' })).body.creatorToken).toBeUndefined();
        expect((await server.client().request('/quick-session', 'POST', body, { 'Idempotency-Key': randomUUID() })).status).toBe(400);
        const concurrentKey = { 'Idempotency-Key': randomBytes(32).toString('hex') };
        const concurrent = await Promise.all([server.client().request('/quick-session', 'POST', body, concurrentKey), server.client().request('/quick-session', 'POST', body, concurrentKey)]);
        expect(concurrent.map(result => result.status)).toEqual([200, 200]); expect(concurrent[0].body).toEqual(concurrent[1].body);
        expect(await getOne('SELECT COUNT(*) AS count FROM participants WHERE session_id=?', [concurrent[0].body.session.id])).toEqual({ count: 1 });
    });
    it('keeps authenticated quick receipts host-owned and rolls anonymous receipts back on a late failure', async () => {
        const body = { creatorName: 'Authenticated retry creator', meals: [{ title: 'Owned retry soup' }] };
        const key = randomBytes(32).toString('hex'), headers = { 'Idempotency-Key': key };
        const owned = await Promise.all([owner.request('/quick-session', 'POST', body, headers), owner.request('/quick-session', 'POST', body, headers)]);
        expect(owned.map(result => result.status)).toEqual([200, 200]); expect(owned[0].body).toEqual(owned[1].body); expect(owned[0].body.creatorToken).toBeNull();
        expect(await getOne('SELECT host_id FROM sessions WHERE id=?', [owned[0].body.session.id])).toEqual({ host_id: host });
        const anonymous = server.client(), anonymousKey = randomBytes(32).toString('hex'), anonymousHeaders = { 'Idempotency-Key': anonymousKey };
        await runQuery("CREATE TRIGGER anonymous_receipt_failure BEFORE INSERT ON mutation_receipts BEGIN SELECT RAISE(ABORT,'Synthetic anonymous late failure'); END");
        try { expect((await anonymous.request('/quick-session', 'POST', body, anonymousHeaders)).status).toBe(500); }
        finally { await runQuery('DROP TRIGGER anonymous_receipt_failure'); }
        const hash = createHash('sha256').update(anonymousKey).digest('hex');
        expect(await getOne('SELECT key_hash FROM anonymous_operation_receipts WHERE key_hash=?', [hash])).toBeUndefined();
        const retried = await anonymous.request('/quick-session', 'POST', body, anonymousHeaders); expect(retried.status).toBe(200);
        expect((await anonymous.request('/quick-session', 'POST', body, anonymousHeaders)).body).toEqual(retried.body);
        expect(retried.body.session.id).not.toBe(owned[0].body.session.id);
    });
});
