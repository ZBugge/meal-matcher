import { beforeEach, describe, expect, it } from 'vitest';
import { runQuery, initializeDatabase } from '../test/db';
import { reopenD1, databaseView, closeTestFixture } from '../test/runtime';
beforeEach(async () => { await closeTestFixture(); await initializeDatabase(); });
describe('Planning schema compatibility', () => {
    it.each(['fresh migration','Worker reopen'] as const)('keeps planning columns, indexes and records after %s',async phase=>{
        const seed=async()=>{
            await runQuery("INSERT INTO hosts(id,email,password_hash) VALUES ('host','plan-schema@test','hash')");
            await runQuery("INSERT INTO plan_entries(id,host_id,week,kind,title) VALUES ('entry','host','2026-10-12','takeout','Pizza')");
            await runQuery("INSERT INTO shopping_items(id,host_id,week,entry_id,source_title,ingredient,amount,state) VALUES ('item','host','2026-10-12','entry','Pizza','Milk','1 carton','have')");
        };
        if(phase==='Worker reopen')await seed();
        const database=phase==='Worker reopen'?await reopenD1():await databaseView();
        for (const [table, columns] of [
            ['plan_entries', ['id', 'host_id', 'week', 'meal_id', 'kind', 'title', 'date', 'created_at']],
            ['shopping_items', ['id', 'host_id', 'week', 'entry_id', 'source_title', 'amount', 'ingredient', 'aisle', 'state', 'display_order', 'recurring_id']],
            ['dinner_staples', ['id', 'host_id', 'title']], ['recurring_groceries', ['id', 'host_id', 'ingredient', 'amount']], ['login_sessions', ['id', 'data', 'expires']],
        ] as const)
            expect((await database.exec(`PRAGMA table_info(${table})`))[0].values.map(row => row[1])).toEqual(columns);
        expect((await database.exec('PRAGMA index_list(shopping_items)'))[0].values.map(row => ({ name: row[1], unique: row[2] }))).toContainEqual({ name: 'idx_shopping_recurring_week', unique: 1 });
        if(phase==='fresh migration')await seed();
        const reopened=phase==='fresh migration'?await reopenD1():await databaseView();
        expect((await reopened.exec('SELECT title FROM plan_entries'))[0].values).toEqual([['Pizza']]);
        expect((await reopened.exec('SELECT ingredient, amount, state FROM shopping_items'))[0].values).toEqual([['Milk', '1 carton', 'have']]);
    });
});
