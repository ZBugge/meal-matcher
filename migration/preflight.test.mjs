import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { baseline, open, preflight, rows, readTable, sqlValue, tables, canonical } from './preflight.mjs';

const token = 'a'.repeat(64);

test('historical partial-schema fixtures are refused without changing their source bytes or records', async () => {
  // These are the pre-mode and pre-family layouts formerly upgraded at Node
  // application startup. Administrative import deliberately requires the reviewed
  // complete source schema; a partial layout must never be guessed or uploaded.
  for (const sql of [
    `CREATE TABLE meals(id TEXT PRIMARY KEY, host_id TEXT NOT NULL, type TEXT, archived INTEGER DEFAULT 0);
     CREATE TABLE sessions(id TEXT PRIMARY KEY);
     CREATE TABLE hosts(id TEXT PRIMARY KEY, email TEXT NOT NULL, password_hash TEXT NOT NULL);`,
    `CREATE TABLE hosts(id TEXT PRIMARY KEY, email TEXT, password_hash TEXT);
     CREATE TABLE meals(id TEXT PRIMARY KEY, host_id TEXT, type TEXT, archived INTEGER);
     CREATE TABLE sessions(id TEXT PRIMARY KEY);`,
  ]) {
    const db = await open();
    db.run(sql);
    db.run("INSERT INTO hosts VALUES ('legacy-host','synthetic@example.invalid','legacy-hash')");
    db.run("INSERT INTO meals VALUES ('legacy-meal','legacy-host',NULL,0)");
    db.run("INSERT INTO sessions VALUES ('legacy-session')");
    const original = db.export();
    const hash = createHash('sha256').update(original).digest('hex');
    const result = await preflight(original);
    assert.equal(result.ok, false);
    assert.equal(result.data, undefined);
    assert(result.errors.length > 0);
    assert.equal(createHash('sha256').update(original).digest('hex'), hash);
    const reopened = await open(original);
    assert.deepEqual(rows(reopened, 'SELECT * FROM meals'), [{ id: 'legacy-meal', host_id: 'legacy-host', type: null, archived: 0 }]);
    reopened.close(); db.close();
  }
});
async function fixture(change = () => {}) {
  const db = await open();
  // Actual legacy declaration differs only in anonymous host nullability.
  db.run((await baseline()).replace(/(CREATE TABLE (?:meals|sessions) \([\s\S]*?)host_id TEXT REFERENCES hosts\(id\)/g, '$1host_id TEXT NOT NULL REFERENCES hosts(id)'));
  db.run("INSERT INTO hosts(id,email,password_hash) VALUES ('h','synthetic@example.invalid','synthetic')");
  db.run('INSERT INTO meals(id,host_id,title,temporary,creator_token) VALUES (?,?,?,?,?)', ['m', `temp_${token}`, 'Dinner', 1, token]);
  db.run('INSERT INTO sessions(id,host_id,invite_code) VALUES (?,?,?)', ['s', `temp_${token}`, 'ABCDEF']);
  db.run("INSERT INTO session_meals(id,session_id,meal_id,display_order) VALUES ('sm','s','m',0)");
  db.run("INSERT INTO participants(id,session_id,display_name) VALUES ('p','s','Test')");
  db.run("INSERT INTO swipes(id,participant_id,session_meal_id,vote) VALUES ('w','p','sm',2)");
  db.run("INSERT INTO meals(id,host_id,title,instructions,notes,archived,pick_count) VALUES ('m2','h','Regular',?, ?,1,7)", ["\ufeffSauté\nDon't guess quantities.\0Finish.", 'Private only']);
  db.run("INSERT INTO meal_ingredients(id,meal_id,amount,ingredient,display_order) VALUES ('i2','m2','to taste','盐',1),('i1','m2','½ cup','beans',0)");
  db.run("INSERT INTO plan_entries(rowid,id,host_id,week,meal_id,kind,title) VALUES (22,'pe','h','2026-10-19','m2','meal','Dinner')");
  db.run("INSERT INTO shopping_items(rowid,id,host_id,week,entry_id,ingredient,state,display_order) VALUES (91,'sh','h','2026-10-19','pe','beans','bought',2)");
  db.run("INSERT INTO dinner_staples(rowid,id,host_id,title) VALUES (8,'ds','h','Rice')");
  db.run("INSERT INTO recurring_groceries(rowid,id,host_id,ingredient) VALUES (19,'rg','h','Apples')");
  db.run("INSERT INTO notion_connections(host_id,token_ciphertext,data_source_id,source_url) VALUES ('h','synthetic-ciphertext','source','https://example.invalid')");
  db.run("INSERT INTO notion_recipes(host_id,data_source_id,page_id,meal_id,source_url,content_hash) VALUES ('h','source','page','m2','https://example.invalid','synthetic-hash')");
  change(db);
  const bytes = db.export();
  db.close();
  return bytes;
}

test('verified anonymous contexts alone become null; exact values/order survive FK-enforced baseline', async () => {
  const result = await preflight(await fixture());
  assert.equal(result.ok, true);
  assert.deepEqual(result.transformations, { anonymousSessionOwners: 1, anonymousMealOwners: 1 });
  assert.equal(result.foreignKeyViolations, 0);
  assert.equal(result.comparisons.length, 15);
  assert.ok(result.comparisons.every(row => row.equal));
  assert.equal(result.data.meals.find(row => row.id === 'm2').host_id, 'h');
  assert.equal(result.data.meals.find(row => row.id === 'm2').instructions, "\ufeffSauté\nDon't guess quantities.\0Finish.");
  assert.equal(result.data.shopping_items[0].__migration_rowid, 91);
  assert.equal(result.data.notion_connections[0].token_ciphertext, 'synthetic-ciphertext');
});

test('unexpected owners and inconsistent anonymous tokens are refused', async () => {
  for (const change of [
    db => db.run("UPDATE sessions SET host_id='missing-owner'"),
    db => db.run("UPDATE meals SET creator_token='wrong' WHERE id='m'"),
    db => db.run("UPDATE meals SET temporary=0 WHERE id='m'"),
    db => db.run("DELETE FROM session_meals"),
    db => db.run("INSERT INTO sessions(id,host_id,invite_code) SELECT 's2',host_id,'UVWXYZ' FROM sessions"),
    db => { db.run("INSERT INTO sessions(id,host_id,invite_code) VALUES ('s2','h','UVWXYZ')"); db.run("INSERT INTO session_meals(id,session_id,meal_id) VALUES ('sm2','s2','m')"); },
    db => db.run("INSERT INTO session_meals(id,session_id,meal_id) VALUES ('sm2','s','m2')"),
  ]) {
    const result = await preflight(await fixture(change));
    assert.equal(result.ok, false);
    assert.ok(result.errors.length > 0);
    assert.equal(result.data, undefined);
    assert.ok(!JSON.stringify(result).includes(token));
  }
});

test('unexpected foreign keys, unknown tables and column drift block copying', async () => {
  for (const change of [
    db => db.run("UPDATE participants SET host_id='unknown'"),
    db => db.run('CREATE TABLE unreviewed_secret_records(id TEXT)'),
    db => db.run('ALTER TABLE hosts ADD COLUMN unreviewed TEXT'),
    db => db.run('CREATE INDEX unreviewed_index ON hosts(email)'),
    db => db.run('DROP TABLE notion_connections'),
    db => db.run('CREATE VIEW unknown_view AS SELECT * FROM hosts'),
    db => db.run("CREATE TRIGGER unknown_trigger AFTER INSERT ON hosts BEGIN UPDATE hosts SET email=email; END"),
  ]) assert.equal((await preflight(await fixture(change))).ok, false);
});

test('nullable schema cannot disguise unproven null owners', async () => {
  const db = await open();
  db.run(await baseline());
  db.run("INSERT INTO meals(id,title) VALUES ('unproven','Unproven')");
  assert.equal((await preflight(db.export())).ok, false);
  db.close();
});

test('legacy literal text cannot silently become a runtime chunk reference', async () => {
  const literal = '\u001fmealmatch:text:11111111-1111-4111-8111-111111111111:' + 'a'.repeat(64);
  const bytes = await fixture(db => db.run('UPDATE meals SET instructions=? WHERE id=?', [literal, 'm2']));
  const hash = createHash('sha256').update(bytes).digest('hex');
  const result = await preflight(bytes);
  assert.equal(result.ok, false);
  assert.equal(result.data, undefined);
  assert(result.errors.some(error => error.includes('reference-shaped literal')));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), hash);
});

