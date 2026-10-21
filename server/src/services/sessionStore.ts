import session from 'express-session';
import { getOne, runQuery, Mutation } from '../db/schema';
const expiry = (value: session.SessionData): number => value.cookie.expires ? new Date(value.cookie.expires).getTime() : Date.now() + 30 * 86400000;
// Tombstones deliberately outlive cookies and are never automatically removed:
// a delayed request cannot resurrect an identifier revoked by logout/rotation.
export class SqliteSessionStore extends session.Store {
    get(id: string, callback: (error: unknown, value?: session.SessionData | null) => void): void {
        (async () => {
            const row = await getOne<{
                data: string;
                expires: number;
            }>('SELECT data, expires FROM login_sessions WHERE id = ? AND NOT EXISTS(SELECT 1 FROM session_tombstones WHERE id = ?)', [id, id]);
            if (!row)
                return null;
            if (row.expires <= Date.now()) {
                const batch = new Mutation();
                batch.run('INSERT OR IGNORE INTO session_tombstones(id, revoked_at) SELECT id, ? FROM login_sessions WHERE id = ? AND expires <= ?', [Date.now(), id, Date.now()]);
                batch.run('DELETE FROM login_sessions WHERE id = ? AND EXISTS(SELECT 1 FROM session_tombstones WHERE id = ?)', [id, id]);
                await batch.commit();
                return null;
            }
            return JSON.parse(row.data) as session.SessionData;
        })().then(value => callback(null, value), error => callback(error));
    }
    set(id: string, value: session.SessionData, callback: (error?: unknown) => void = () => { }): void {
        const now = Date.now();
        const expires = expiry(value);
        runQuery(`INSERT INTO login_sessions(id, data, expires) SELECT ?, ?, ? WHERE ? > ? AND NOT EXISTS(SELECT 1 FROM session_tombstones WHERE id = ?)
      ON CONFLICT(id) DO UPDATE SET data = excluded.data, expires = MAX(login_sessions.expires, excluded.expires)
      WHERE login_sessions.expires > ? AND NOT EXISTS(SELECT 1 FROM session_tombstones WHERE id = ?)`, [id, JSON.stringify(value), expires, expires, now, id, now, id]).then(() => callback(), callback);
    }
    destroy(id: string, callback: (error?: unknown) => void = () => { }): void {
        const batch = new Mutation();
        batch.run('INSERT OR IGNORE INTO session_tombstones(id, revoked_at) VALUES (?, ?)', [id, Date.now()]);
        batch.run('DELETE FROM login_sessions WHERE id = ?', [id]);
        batch.commit().then(() => callback(), callback);
    }
    touch(id: string, value: session.SessionData, callback: (error?: unknown) => void = () => { }): void {
        runQuery('UPDATE login_sessions SET expires = MAX(expires, ?) WHERE id = ? AND expires > ? AND expires + 300000 < ? AND NOT EXISTS(SELECT 1 FROM session_tombstones WHERE id = ?)', [expiry(value), id, Date.now(), expiry(value), id]).then(() => callback(), callback);
    }
}
