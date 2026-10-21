import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { baseline, open, preflight, tables } from './preflight.mjs';
import { rehearse, restore, localRuntime, insertData, readD1Table } from './d1-rehearsal.mjs';

test('actual D1 migrations, typed portable restore, empty-target guards and failure quarantine', { timeout: 120000 }, async t => {
  const db = await open();
  db.run((await baseline()).replace(/(CREATE TABLE (?:meals|sessions) \([\s\S]*?)host_id TEXT REFERENCES hosts\(id\)/g, '$1host_id TEXT NOT NULL REFERENCES hosts(id)'));
  db.run("INSERT INTO hosts(id,email,password_hash) VALUES ('h','fixture@example.invalid','synthetic-cost10-hash')");
  db.run("INSERT INTO meals(id,host_id,title,instructions,notes) VALUES ('m','h',?,?,?)", ["Chef's 🍽 meal", '\ufeffbefore\0after\n½ cup', new Uint8Array([0, 1, 255])]);
  db.run("UPDATE meals SET pick_count=0.5 WHERE id='m'");
  db.run("INSERT INTO meal_ingredients(id,meal_id,amount,ingredient,display_order) VALUES ('i2','m','a pinch','salt',2),('i1','m','¼ cup','beans',1)");
  db.run("INSERT INTO dinner_staples(rowid,id,host_id,title) VALUES (900,'d','h','Rice')");
  const bytes = db.export(); db.close();
  const inspected = await preflight(bytes);
  assert.equal(inspected.ok, true);
  const label = `test-${randomUUID()}`;
  let result;
  await t.test('migrations repeat through real ledger; every table and original Unicode/NUL/BLOB value compares', async () => {
    result = await rehearse(inspected.data, label);
    assert.equal(result.ok, true);
    assert.equal(result.repeatMigrationNoOp, true);
    assert.deepEqual(result.migrationNames, (await readdir(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../cloudflare/migrations'))).filter(name => /^\d+.*\.sql$/.test(name)).sort());
    assert.equal(result.comparisons.length, tables.length);
    assert.ok(result.comparisons.every(row => row.equal));
    const runtime = localRuntime(result.target);
    try {
      await runtime.ready;
      const binding = await runtime.getD1Database('DB');
      const meals = await readD1Table(binding, 'meals');
      assert.equal(meals[0].instructions, '\ufeffbefore\0after\n½ cup');
      assert.equal(meals[0].pick_count, 0.5);
      assert.deepEqual(meals[0].notes, new Uint8Array([0, 1, 255]));
      await assert.rejects(insertData(binding, inspected.data), /nonempty/);
    } finally { await runtime.dispose(); }
  });
  await t.test('portable backup restores into another isolated D1 target with exact hashes', async () => {
    const restored = await restore(result.backup, `${label}-restore`, result.backupSha256);
    assert.ok(restored.comparisons.every(row => row.equal));
    assert.equal(restored.foreignKeyViolations, 0);
    await assert.rejects(restore(result.backup, `${label}-bad-hash`, '0'.repeat(64)), /hash mismatch/);
    await assert.rejects(rehearse(inspected.data, label), /EEXIST/);
  });
  await t.test('a late bad insert quarantines its private target; no reset/retry', async () => {
    const bad = structuredClone(inspected.data);
    bad.meal_ingredients.push({ id: 'bad', meal_id: 'missing', amount: '', ingredient: 'Failure fixture', display_order: 3 });
    const failed = `${label}-failed`;
    await assert.rejects(rehearse(bad, failed), /quarantined/);
    const parent = path.dirname(result.target);
    await access(path.join(parent, failed, 'QUARANTINED.json'));
    await assert.rejects(rehearse(inspected.data, failed), /EEXIST/);
  });
  await t.test('path traversal and remote-looking labels cannot select a target', async () => {
    for (const label of ['../production', '/absolute', 'remote:production', 'C:\\data']) await assert.rejects(rehearse(inspected.data, label), /explicit local label/);
  });
  await t.test('changed source before final report quarantines target and never leaves an ok report', async () => {
    const changed = `${label}-changed`;
    await assert.rejects(rehearse(inspected.data, changed, {}, async () => { throw new Error('Synthetic source changed'); }), /quarantined/);
    const target = path.join(path.dirname(result.target), changed);
    assert.equal(JSON.parse(await readFile(path.join(target, 'QUARANTINED.json'))).stage, 'final-source-consistency');
    await assert.rejects(access(path.join(target, 'report.private.json')));
  });
});
