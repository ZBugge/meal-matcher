import test from 'node:test';
import assert from 'node:assert/strict';
import { readonlyD1 } from './remote-backup.mjs';

test('remote backup transmits prepared reads to one explicit target and rejects mutations and ambiguous results', async () => {
  const calls = [];
  const options = { accountId: 'a'.repeat(32), databaseId: '12345678-1234-1234-1234-123456789012', token: 'synthetic-token', intervalMs: 0, transport: async (url, init) => { calls.push({ url, init }); return Response.json({ success: true, result: [{ success: true, results: [{ n: 1 }] }] }); } };
  const db = readonlyD1(options);
  assert.deepEqual((await db.prepare('SELECT count(*) AS n FROM hosts WHERE id=?').bind('synthetic-id').all()).results, [{ n: 1 }]);
  assert(calls[0].url.includes(`/accounts/${options.accountId}/d1/database/${options.databaseId}/query`));
  assert.deepEqual(JSON.parse(calls[0].init.body).params, ['synthetic-id']);
  await assert.rejects(db.prepare('DELETE FROM hosts').all(), /read-only/);
  await assert.rejects(db.prepare('SELECT 1; DELETE FROM hosts').all(), /read-only/);
  await assert.rejects(db.prepare('PRAGMA foreign_keys=OFF').all(), /read-only/);
  await assert.rejects(db.prepare('SELECT 1').run(), /cannot mutate/);
  await assert.rejects(db.batch([]), /cannot mutate/);
  assert.equal(calls.length, 1);
  const failed = readonlyD1({ ...options, transport: async () => Response.json({ success: true, result: [{ success: false, results: [] }] }) });
  await assert.rejects(failed.prepare('SELECT 1').all(), /read failed/);
});
