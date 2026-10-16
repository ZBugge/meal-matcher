import { Router } from 'express';
import { randomUUID } from 'crypto';
import { getDatabase, getAll, getOne, saveDatabase } from '../db/schema';
import { requireAuth } from '../middleware/auth';
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
function readWeek(host: string, week: string): WeekPlan {
  return {
    week,
    entries: getAll<PlanEntry>(`SELECT id, meal_id AS mealId, kind, title, date FROM plan_entries
      WHERE host_id = ? AND week = ? ORDER BY date IS NULL, date, created_at, rowid`, [host, week]),
    shopping: getAll<ShoppingItem>(`SELECT id, entry_id AS entryId, source_title AS sourceTitle,
      amount, ingredient, state, aisle, display_order AS displayOrder FROM shopping_items
      WHERE host_id = ? AND week = ? ORDER BY rowid`, [host, week]),
  };
}
// Restore the affected week and host templates if persistence fails after sql.js commits.
// Exporting during an open transaction would implicitly close the connection.
function mutate(host: string, week: string, action: () => void): WeekPlan {
  const database = getDatabase();
  const entries = getAll<Record<string, string | number | null>>('SELECT * FROM plan_entries WHERE host_id = ? AND week = ?', [host, week]);
  const items = getAll<Record<string, string | number | null>>('SELECT * FROM shopping_items WHERE host_id = ? AND week = ?', [host, week]);
  const staples = getAll<Record<string, string | number | null>>('SELECT * FROM dinner_staples WHERE host_id = ?', [host]);
  const recurring = getAll<Record<string, string | number | null>>('SELECT * FROM recurring_groceries WHERE host_id = ?', [host]);
  database.run('BEGIN TRANSACTION');
  try { action(); database.run('COMMIT'); }
  catch (error) { database.run('ROLLBACK'); throw error; }
  try { saveDatabase(); }
  catch (error) {
    database.run('BEGIN TRANSACTION');
    database.run('DELETE FROM shopping_items WHERE host_id = ? AND week = ?', [host, week]);
    database.run('DELETE FROM plan_entries WHERE host_id = ? AND week = ?', [host, week]);
    database.run('DELETE FROM dinner_staples WHERE host_id = ?', [host]);
    database.run('DELETE FROM recurring_groceries WHERE host_id = ?', [host]);
    for (const [table, rows] of [['plan_entries', entries], ['shopping_items', items], ['dinner_staples', staples], ['recurring_groceries', recurring]] as const) {
      for (const row of rows) {
        const columns = Object.keys(row);
        database.run(`INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`, Object.values(row));
      }
    }
    database.run('COMMIT');
    throw error;
  }
  return readWeek(host, week);
}
router.use('/:week', (req, res, next) => {
  if (!validWeek(req.params.week)) { res.status(400).json({ error: 'Choose a valid Monday for the week.' }); return; }
  next();
});
router.get('/:week', (req, res) => { res.json(readWeek(req.session.hostId!, req.params.week)); });
router.get('/:week/recurring', (req, res) => {
  res.json(getAll<RecurringGrocery>('SELECT id, ingredient, amount FROM recurring_groceries WHERE host_id = ? ORDER BY rowid', [req.session.hostId!]));
});
for (const method of ['post', 'patch'] as const) {
  router[method](method === 'post' ? '/:week/recurring' : '/:week/recurring/:id', (req, res) => {
    const body: unknown = req.body; const host = req.session.hostId!;
    if (!bodyObject(body) || Object.keys(body).some(key => !['ingredient', 'amount'].includes(key))
      || !text(body.ingredient, 300) || !text(body.amount, 100, true)) {
      res.status(400).json({ error: 'Enter an item and a free-text amount of up to 100 characters.' }); return;
    }
    const id = method === 'post' ? randomUUID() : (req.params as { week: string; id: string }).id;
    if (method === 'patch' && !getOne('SELECT id FROM recurring_groceries WHERE id = ? AND host_id = ?', [id, host])) {
      res.status(404).json({ error: 'Usual grocery not found.' }); return;
    }
    const grocery = { id, ingredient: body.ingredient.trim(), amount: body.amount.trim() };
    try {
      mutate(host, req.params.week, () => {
        if (method === 'post') getDatabase().run('INSERT INTO recurring_groceries (id, host_id, ingredient, amount) VALUES (?, ?, ?, ?)', [id, host, grocery.ingredient, grocery.amount]);
        else getDatabase().run('UPDATE recurring_groceries SET ingredient = ?, amount = ? WHERE id = ? AND host_id = ?', [grocery.ingredient, grocery.amount, id, host]);
      });
      res.status(method === 'post' ? 201 : 200).json(grocery);
    } catch { res.status(500).json({ error: 'Could not save the usual grocery. Try again.' }); }
  });
}
router.delete('/:week/recurring/:id', (req, res) => {
  const host = req.session.hostId!; const { id, week } = req.params;
  if (!getOne('SELECT id FROM recurring_groceries WHERE id = ? AND host_id = ?', [id, host])) {
    res.status(404).json({ error: 'Usual grocery not found.' }); return;
  }
  try {
    mutate(host, week, () => getDatabase().run('DELETE FROM recurring_groceries WHERE id = ? AND host_id = ?', [id, host]));
    res.json({ message: 'Usual grocery removed. Existing weekly items are unchanged.' });
  } catch { res.status(500).json({ error: 'Could not remove the usual grocery. Try again.' }); }
});
router.post('/:week/recurring/apply', (req, res) => {
  const host = req.session.hostId!; const { week } = req.params; const body: unknown = req.body;
  if (!bodyObject(body) || Object.keys(body).length !== 1 || !Array.isArray(body.ids) || !body.ids.length || body.ids.length > 500
    || new Set(body.ids).size !== body.ids.length || body.ids.some(id => !text(id, 100))) {
    res.status(400).json({ error: 'Select between 1 and 500 different usual groceries.' }); return;
  }
  const groceries = (body.ids as string[]).map(id => getOne<RecurringGrocery>('SELECT id, ingredient, amount FROM recurring_groceries WHERE id = ? AND host_id = ?', [id, host]));
  if (groceries.some(item => !item)) { res.status(404).json({ error: 'A selected usual grocery is no longer available.' }); return; }
  try {
    res.json(mutate(host, week, () => {
      for (const item of groceries as RecurringGrocery[]) {
        getDatabase().run(`INSERT INTO shopping_items (id, host_id, week, ingredient, amount, recurring_id)
          SELECT ?, ?, ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM shopping_items WHERE host_id = ? AND week = ? AND recurring_id = ?)`,
        [randomUUID(), host, week, item.ingredient, item.amount, item.id, host, week, item.id]);
      }
    }));
  } catch { res.status(500).json({ error: 'Could not add usual groceries. Try again.' }); }
});
router.post('/:week/entries', (req, res) => {
  const { week } = req.params;
  const host = req.session.hostId!;
  const body: unknown = req.body;
  if (!bodyObject(body) || Object.keys(body).some(key => !['mealId', 'kind', 'title', 'date'].includes(key))
    || (body.kind !== undefined && !['home', 'takeout'].includes(body.kind as string))
    || (body.mealId !== undefined && !text(body.mealId, 100))
    || (body.title !== undefined && !text(body.title, 200))
    || (body.date !== undefined && !validPlanDate(body.date, week))) {
    res.status(400).json({ error: 'Check the meal and date.' }); return;
  }
  let meal: Meal | undefined;
  if (body.mealId) {
    meal = getOne<Meal>('SELECT * FROM meals WHERE id = ? AND host_id = ? AND archived = 0', [body.mealId, host]);
    if (!meal) { res.status(404).json({ error: 'Meal not found in your library.' }); return; }
  }
  const kind = meal ? (meal.type === 'meal' ? 'home' : 'takeout') : body.kind;
  if ((meal && !['meal', 'category'].includes(meal.type)) || (body.kind && kind !== body.kind)
    || (!meal && (kind !== 'takeout' || !text(body.title, 200)))) {
    res.status(400).json({ error: 'Choose a home recipe or enter a takeout night.' }); return;
  }
  const ingredients = meal && kind === 'home' ? getAll<MealIngredient>('SELECT amount, ingredient FROM meal_ingredients WHERE meal_id = ? ORDER BY display_order', [meal.id]) : [];
  try {
    const id = randomUUID();
    res.status(201).json(mutate(host, week, () => {
      getDatabase().run('INSERT INTO plan_entries (id, host_id, week, meal_id, kind, title, date) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [id, host, week, meal?.id ?? null, kind as string, meal?.title ?? (body.title as string).trim(), (body.date as string | null) ?? null]);
      ingredients.forEach((row, order) => getDatabase().run(`INSERT INTO shopping_items
        (id, host_id, week, entry_id, source_title, amount, ingredient, display_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [randomUUID(), host, week, id, meal!.title, row.amount, row.ingredient, order]));
    }));
  } catch { res.status(500).json({ error: 'Could not save the plan. Try again.' }); }
});
router.patch('/:week/entries/:id', (req, res) => {
  const { week, id } = req.params;
  const host = req.session.hostId!;
  if (!bodyObject(req.body) || Object.keys(req.body).length !== 1 || !validPlanDate(req.body.date, week)) {
    res.status(400).json({ error: 'Choose a date in this week, or leave it unscheduled.' }); return;
  }
  if (!getOne('SELECT id FROM plan_entries WHERE id = ? AND host_id = ? AND week = ?', [id, host, week])) {
    res.status(404).json({ error: 'Plan entry not found.' }); return;
  }
  try { res.json(mutate(host, week, () => getDatabase().run('UPDATE plan_entries SET date = ? WHERE id = ?', [req.body.date, id]))); }
  catch { res.status(500).json({ error: 'Could not save the date. Try again.' }); }
});
router.delete('/:week/entries/:id', (req, res) => {
  const { week, id } = req.params;
  const host = req.session.hostId!;
  if (!getOne('SELECT id FROM plan_entries WHERE id = ? AND host_id = ? AND week = ?', [id, host, week])) {
    res.status(404).json({ error: 'Plan entry not found.' }); return;
  }
  try { res.json(mutate(host, week, () => {
    getDatabase().run("UPDATE shopping_items SET entry_id = NULL WHERE entry_id = ? AND host_id = ? AND (state = 'bought' OR ? = 1)", [id, host, req.query.keepGroceries === 'true' ? 1 : 0]);
    getDatabase().run('DELETE FROM shopping_items WHERE entry_id = ? AND host_id = ?', [id, host]);
    getDatabase().run('DELETE FROM plan_entries WHERE id = ? AND host_id = ?', [id, host]);
  })); } catch { res.status(500).json({ error: 'Could not remove the meal. Try again.' }); }
});
router.post('/:week/items', (req, res) => {
  const { week } = req.params;
  const host = req.session.hostId!;
  if (!bodyObject(req.body) || Object.keys(req.body).some(key => !['ingredient', 'amount'].includes(key))
    || !text(req.body.ingredient, 300) || (req.body.amount !== undefined && !text(req.body.amount, 100, true))) {
    res.status(400).json({ error: 'Enter an item and an optional amount.' }); return;
  }
  try { res.status(201).json(mutate(host, week, () => getDatabase().run(`INSERT INTO shopping_items
    (id, host_id, week, ingredient, amount) VALUES (?, ?, ?, ?, ?)`,
    [randomUUID(), host, week, req.body.ingredient.trim(), req.body.amount?.trim() ?? '']))); }
  catch { res.status(500).json({ error: 'Could not add the item. Try again.' }); }
});

router.post('/:week/items/bulk', (req, res) => {
  const host = req.session.hostId!; const { week } = req.params;
  const body: unknown = req.body;
  if (!bodyObject(body) || Object.keys(body).some(key => !['ids', 'state'].includes(key)) || !Array.isArray(body.ids)
    || !body.ids.length || body.ids.length > 1000 || new Set(body.ids).size !== body.ids.length
    || body.ids.some(id => !text(id, 100)) || !['needed', 'have', 'bought'].includes(body.state as string)) {
    res.status(400).json({ error: 'Choose items and a valid shopping state.' }); return;
  }
  const ids = body.ids as string[];
  if (ids.some(id => !getOne('SELECT id FROM shopping_items WHERE id = ? AND host_id = ? AND week = ?', [id, host, week]))) {
    res.status(404).json({ error: 'An item is no longer in your list. Reload and try again.' }); return;
  }
  try { res.json(mutate(host, week, () => { for (const id of ids) getDatabase().run('UPDATE shopping_items SET state = ? WHERE id = ? AND host_id = ? AND week = ?', [body.state as string, id, host, week]); })); }
  catch { res.status(500).json({ error: 'Could not save the selected items. Try again.' }); }
});
router.post('/:week/repeat', (req, res) => {
  const host = req.session.hostId!; const { week } = req.params; const body: unknown = req.body;
  if (!bodyObject(body) || Object.keys(body).some(key => !['targetWeek', 'entryIds'].includes(key))
    || typeof body.targetWeek !== 'string' || !validWeek(body.targetWeek) || body.targetWeek === week
    || !Array.isArray(body.entryIds) || !body.entryIds.length || body.entryIds.length > 500
    || new Set(body.entryIds).size !== body.entryIds.length || body.entryIds.some(id => !text(id, 100))) {
    res.status(400).json({ error: 'Select meals and a different Monday.' }); return;
  }
  const source = readWeek(host, week); const entries = (body.entryIds as string[]).map(id => source.entries.find(entry => entry.id === id));
  if (entries.some(entry => !entry)) { res.status(404).json({ error: 'A selected meal is no longer in your week.' }); return; }
  const target = body.targetWeek;
  try { res.status(201).json(mutate(host, target, () => {
    for (const entry of entries as PlanEntry[]) {
      const id = randomUUID(); const date = entry.date ? new Date(Date.parse(entry.date) + Date.parse(target) - Date.parse(week)).toISOString().slice(0, 10) : null;
      getDatabase().run('INSERT INTO plan_entries (id, host_id, week, meal_id, kind, title, date) VALUES (?, ?, ?, ?, ?, ?, ?)', [id, host, target, entry.mealId, entry.kind, entry.title, date]);
      for (const item of source.shopping.filter(row => row.entryId === entry.id)) getDatabase().run('INSERT INTO shopping_items (id, host_id, week, entry_id, source_title, amount, ingredient, aisle, display_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [randomUUID(), host, target, id, entry.title, item.amount, item.ingredient, item.aisle, item.displayOrder]);
    }
  })); } catch { res.status(500).json({ error: 'Could not repeat the week. Try again.' }); }
});
router.get('/:week/staples', (req, res) => { res.json(getAll('SELECT id, title FROM dinner_staples WHERE host_id = ? ORDER BY rowid', [req.session.hostId!])); });
router.post('/:week/staples', (req, res) => {
  if (!bodyObject(req.body) || Object.keys(req.body).length !== 1 || !text(req.body.title, 100)) { res.status(400).json({ error: 'Enter a dinner staple name.' }); return; }
  try { mutate(req.session.hostId!, req.params.week, () => getDatabase().run('INSERT INTO dinner_staples (id, host_id, title) VALUES (?, ?, ?)', [randomUUID(), req.session.hostId!, req.body.title.trim()])); res.status(201).json({ saved: true }); }
  catch { res.status(500).json({ error: 'Could not save the staple.' }); }
});
router.patch('/:week/staples/:id', (req, res) => {
  if (!bodyObject(req.body) || Object.keys(req.body).length !== 1 || !text(req.body.title, 100)) { res.status(400).json({ error: 'Enter a dinner staple name.' }); return; }
  if (!getOne('SELECT id FROM dinner_staples WHERE id = ? AND host_id = ?', [req.params.id, req.session.hostId!])) { res.status(404).json({ error: 'Staple not found.' }); return; }
  try { mutate(req.session.hostId!, req.params.week, () => getDatabase().run('UPDATE dinner_staples SET title = ? WHERE id = ? AND host_id = ?', [req.body.title.trim(), req.params.id, req.session.hostId!])); res.json({ saved: true }); }
  catch { res.status(500).json({ error: 'Could not save the staple.' }); }
});
router.delete('/:week/staples/:id', (req, res) => {
  if (!getOne('SELECT id FROM dinner_staples WHERE id = ? AND host_id = ?', [req.params.id, req.session.hostId!])) { res.status(404).json({ error: 'Staple not found.' }); return; }
  try { mutate(req.session.hostId!, req.params.week, () => getDatabase().run('DELETE FROM dinner_staples WHERE id = ? AND host_id = ?', [req.params.id, req.session.hostId!])); res.json({ saved: true }); }
  catch { res.status(500).json({ error: 'Could not remove the staple.' }); }
});
router.patch('/:week/items/:id', (req, res) => {
  const { week, id } = req.params;
  const host = req.session.hostId!;
  const body: unknown = req.body;
  if (!bodyObject(body) || !Object.keys(body).length || Object.keys(body).some(key => !['ingredient', 'amount', 'state', 'aisle'].includes(key))
    || (body.ingredient !== undefined && !text(body.ingredient, 300))
    || (body.amount !== undefined && !text(body.amount, 100, true))
    || (body.aisle !== undefined && !['Produce', 'Meat & fish', 'Dairy & eggs', 'Bakery', 'Pantry', 'Frozen', 'Other'].includes(body.aisle as string))
    || (body.state !== undefined && !['needed', 'have', 'bought'].includes(body.state as string))) {
    res.status(400).json({ error: 'Check the item details.' }); return;
  }
  const item = getOne<ShoppingItem>('SELECT ingredient, amount, state, aisle FROM shopping_items WHERE id = ? AND host_id = ? AND week = ?', [id, host, week]);
  if (!item) { res.status(404).json({ error: 'Shopping item not found.' }); return; }
  try { res.json(mutate(host, week, () => getDatabase().run('UPDATE shopping_items SET ingredient = ?, amount = ?, state = ?, aisle = ? WHERE id = ?',
    [(body.ingredient as string | undefined)?.trim() ?? item.ingredient, (body.amount as string | undefined)?.trim() ?? item.amount, (body.state as string | undefined) ?? item.state, (body.aisle as string | undefined) ?? item.aisle, id]))); }
  catch { res.status(500).json({ error: 'Could not save the item. Try again.' }); }
});
router.delete('/:week/items/:id', (req, res) => {
  const { week, id } = req.params;
  const host = req.session.hostId!;
  if (!getOne('SELECT id FROM shopping_items WHERE id = ? AND host_id = ? AND week = ?', [id, host, week])) {
    res.status(404).json({ error: 'Shopping item not found.' }); return;
  }
  try { res.json(mutate(host, week, () => getDatabase().run('DELETE FROM shopping_items WHERE id = ?', [id]))); }
  catch { res.status(500).json({ error: 'Could not remove the item. Try again.' }); }
});
export default router;
