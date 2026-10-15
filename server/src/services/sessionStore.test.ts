import { beforeAll, describe, expect, it } from 'vitest';
import type session from 'express-session';
import fs from 'fs';
import initSqlJs from 'sql.js';
import { initializeDatabase, getOne, runQuery } from '../db/schema';
import { SqliteSessionStore } from './sessionStore';

const value = (expires: number) => ({ cookie: { expires: new Date(expires), originalMaxAge: 10000 }, hostId: 'family-host' }) as session.SessionData;
const read = (store: SqliteSessionStore, id: string) => new Promise<session.SessionData | null | undefined>((resolve, reject) => store.get(id, (error, data) => error ? reject(error) : resolve(data)));
const save = (store: SqliteSessionStore, id: string, data: session.SessionData) => new Promise<void>((resolve, reject) => store.set(id, data, error => error ? reject(error) : resolve()));

describe('persistent family sign-in', () => {
  beforeAll(async () => { await initializeDatabase(); });
  it('keeps signed-in identity in saved bytes and a fresh store, then revokes it on logout', async () => {
    await save(new SqliteSessionStore(), 'saved-session', value(Date.now() + 100000));
    expect(await read(new SqliteSessionStore(), 'saved-session')).toMatchObject({ hostId: 'family-host' });
    const SQL = await initSqlJs();
    const reopened = new SQL.Database(fs.readFileSync(process.env.DATABASE_PATH!));
    expect(reopened.exec("SELECT data FROM login_sessions WHERE id = 'saved-session'")[0].values[0][0]).toContain('family-host');
    reopened.close();
    await new Promise<void>((resolve, reject) => new SqliteSessionStore().destroy('saved-session', error => error ? reject(error) : resolve()));
    expect(await read(new SqliteSessionStore(), 'saved-session')).toBeNull();
  });
  it('expires old sessions and never resurrects a deleted session while touching it', async () => {
    await save(new SqliteSessionStore(), 'expired-session', value(Date.now() - 1000));
    expect(await read(new SqliteSessionStore(), 'expired-session')).toBeNull();
    expect(getOne('SELECT id FROM login_sessions WHERE id = ?', ['expired-session'])).toBeUndefined();
    await new Promise<void>((resolve, reject) => new SqliteSessionStore().touch('expired-session', value(Date.now() + 86400000), error => error ? reject(error) : resolve()));
    expect(await read(new SqliteSessionStore(), 'expired-session')).toBeNull();
  });
  it('reports corrupt stored data rather than accepting a signed-in identity', async () => {
    runQuery('INSERT INTO login_sessions VALUES (?, ?, ?)', ['bad-session', '{broken', Date.now() + 100000]);
    await expect(read(new SqliteSessionStore(), 'bad-session')).rejects.toBeDefined();
  });
});
