import session from 'express-session';
import { getOne, runQuery } from '../db/schema';

// Keep family sign-ins across deployments using the app's existing private database.
export class SqliteSessionStore extends session.Store {
  get(id: string, callback: (error: unknown, value?: session.SessionData | null) => void): void {
    try {
      const row = getOne<{ data: string; expires: number }>('SELECT data, expires FROM login_sessions WHERE id = ?', [id]);
      if (!row || row.expires <= Date.now()) {
        if (row) runQuery('DELETE FROM login_sessions WHERE id = ?', [id]);
        callback(null, null);
        return;
      }
      callback(null, JSON.parse(row.data));
    } catch (error) { callback(error); }
  }

  set(id: string, value: session.SessionData, callback?: (error?: unknown) => void): void {
    try {
      const expiry = value.cookie.expires ? new Date(value.cookie.expires).getTime() : Date.now() + 30 * 86400000;
      runQuery('INSERT OR REPLACE INTO login_sessions (id, data, expires) VALUES (?, ?, ?)', [id, JSON.stringify(value), expiry]);
      callback?.();
    } catch (error) { callback?.(error); }
  }

  destroy(id: string, callback?: (error?: unknown) => void): void {
    try {
      runQuery('DELETE FROM login_sessions WHERE id = ?', [id]);
      callback?.();
    } catch (error) { callback?.(error); }
  }

  touch(id: string, value: session.SessionData, callback?: (error?: unknown) => void): void {
    try {
      const expiry = value.cookie.expires ? new Date(value.cookie.expires).getTime() : Date.now() + 30 * 86400000;
      const row = getOne<{ expires: number }>('SELECT expires FROM login_sessions WHERE id = ?', [id]);
      // Avoid exporting the entire database for every polling request.
      if (row && expiry > row.expires + 5 * 60000) runQuery('UPDATE login_sessions SET expires = ? WHERE id = ?', [expiry, id]);
      callback?.();
    } catch (error) { callback?.(error); }
  }
}