test('unsafe 64-bit integers are refused before lossy coercion; safe boundary is exact', async () => {
  const unsafe = await fixture(db => db.run("UPDATE dinner_staples SET rowid=9007199254740993"));
  const db = await open(unsafe);
  assert.equal(rows(db, 'SELECT CAST(rowid AS TEXT) AS n FROM dinner_staples')[0].n, '9007199254740993');
  db.close();
  const rejected = await preflight(unsafe);
  assert.equal(rejected.ok, false);
  assert.match(rejected.errors.join(' '), /lossless integer/);
  const accepted = await preflight(await fixture(db => db.run('UPDATE dinner_staples SET rowid=9007199254740991')));
  assert.equal(accepted.ok, true);
  assert.equal(accepted.data.dinner_staples[0].__migration_rowid, 9007199254740991);
});

test('oversized accepted legacy values are preserved in source and explicitly refused pending chunk storage', async () => {
  const bytes = await fixture(db => db.run('UPDATE meals SET notes=? WHERE id=?', ['x'.repeat(2_100_000), 'm2']));
  const result = await preflight(bytes);
  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /chunk-backed/);
  const db = await open(bytes);
  assert.equal(rows(db, "SELECT length(notes) AS n FROM meals WHERE id='m2'")[0].n, 2_100_000);
  db.close();
  const combined = await preflight(await fixture(db => db.run("UPDATE meals SET notes=?, instructions=? WHERE id='m2'", ['n'.repeat(1_100_000), 'i'.repeat(1_100_000)])));
  assert.equal(combined.ok, false);
  assert.match(combined.errors.join(' '), /chunk-backed/);
});

test('portable SQL serialization restores all synthetic values including Unicode, quotes, NUL and ordering', async () => {
  const result = await preflight(await fixture());
  const restored = await open();
  try {
    restored.run(await baseline());
    restored.run('PRAGMA foreign_keys=ON');
    for (const table of tables) for (const row of result.data[table]) {
      const keys = Object.keys(row);
      restored.run(`INSERT INTO ${table} (${keys.map(key => key === '__migration_rowid' ? 'rowid' : key).join(',')}) VALUES (${keys.map(key => sqlValue(row[key])).join(',')})`);
    }
    for (const table of tables) {
      assert.equal(canonical(readTable(restored, table)), canonical(result.data[table]));
    }
    assert.deepEqual(rows(restored, 'PRAGMA foreign_key_check'), []);
    assert.equal(rows(restored, "SELECT hex(instructions) AS h FROM meals WHERE id='m2'")[0].h, Buffer.from("\ufeffSauté\nDon't guess quantities.\0Finish.").toString('hex').toUpperCase());
  } finally { restored.close(); }
});
