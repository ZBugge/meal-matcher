import { beforeAll, describe, expect, it } from 'vitest';
import type session from 'express-session';
import { initializeDatabase, getOne, runQuery } from '../test/db';
import { inTestRuntime, restartTestFixture } from '../test/runtime';
import { SqliteSessionStore } from './sessionStore';
const value = (expires: number) => ({ cookie: { expires: new Date(expires), originalMaxAge: 10000 }, hostId: 'family-host' }) as session.SessionData;
const read = (store: SqliteSessionStore, id: string) => inTestRuntime(() => new Promise<session.SessionData | null | undefined>((resolve, reject) => store.get(id, (error, data) => error ? reject(error) : resolve(data))));
const save = (store: SqliteSessionStore, id: string, data: session.SessionData) => inTestRuntime(() => new Promise<void>((resolve, reject) => store.set(id, data, error => error ? reject(error) : resolve())));
const destroy = (id: string) => inTestRuntime(() => new Promise<void>((resolve, reject) => new SqliteSessionStore().destroy(id, error => error ? reject(error) : resolve())));
const touch = (id: string, data: session.SessionData) => inTestRuntime(() => new Promise<void>((resolve, reject) => new SqliteSessionStore().touch(id, data, error => error ? reject(error) : resolve())));
describe('persistent family sign-in', () => {
    beforeAll(async () => { await initializeDatabase(); });
    it('keeps signed-in identity in saved bytes and a fresh store, then revokes it on logout', async () => {
        await save(new SqliteSessionStore(), 'saved-session', value(Date.now() + 100000));
        expect(await read(new SqliteSessionStore(), 'saved-session')).toMatchObject({ hostId: 'family-host' });
        await restartTestFixture();
        expect((await getOne<{
            data: string;
        }>("SELECT data FROM login_sessions WHERE id='saved-session'"))?.data).toContain('family-host');
        await destroy('saved-session');
        expect(await read(new SqliteSessionStore(), 'saved-session')).toBeNull();
        await Promise.all([save(new SqliteSessionStore(), 'saved-session', value(Date.now() + 86400000)), touch('saved-session', value(Date.now() + 86400000))]);
        expect(await read(new SqliteSessionStore(), 'saved-session')).toBeNull();
    });
    it('expires old sessions and never resurrects a deleted session while touching it', async () => {
        await save(new SqliteSessionStore(), 'expired-session', value(Date.now() - 1000));
        expect(await read(new SqliteSessionStore(), 'expired-session')).toBeNull();
        expect(await getOne('SELECT id FROM login_sessions WHERE id=?', ['expired-session'])).toBeUndefined();
        await touch('expired-session', value(Date.now() + 86400000));
        expect(await read(new SqliteSessionStore(), 'expired-session')).toBeNull();
    });
    it('reports corrupt stored data rather than accepting a signed-in identity', async () => { await runQuery('INSERT INTO login_sessions VALUES (?,?,?)', ['bad-session', '{broken', Date.now() + 100000]); await expect(read(new SqliteSessionStore(), 'bad-session')).rejects.toBeDefined(); });
    it('preserves monotonic expiry and tombstones an expired identity before any late set or touch', async () => {
        const id = 'late-expiry-race';
        const now = Date.now();
        await save(new SqliteSessionStore(), id, value(now + 1000000));
        await Promise.all([touch(id, value(now + 2000000)), touch(id, value(now + 500000))]);
        expect((await getOne<{
            expires: number;
        }>('SELECT expires FROM login_sessions WHERE id=?', [id]))?.expires).toBe(now + 2000000);
        await runQuery('UPDATE login_sessions SET expires=? WHERE id=?', [Date.now() - 10, id]);
        expect(await read(new SqliteSessionStore(), id)).toBeNull();
        await Promise.all([save(new SqliteSessionStore(), id, value(now + 86400000)), touch(id, value(now + 86400000))]);
        expect(await read(new SqliteSessionStore(), id)).toBeNull();
        expect(await getOne('SELECT id FROM session_tombstones WHERE id=?', [id])).toEqual({ id });
    });
});
