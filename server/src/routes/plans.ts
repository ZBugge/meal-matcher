import { Router } from 'express';
import { randomUUID } from 'crypto';
import { getDatabase, getAll, getOne, saveDatabase } from '../db/schema';
import { requireAuth } from '../middleware/auth';
import type { Meal, MealIngredient, PlanEntry, ShoppingItem, WeekPlan } from '../types';

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
      amount, ingredient, state, display_order AS displayOrder FROM shopping_items
      WHERE host_id = ? AND week = ? ORDER BY rowid`, [host, week]),
  };
}
// Restore only the affected week if persistence fails after sql.js commits.
// Exporting during an open transaction would implicitly close the connection.
function mutate(host: string, week: string, action: () => void): WeekPlan {
  const database = getDatabase();
  const entries = getAll<Record<string, string | number | null>>('SELECT * FROM plan_entries WHERE host_id = ? AND week = ?', [host, week]);
  const items = getAll<Record<string, string | number | null>>('SELECT * FROM shopping_items WHERE host_id = ? AND week = ?', [host, week]);
  database.run('BEGIN TRANSACTION');
  try { action(); database.run('COMMIT'); }
  catch (error) { database.run('ROLLBACK'); throw error; }
  try { saveDatabase(); }
  catch (error) {
    database.run('BEGIN TRANSACTION');
    database.run('DELETE FROM shopping_items WHERE host_id = ? AND week = ?', [host, week]);
    database.run('DELETE FROM plan_entries WHERE host_id = ? AND week = ?', [host, week]);
    for (const [table, rows] of [['plan_entries', entries], ['shopping_items', items]] as const) {
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
router.patch('/:week/items/:id', (req, res) => {
  const { week, id } = req.params;
  const host = req.session.hostId!;
  const body: unknown = req.body;
  if (!bodyObject(body) || !Object.keys(body).length || Object.keys(body).some(key => !['ingredient', 'amount', 'state'].includes(key))
    || (body.ingredient !== undefined && !text(body.ingredient, 300))
    || (body.amount !== undefined && !text(body.amount, 100, true))
    || (body.state !== undefined && !['needed', 'have', 'bought'].includes(body.state as string))) {
    res.status(400).json({ error: 'Check the item details.' }); return;
  }
  const item = getOne<ShoppingItem>('SELECT ingredient, amount, state FROM shopping_items WHERE id = ? AND host_id = ? AND week = ?', [id, host, week]);
  if (!item) { res.status(404).json({ error: 'Shopping item not found.' }); return; }
  try { res.json(mutate(host, week, () => getDatabase().run('UPDATE shopping_items SET ingredient = ?, amount = ?, state = ? WHERE id = ?',
    [(body.ingredient as string | undefined)?.trim() ?? item.ingredient, (body.amount as string | undefined)?.trim() ?? item.amount, (body.state as string | undefined) ?? item.state, id]))); }
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
