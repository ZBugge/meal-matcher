import { Router } from 'express';
import { randomUUID } from 'crypto';
import { Mutation, getAll, getOne, storedText } from '../db/schema';
import { requireAuth } from '../middleware/auth';
import { commitOperation, completedOperation, operation, OperationConflictError, type Operation } from '../services/operation-receipts';
import type { Meal, MealIngredient, PlanEntry, ShoppingItem, WeekPlan, RecurringGrocery } from '../types';
const router = Router();
router.use(requireAuth);
function validDate(value: unknown): value is string {
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
        && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
function validWeek(week: string): boolean { return validDate(week) && new Date(week).getUTCDay() === 1; }
function validPlanDate(date: unknown, week: string): boolean {
    return date === null || (validDate(date) && date >= week && Date.parse(date) < Date.parse(week) + 7 * 86400000);
}
function bodyObject(body: unknown): body is Record<string, unknown> {
    return !!body && typeof body === 'object' && !Array.isArray(body);
}
function text(value: unknown, maximum: number, allowEmpty = false): value is string {
    return typeof value === 'string' && value.length <= maximum && (allowEmpty || value.trim().length > 0);
}
async function readWeek(host: string, week: string): Promise<WeekPlan> {
    return {
        week,
        entries: await getAll<PlanEntry>(`SELECT id, meal_id AS mealId, kind, title, date FROM plan_entries
      WHERE host_id = ? AND week = ? ORDER BY date IS NULL, date, created_at, rowid`, [host, week]),
        shopping: await getAll<ShoppingItem>(`SELECT id, entry_id AS entryId, source_title AS sourceTitle,
      amount, ingredient, state, aisle, display_order AS displayOrder FROM shopping_items
      WHERE host_id = ? AND week = ? ORDER BY rowid`, [host, week]),
    };
}
async function mutate(host: string, week: string, action: (database: Mutation) => void, op?: Operation): Promise<WeekPlan> {
    const database = new Mutation();
    action(database);
    await commitOperation(database, op, { kind: 'week', week, status: op?.scope.endsWith('/apply') || op?.scope.endsWith('/bulk') ? 200 : 201 });
    return await readWeek(host, op?.completed?.kind === 'week' ? op.completed.week : week);
}
router.use('/:week', (req, res, next) => {
    if (!validWeek(req.params.week)) {
        res.status(400).json({ error: 'Choose a valid Monday for the week.' });
        return;
    }
    next();
});
router.use((req, res, next) => {
    if (req.method !== 'POST' || !req.get('Idempotency-Key')) { next(); return; }
    const key = req.get('Idempotency-Key')!;
    if (!/^[A-Za-z0-9_-]{20,100}$/.test(key)) { res.status(400).json({ error: 'Use an Idempotency-Key of 20 to 100 letters, digits, underscores or hyphens.' }); return; }
    const op = operation(req.session.hostId!, key, 'POST ' + req.baseUrl + decodeURIComponent(req.path).replace(/\/+$/, ''), req.body);
    res.locals.operation = op;
    void completedOperation(op).then(async accepted => {
        if (!accepted) { next(); return; }
        res.status(accepted.status).json(accepted.kind === 'week' ? await readWeek(op.host, accepted.week) : accepted.value);
    }).catch(error => {
        if (error instanceof OperationConflictError) res.status(409).json({ error: error.message });
        else next(error);
    });
});
router.get('/:week', async (req, res) => { res.json(await readWeek(req.session.hostId!, req.params.week)); });
router.get('/:week/recurring', async (req, res) => {
    res.json(await getAll<RecurringGrocery>('SELECT id, ingredient, amount FROM recurring_groceries WHERE host_id = ? ORDER BY rowid', [req.session.hostId!]));
});
for (const method of ['post', 'patch'] as const) {
    router[method](method === 'post' ? '/:week/recurring' : '/:week/recurring/:id', async (req, res) => {
        const body: unknown = req.body;
        const host = req.session.hostId!;
        if (!bodyObject(body) || Object.keys(body).some(key => !['ingredient', 'amount'].includes(key))
            || !text(body.ingredient, 300) || !text(body.amount, 100, true)) {
            res.status(400).json({ error: 'Enter an item and a free-text amount of up to 100 characters.' });
            return;
        }
        const id = method === 'post' ? randomUUID() : (req.params as {
            week: string;
            id: string;
        }).id;
        if (method === 'patch' && !await getOne('SELECT id FROM recurring_groceries WHERE id = ? AND host_id = ?', [id, host])) {
            res.status(404).json({ error: 'Usual grocery not found.' });
            return;
        }
        const grocery = { id, ingredient: body.ingredient.trim(), amount: body.amount.trim() };
        const storedIngredient = await storedText(grocery.ingredient, host);
        if (res.locals.operation) res.locals.operation.response = { kind: 'json', value: grocery, status: 201 };
        try {
            await mutate(host, req.params.week, (database) => {
                if (method === 'post')
                    database.run('INSERT INTO recurring_groceries (id, host_id, ingredient, amount) VALUES (?, ?, ?, ?)', [id, host, storedIngredient, grocery.amount]);
                else
                    database.run('UPDATE recurring_groceries SET ingredient = ?, amount = ? WHERE id = ? AND host_id = ?', [storedIngredient, grocery.amount, id, host]);
            }, res.locals.operation);
            res.status(method === 'post' ? 201 : 200).json(res.locals.operation?.completed?.value ?? grocery);
        }
        catch (error) {
        if (error instanceof OperationConflictError) { res.status(409).json({ error: error.message }); return; }
            res.status(500).json({ error: 'Could not save the usual grocery. Try again.' });
        }
    });
}
router.delete('/:week/recurring/:id', async (req, res) => {
    const host = req.session.hostId!;
    const { id, week } = req.params;
    if (!await getOne('SELECT id FROM recurring_groceries WHERE id = ? AND host_id = ?', [id, host])) {
        res.status(404).json({ error: 'Usual grocery not found.' });
        return;
    }
    try {
        await mutate(host, week, (database) => database.run('DELETE FROM recurring_groceries WHERE id = ? AND host_id = ?', [id, host]), res.locals.operation);
        res.json({ message: 'Usual grocery removed. Existing weekly items are unchanged.' });
    }
    catch (error) {
        if (error instanceof OperationConflictError) { res.status(409).json({ error: error.message }); return; }
        res.status(500).json({ error: 'Could not remove the usual grocery. Try again.' });
    }
});
router.post('/:week/recurring/apply', async (req, res) => {
    const host = req.session.hostId!;
    const { week } = req.params;
    const body: unknown = req.body;
    if (!bodyObject(body) || Object.keys(body).length !== 1 || !Array.isArray(body.ids) || !body.ids.length || body.ids.length > 500
        || new Set(body.ids).size !== body.ids.length || body.ids.some(id => !text(id, 100))) {
        res.status(400).json({ error: 'Select between 1 and 500 different usual groceries.' });
        return;
    }
    const ids = JSON.stringify(body.ids);
    const count = await getOne<{
        count: number;
    }>('SELECT COUNT(*) AS count FROM recurring_groceries WHERE host_id=? AND id IN (SELECT value FROM json_each(?))', [host, ids]);
    if (count?.count !== body.ids.length) {
        res.status(404).json({ error: 'A selected usual grocery is no longer available.' });
        return;
    }
    try {
        res.json(await mutate(host, week, database => {
            database.assert('(SELECT COUNT(*) FROM recurring_groceries WHERE host_id=? AND id IN (SELECT value FROM json_each(?)))=?', [host, ids, (body.ids as string[]).length]);
            database.run(`INSERT INTO shopping_items(id,host_id,week,ingredient,amount,recurring_id) SELECT lower(hex(randomblob(16))), r.host_id, ?,r.ingredient,r.amount,r.id FROM json_each(?) j JOIN recurring_groceries r ON r.id=j.value WHERE r.host_id=? AND NOT EXISTS(SELECT 1 FROM shopping_items s WHERE s.host_id=r.host_id AND s.week=? AND s.recurring_id=r.id) ORDER BY CAST(j.key AS INTEGER)`, [week, ids, host, week]);
        }, res.locals.operation));
    }
    catch (error) {
        if (error instanceof OperationConflictError) { res.status(409).json({ error: error.message }); return; }
        res.status(500).json({ error: 'Could not add usual groceries. Try again.' });
    }
});
router.post('/:week/entries', async (req, res) => {
    const { week } = req.params;
    const host = req.session.hostId!;
    const body: unknown = req.body;
    if (!bodyObject(body) || Object.keys(body).some(key => !['mealId', 'kind', 'title', 'date'].includes(key))
        || (body.kind !== undefined && !['home', 'takeout'].includes(body.kind as string))
        || (body.mealId !== undefined && !text(body.mealId, 100))
        || (body.title !== undefined && !text(body.title, 200))
        || (body.date !== undefined && !validPlanDate(body.date, week))) {
        res.status(400).json({ error: 'Check the meal and date.' });
        return;
    }
    let meal: Meal | undefined;
    if (body.mealId) {
        meal = await getOne<Meal>('SELECT * FROM meals WHERE id = ? AND host_id = ? AND archived = 0', [body.mealId, host]);
        if (!meal) {
            res.status(404).json({ error: 'Meal not found in your library.' });
            return;
        }
    }
    const kind = meal ? (meal.type === 'meal' ? 'home' : 'takeout') : body.kind;
    if ((meal && !['meal', 'category'].includes(meal.type)) || (body.kind && kind !== body.kind)
        || (!meal && (kind !== 'takeout' || !text(body.title, 200)))) {
        res.status(400).json({ error: 'Choose a home recipe or enter a takeout night.' });
        return;
    }
    const customTitle = meal ? null : await storedText((body.title as string).trim(), host);
    try {
        const id = randomUUID();
        res.status(201).json(await mutate(host, week, database => {
            if (meal) {
                database.assert('EXISTS(SELECT 1 FROM meals WHERE id=? AND host_id=? AND archived=0)', [meal.id, host]);
                database.run('INSERT INTO plan_entries(id,host_id,week,meal_id,kind,title,date) SELECT ?,host_id,?,id,?,title,? FROM meals WHERE id=? AND host_id=?', [id, week, kind, (body.date as string | null) ?? null, meal.id, host]);
                if (kind === 'home')
                    database.run(`INSERT INTO shopping_items(id,host_id,week,entry_id,source_title,amount,ingredient,display_order) SELECT lower(hex(randomblob(16))),m.host_id,?,?,m.title,i.amount,i.ingredient,i.display_order FROM meal_ingredients i JOIN meals m ON m.id=i.meal_id WHERE m.id=? AND m.host_id=? ORDER BY i.display_order`, [week, id, meal.id, host]);
            }
            else
                database.run('INSERT INTO plan_entries(id,host_id,week,kind,title,date) VALUES (?,?,?,?,?,?)', [id, host, week, kind, customTitle, (body.date as string | null) ?? null]);
        }, res.locals.operation));
    }
    catch (error) {
        if (error instanceof OperationConflictError) { res.status(409).json({ error: error.message }); return; }
        res.status(500).json({ error: 'Could not save the plan. Try again.' });
    }
});
router.patch('/:week/entries/:id', async (req, res) => {
    const { week, id } = req.params;
    const host = req.session.hostId!;
    if (!bodyObject(req.body) || Object.keys(req.body).length !== 1 || !validPlanDate(req.body.date, week)) {
        res.status(400).json({ error: 'Choose a date in this week, or leave it unscheduled.' });
        return;
    }
    if (!await getOne('SELECT id FROM plan_entries WHERE id = ? AND host_id = ? AND week = ?', [id, host, week])) {
        res.status(404).json({ error: 'Plan entry not found.' });
        return;
    }
    try {
        res.json(await mutate(host, week, (database) => database.run('UPDATE plan_entries SET date = ? WHERE id = ?', [req.body.date, id]), res.locals.operation));
    }
    catch (error) {
        if (error instanceof OperationConflictError) { res.status(409).json({ error: error.message }); return; }
        res.status(500).json({ error: 'Could not save the date. Try again.' });
    }
});
router.delete('/:week/entries/:id', async (req, res) => {
    const { week, id } = req.params;
    const host = req.session.hostId!;
    if (!await getOne('SELECT id FROM plan_entries WHERE id = ? AND host_id = ? AND week = ?', [id, host, week])) {
        res.status(404).json({ error: 'Plan entry not found.' });
        return;
    }
    try {
        res.json(await mutate(host, week, (database) => {
            database.run("UPDATE shopping_items SET entry_id = NULL WHERE entry_id = ? AND host_id = ? AND (state = 'bought' OR ? = 1)", [id, host, req.query.keepGroceries === 'true' ? 1 : 0]);
            database.run('DELETE FROM shopping_items WHERE entry_id = ? AND host_id = ?', [id, host]);
            database.run('DELETE FROM plan_entries WHERE id = ? AND host_id = ?', [id, host]);
        }, res.locals.operation));
    }
    catch (error) {
        if (error instanceof OperationConflictError) { res.status(409).json({ error: error.message }); return; }
        res.status(500).json({ error: 'Could not remove the meal. Try again.' });
    }
});
router.post('/:week/items', async (req, res) => {
    const { week } = req.params;
    const host = req.session.hostId!;
    if (!bodyObject(req.body) || Object.keys(req.body).some(key => !['ingredient', 'amount'].includes(key))
        || !text(req.body.ingredient, 300) || (req.body.amount !== undefined && !text(req.body.amount, 100, true))) {
        res.status(400).json({ error: 'Enter an item and an optional amount.' });
        return;
    }
    const newIngredient = await storedText(req.body.ingredient.trim(), host);
    try {
        res.status(201).json(await mutate(host, week, (database) => database.run(`INSERT INTO shopping_items
    (id, host_id, week, ingredient, amount) VALUES (?, ?, ?, ?, ?)`, [randomUUID(), host, week, newIngredient, req.body.amount?.trim() ?? '']), res.locals.operation));
    }
    catch (error) {
        if (error instanceof OperationConflictError) { res.status(409).json({ error: error.message }); return; }
        res.status(500).json({ error: 'Could not add the item. Try again.' });
    }
});
router.post('/:week/items/bulk', async (req, res) => {
    const host = req.session.hostId!;
    const { week } = req.params;
    const body: unknown = req.body;
    if (!bodyObject(body) || Object.keys(body).some(key => !['ids', 'state'].includes(key)) || !Array.isArray(body.ids)
        || !body.ids.length || body.ids.length > 1000 || new Set(body.ids).size !== body.ids.length
        || body.ids.some(id => !text(id, 100)) || !['needed', 'have', 'bought'].includes(body.state as string)) {
        res.status(400).json({ error: 'Choose items and a valid shopping state.' });
        return;
    }
    const ids = JSON.stringify(body.ids);
    const count = await getOne<{
        count: number;
    }>('SELECT COUNT(*) AS count FROM shopping_items WHERE host_id=? AND week=? AND id IN (SELECT value FROM json_each(?))', [host, week, ids]);
    if (count?.count !== body.ids.length) {
        res.status(404).json({ error: 'An item is no longer in your list. Reload and try again.' });
        return;
    }
    try {
        res.json(await mutate(host, week, database => {
            database.assert('(SELECT COUNT(*) FROM shopping_items WHERE host_id=? AND week=? AND id IN (SELECT value FROM json_each(?)))=?', [host, week, ids, (body.ids as string[]).length]);
            database.run('UPDATE shopping_items SET state=? WHERE host_id=? AND week=? AND id IN (SELECT value FROM json_each(?))', [body.state, host, week, ids]);
        }, res.locals.operation));
    }
    catch (error) {
        if (error instanceof OperationConflictError) { res.status(409).json({ error: error.message }); return; }
        res.status(500).json({ error: 'Could not save the selected items. Try again.' });
    }
});
router.post('/:week/repeat', async (req, res) => {
    const host = req.session.hostId!;
    const { week } = req.params;
    const body: unknown = req.body;
    if (!bodyObject(body) || Object.keys(body).some(key => !['targetWeek', 'entryIds'].includes(key))
        || typeof body.targetWeek !== 'string' || !validWeek(body.targetWeek) || body.targetWeek === week
        || !Array.isArray(body.entryIds) || !body.entryIds.length || body.entryIds.length > 500
        || new Set(body.entryIds).size !== body.entryIds.length || body.entryIds.some(id => !text(id, 100))) {
        res.status(400).json({ error: 'Select meals and a different Monday.' });
        return;
    }
    const mapping = JSON.stringify((body.entryIds as string[]).map(old => ({ old, id: randomUUID() })));
    const target = body.targetWeek;
    const count = await getOne<{
        count: number;
    }>(`SELECT COUNT(*) AS count FROM plan_entries WHERE host_id=? AND week=? AND id IN (SELECT json_extract(value,'$.old') FROM json_each(?))`, [host, week, mapping]);
    if (count?.count !== body.entryIds.length) {
        res.status(404).json({ error: 'A selected meal is no longer in your week.' });
        return;
    }
    try {
        res.status(201).json(await mutate(host, target, database => {
            database.assert(`(SELECT COUNT(*) FROM plan_entries WHERE host_id=? AND week=? AND id IN (SELECT json_extract(value,'$.old') FROM json_each(?)))=?`, [host, week, mapping, (body.entryIds as string[]).length]);
            database.run(`INSERT INTO plan_entries(id,host_id,week,meal_id,kind,title,date) SELECT json_extract(j.value,'$.id'),p.host_id,?,p.meal_id,p.kind,p.title,CASE WHEN p.date IS NULL THEN NULL ELSE date(p.date, printf('%+d days', julianday(?) - julianday(?))) END FROM json_each(?) j JOIN plan_entries p ON p.id=json_extract(j.value,'$.old') WHERE p.host_id=? AND p.week=? ORDER BY CAST(j.key AS INTEGER)`, [target, target, week, mapping, host, week]);
            database.run(`INSERT INTO shopping_items(id,host_id,week,entry_id,source_title,amount,ingredient,aisle,display_order) SELECT lower(hex(randomblob(16))),s.host_id,?,json_extract(j.value,'$.id'),p.title,s.amount,s.ingredient,s.aisle,s.display_order FROM json_each(?) j JOIN plan_entries p ON p.id=json_extract(j.value,'$.old') JOIN shopping_items s ON s.entry_id=p.id WHERE p.host_id=? AND p.week=? AND s.host_id=? AND s.week=? ORDER BY CAST(j.key AS INTEGER),s.rowid`, [target, mapping, host, week, host, week]);
        }, res.locals.operation));
    }
    catch (error) {
        if (error instanceof OperationConflictError) { res.status(409).json({ error: error.message }); return; }
        res.status(500).json({ error: 'Could not repeat the week. Try again.' });
    }
});
router.get('/:week/staples', async (req, res) => { res.json(await getAll('SELECT id, title FROM dinner_staples WHERE host_id = ? ORDER BY rowid', [req.session.hostId!])); });
router.post('/:week/staples', async (req, res) => {
    if (!bodyObject(req.body) || Object.keys(req.body).length !== 1 || !text(req.body.title, 100)) {
        res.status(400).json({ error: 'Enter a dinner staple name.' });
        return;
    }
    if (res.locals.operation) res.locals.operation.response = { kind: 'json', value: { saved: true }, status: 201 };
    try {
        await mutate(req.session.hostId!, req.params.week, (database) => database.run('INSERT INTO dinner_staples (id, host_id, title) VALUES (?, ?, ?)', [randomUUID(), req.session.hostId!, req.body.title.trim()]), res.locals.operation);
        res.status(201).json({ saved: true });
    }
    catch (error) {
        if (error instanceof OperationConflictError) { res.status(409).json({ error: error.message }); return; }
        res.status(500).json({ error: 'Could not save the staple.' });
    }
});
router.patch('/:week/staples/:id', async (req, res) => {
    if (!bodyObject(req.body) || Object.keys(req.body).length !== 1 || !text(req.body.title, 100)) {
        res.status(400).json({ error: 'Enter a dinner staple name.' });
        return;
    }
    if (!await getOne('SELECT id FROM dinner_staples WHERE id = ? AND host_id = ?', [req.params.id, req.session.hostId!])) {
        res.status(404).json({ error: 'Staple not found.' });
        return;
    }
    try {
        await mutate(req.session.hostId!, req.params.week, (database) => database.run('UPDATE dinner_staples SET title = ? WHERE id = ? AND host_id = ?', [req.body.title.trim(), req.params.id, req.session.hostId!]), res.locals.operation);
        res.json({ saved: true });
    }
    catch (error) {
        if (error instanceof OperationConflictError) { res.status(409).json({ error: error.message }); return; }
        res.status(500).json({ error: 'Could not save the staple.' });
    }
});
router.delete('/:week/staples/:id', async (req, res) => {
    if (!await getOne('SELECT id FROM dinner_staples WHERE id = ? AND host_id = ?', [req.params.id, req.session.hostId!])) {
        res.status(404).json({ error: 'Staple not found.' });
        return;
    }
    try {
        await mutate(req.session.hostId!, req.params.week, (database) => database.run('DELETE FROM dinner_staples WHERE id = ? AND host_id = ?', [req.params.id, req.session.hostId!]), res.locals.operation);
        res.json({ saved: true });
    }
    catch (error) {
        if (error instanceof OperationConflictError) { res.status(409).json({ error: error.message }); return; }
        res.status(500).json({ error: 'Could not remove the staple.' });
    }
});
router.patch('/:week/items/:id', async (req, res) => {
    const { week, id } = req.params;
    const host = req.session.hostId!;
    const body: unknown = req.body;
    if (!bodyObject(body) || !Object.keys(body).length || Object.keys(body).some(key => !['ingredient', 'amount', 'state', 'aisle'].includes(key))
        || (body.ingredient !== undefined && !text(body.ingredient, 300))
        || (body.amount !== undefined && !text(body.amount, 100, true))
        || (body.aisle !== undefined && !['Produce', 'Meat & fish', 'Dairy & eggs', 'Bakery', 'Pantry', 'Frozen', 'Other'].includes(body.aisle as string))
        || (body.state !== undefined && !['needed', 'have', 'bought'].includes(body.state as string))) {
        res.status(400).json({ error: 'Check the item details.' });
        return;
    }
    const item = await getOne<ShoppingItem>('SELECT ingredient, amount, state, aisle FROM shopping_items WHERE id = ? AND host_id = ? AND week = ?', [id, host, week]);
    if (!item) {
        res.status(404).json({ error: 'Shopping item not found.' });
        return;
    }
    try {
        const fields = Object.keys(body);
        const values = await Promise.all(fields.map(async (key) => key === 'ingredient' ? await storedText((body[key] as string).trim(), host) : typeof body[key] === 'string' ? (body[key] as string).trim() : body[key]));
        res.json(await mutate(host, week, database => database.run(`UPDATE shopping_items SET ${fields.map(key => key + ' = ?').join(',')} WHERE id=? AND host_id=? AND week=?`, [...values, id, host, week]), res.locals.operation));
    }
    catch (error) {
        if (error instanceof OperationConflictError) { res.status(409).json({ error: error.message }); return; }
        res.status(500).json({ error: 'Could not save the item. Try again.' });
    }
});
router.delete('/:week/items/:id', async (req, res) => {
    const { week, id } = req.params;
    const host = req.session.hostId!;
    if (!await getOne('SELECT id FROM shopping_items WHERE id = ? AND host_id = ? AND week = ?', [id, host, week])) {
        res.status(404).json({ error: 'Shopping item not found.' });
        return;
    }
    try {
        res.json(await mutate(host, week, (database) => database.run('DELETE FROM shopping_items WHERE id = ?', [id]), res.locals.operation));
    }
    catch (error) {
        if (error instanceof OperationConflictError) { res.status(409).json({ error: error.message }); return; }
        res.status(500).json({ error: 'Could not remove the item. Try again.' });
    }
});
export default router;
