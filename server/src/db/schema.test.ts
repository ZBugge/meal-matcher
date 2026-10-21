import { beforeEach, describe, expect, it } from 'vitest';
import * as schema from '../test/db';
import { getAll, getOne, runQuery } from '../test/db';
import { databaseView, restartTestFixture, closeTestFixture } from '../test/runtime';
import { calculateResults } from '../test/matching';
describe('versioned D1 schema', () => {
    beforeEach(async () => { await closeTestFixture(); await schema.initializeDatabase(); });
    it('provides mode, onboarding, recipe and Notion columns and defaults', async () => {
        await runQuery(`INSERT INTO hosts(id,email,password_hash,takeout_onboarding_dismissed) VALUES ('host-1','host@example.com','hash',0),('host-2','category-host@example.com','hash',1)`);
        await runQuery(`INSERT INTO meals(id,host_id,title,type) VALUES ('meal-1','host-1','Meal','meal'),('category-1','host-2','Category','category')`);
        await runQuery(`INSERT INTO sessions(id,host_id,invite_code) VALUES ('session-1','host-1','SCHEMA')`);
        const migratedDatabase = await databaseView();
        expect((await migratedDatabase.exec('PRAGMA table_info(notion_connections)'))[0].values.map(column => column[1])).toEqual(['host_id', 'token_ciphertext', 'data_source_id', 'source_url', 'last_refreshed_at', 'last_error']);
        expect((await migratedDatabase.exec('PRAGMA table_info(notion_recipes)'))[0].values.map(column => column[1])).toEqual(['host_id', 'data_source_id', 'page_id', 'meal_id', 'source_url', 'content_hash']);
        const sessionColumns = (await migratedDatabase.exec('PRAGMA table_info(sessions)'))[0].values;
        expect(sessionColumns.some((column) => column[1] === 'mode')).toBe(true);
        const hostColumns = (await migratedDatabase.exec('PRAGMA table_info(hosts)'))[0].values;
        expect(hostColumns.some((column) => column[1] === 'takeout_onboarding_dismissed')).toBe(true);
        expect((await getOne<{
            mode: string;
        }>('SELECT mode FROM sessions WHERE id = ?', ['session-1']))?.mode)
            .toBe('home');
        expect((await getOne<{
            dismissed: number;
        }>('SELECT takeout_onboarding_dismissed AS dismissed FROM hosts WHERE id = ?', ['host-1']))?.dismissed).toBe(0);
        expect((await getOne<{
            dismissed: number;
        }>('SELECT takeout_onboarding_dismissed AS dismissed FROM hosts WHERE id = ?', ['host-2']))?.dismissed).toBe(1);
        expect((await getOne<{
            type: string;
        }>('SELECT type FROM meals WHERE id = ?', ['meal-1']))?.type)
            .toBe('meal');
        const mealColumns = (await migratedDatabase.exec('PRAGMA table_info(meals)'))[0].values;
        expect(mealColumns.some((column) => column[1] === 'instructions')).toBe(true);
        expect(mealColumns.some((column) => column[1] === 'notes')).toBe(true);
        const ingredientColumns = (await migratedDatabase.exec('PRAGMA table_info(meal_ingredients)'))[0].values;
        expect(ingredientColumns.map((column) => column[1])).toEqual([
            'id',
            'meal_id',
            'amount',
            'ingredient',
            'display_order',
        ]);
        const indexes = (await migratedDatabase.exec('PRAGMA index_list(meals)'))[0].values;
        expect(indexes.some((index) => index[1] === 'idx_meals_host_type_archived')).toBe(true);
        const ingredientIndexes = (await migratedDatabase.exec('PRAGMA index_list(meal_ingredients)'))[0].values;
        expect(ingredientIndexes.some((index) => index[1] === 'idx_meal_ingredients_meal_order'))
            .toBe(true);
    });
    it('creates recipe storage through the versioned D1 migrations', async () => {
        const freshDatabase = await databaseView();
        expect((await freshDatabase.exec('PRAGMA table_info(notion_connections)'))[0].values.map(column => column[1])).toEqual(['host_id', 'token_ciphertext', 'data_source_id', 'source_url', 'last_refreshed_at', 'last_error']);
        expect((await freshDatabase.exec('PRAGMA table_info(notion_recipes)'))[0].values.map(column => column[1])).toEqual(['host_id', 'data_source_id', 'page_id', 'meal_id', 'source_url', 'content_hash']);
        const mealColumns = (await freshDatabase.exec('PRAGMA table_info(meals)'))[0].values;
        expect(mealColumns.some((column) => column[1] === 'instructions')).toBe(true);
        expect(mealColumns.some((column) => column[1] === 'notes')).toBe(true);
        expect((await freshDatabase.exec('PRAGMA table_info(shopping_items)'))[0].values.some(column => column[1] === 'aisle')).toBe(true);
        expect((await freshDatabase.exec('PRAGMA table_info(dinner_staples)'))[0].values.map(column => column[1])).toEqual(['id', 'host_id', 'title']);
        const ingredientColumns = (await freshDatabase.exec('PRAGMA table_info(meal_ingredients)'))[0].values;
        expect(ingredientColumns.map((column) => column[1])).toEqual([
            'id',
            'meal_id',
            'amount',
            'ingredient',
            'display_order',
        ]);
    });
    it.each(['home', 'takeout'] as const)('preserves populated %s sessions and private library data across a Worker restart', async (mode) => {
        const database = await databaseView();
        await schema.runQuery("INSERT INTO hosts (id, email, password_hash, takeout_onboarding_dismissed) VALUES ('host', 'fixture@example.test', 'fixture-hash', 1)");
        await schema.runQuery(`INSERT INTO meals
      (id, host_id, title, description, instructions, notes, pick_count)
      VALUES (?, 'host', ?, ?, ?, ?, ?)`, ['meal', 'Lemon chickpea stew', 'Family dinner',
            '1. Soften the onion.\n2. Simmer chickpeas for 20 minutes.\n3. Finish with lemon.',
            'Use the wide pot; save a portion for tomorrow.', 4]);
        await schema.runQuery("INSERT INTO meals (id, host_id, title, notes, type, archived, pick_count) VALUES ('category', 'host', 'Thai', 'Ask for mild sauce', 'category', 1, 2)");
        // Insert out of order so the assertion exercises the stored ordering column.
        await schema.runQuery("INSERT INTO meal_ingredients VALUES ('ingredient-2', 'meal', 'to taste', 'lemon juice', 2)");
        await schema.runQuery("INSERT INTO meal_ingredients VALUES ('ingredient-0', 'meal', '1½ tbsp', 'olive oil', 0)");
        await schema.runQuery("INSERT INTO meal_ingredients VALUES ('ingredient-1', 'meal', '2 x 400 g cans, drained', 'chickpeas', 1)");
        const selected = mode === 'home' ? 'meal' : 'category';
        await schema.runQuery(`INSERT INTO sessions (id, host_id, invite_code, status, selected_meal_id, closed_at, mode)
      VALUES ('session', 'host', 'SAVE42', 'closed', ?, '2026-10-14 12:30:00', ?)`, [selected, mode]);
        await schema.runQuery("INSERT INTO session_meals VALUES ('session-meal','session',?,0)",[selected]);
        await schema.runQuery("INSERT INTO participants (id, session_id, display_name, submitted) VALUES ('one', 'session', 'One', 1), ('two', 'session', 'Two', 1), ('three', 'session', 'Three', 1)");
        await schema.runQuery("INSERT INTO swipes (id, participant_id, session_meal_id, vote) VALUES ('vote-one', 'one', 'session-meal', 1), ('vote-two', 'two', 'session-meal', 2), ('vote-three', 'three', 'session-meal', 0)");
        await schema.runQuery("INSERT INTO session_history(id,session_id,selected_meal_id,selected_at) VALUES ('history','session',?,'2026-10-14 12:31:00')",[selected]);
        const tables = ['hosts', 'meals', 'meal_ingredients', 'sessions', 'session_meals', 'participants', 'swipes', 'session_history'];
        const snapshot = async () => Object.fromEntries(await Promise.all(tables.map(async (table) => [table, await schema.getAll(`SELECT * FROM ${table} ORDER BY id`)])));
        const before = await snapshot();
        await restartTestFixture();
        // A fresh module has no in-memory handle and must load the actual saved bytes.
        const reopenedDatabase = await databaseView();
        const after = Object.fromEntries(await Promise.all(tables.map(async (table) => [table, await schema.getAll(`SELECT * FROM ${table} ORDER BY id`)])));
        expect(after).toEqual(before);
        expect(await schema.getAll('SELECT amount, ingredient FROM meal_ingredients WHERE meal_id = ? ORDER BY display_order', ['meal']))
            .toEqual([
            { amount: '1½ tbsp', ingredient: 'olive oil' },
            { amount: '2 x 400 g cans, drained', ingredient: 'chickpeas' },
            { amount: 'to taste', ingredient: 'lemon juice' },
        ]);
        expect(await calculateResults('session')).toEqual([expect.objectContaining({
                mealId: selected, yesCount: 1, maybeCount: 1, totalVotes: 3, percentage: 67, isUnanimous: false,
            })]);
    });
    it('persists aisle defaults and household staples alongside existing planning progress', async () => {
        const database = await databaseView();
        await schema.runQuery("INSERT INTO hosts (id, email, password_hash) VALUES ('family', 'family@test', 'hash')");
        await schema.runQuery("INSERT INTO plan_entries (id, host_id, week, kind, title) VALUES ('dinner', 'family', '2026-10-12', 'takeout', 'Pizza')");
        await schema.runQuery("INSERT INTO shopping_items (id, host_id, week, ingredient, amount, state) VALUES ('item', 'family', '2026-10-12', 'Milk', '1 carton', 'bought')");
        await restartTestFixture();
        const reopened = await databaseView();
        expect(await schema.getAll('SELECT ingredient, amount, state, aisle FROM shopping_items')).toEqual([{ ingredient: 'Milk', amount: '1 carton', state: 'bought', aisle: null }]);
        expect(await schema.getAll('SELECT title FROM plan_entries')).toEqual([{ title: 'Pizza' }]);
        expect(await schema.getAll('SELECT * FROM dinner_staples')).toEqual([]);
        await schema.runQuery("INSERT INTO dinner_staples VALUES ('staple', 'family', 'Tofu night')");
        const final = await databaseView();
        expect(await schema.getAll('SELECT title FROM dinner_staples')).toEqual([{ title: 'Tofu night' }]);
    });
    it('persists recipe metadata, recurring groceries and unique weekly applications across a Worker restart', async () => {
        const database = await databaseView();
        await schema.runQuery("INSERT INTO hosts (id, email, password_hash) VALUES ('family', 'pilot@test', 'hash')");
        await schema.runQuery("INSERT INTO meals (id, host_id, title, instructions, notes) VALUES ('recipe', 'family', 'Tofu', 'Bake it.', 'Keep this note.')");
        await schema.runQuery("INSERT INTO shopping_items (id, host_id, week, ingredient, amount, state) VALUES ('milk', 'family', '2026-10-12', 'Milk', '1½ cartons', 'bought')");
        const reopened = await databaseView();
        expect(await schema.getOne('SELECT title, instructions, notes, total_minutes, effort FROM meals WHERE id = ?', ['recipe']))
            .toEqual({ title: 'Tofu', instructions: 'Bake it.', notes: 'Keep this note.', total_minutes: null, effort: null });
        expect(await schema.getOne('SELECT ingredient, amount, state, recurring_id FROM shopping_items WHERE id = ?', ['milk']))
            .toEqual({ ingredient: 'Milk', amount: '1½ cartons', state: 'bought', recurring_id: null });
        await schema.runQuery("UPDATE meals SET total_minutes = 25, effort = 'easy' WHERE id = 'recipe'");
        await schema.runQuery("INSERT INTO recurring_groceries VALUES ('template', 'family', 'Bread', 'one large loaf')");
        await schema.runQuery("INSERT INTO shopping_items (id, host_id, week, ingredient, amount, recurring_id) VALUES ('bread', 'family', '2026-10-12', 'Bread', 'one large loaf', 'template')");
        await expect(schema.runQuery("INSERT INTO shopping_items (id, host_id, week, ingredient, recurring_id) VALUES ('duplicate', 'family', '2026-10-12', 'Bread', 'template')")).rejects.toThrow();
        await schema.runQuery("INSERT INTO shopping_items (id, host_id, week, ingredient, recurring_id) VALUES ('next-week', 'family', '2026-10-19', 'Bread', 'template')");
        await restartTestFixture();
        const final = await databaseView();
        expect(await schema.getOne('SELECT total_minutes, effort FROM meals WHERE id = ?', ['recipe'])).toEqual({ total_minutes: 25, effort: 'easy' });
        expect(await schema.getAll('SELECT ingredient, amount FROM recurring_groceries')).toEqual([{ ingredient: 'Bread', amount: 'one large loaf' }]);
        expect(await schema.getAll('SELECT id FROM shopping_items ORDER BY id')).toEqual([{ id: 'bread' }, { id: 'milk' }, { id: 'next-week' }]);
    });
});
