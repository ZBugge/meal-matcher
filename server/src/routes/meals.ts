import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { runQuery, getOne, getAll, Mutation, ConflictError, libraryRevision, storedText, stageRows, publishRows } from '../db/schema';
import { Meal, MealIngredient, MealType, CreateMealRequest, LibraryExportData, LibraryExportOption, } from '../types';
import { requireAuth } from '../middleware/auth';
import { normalizeIngredients, normalizeInstructions, parseRecipeText, RecipeValidationError, } from '../services/recipe';
import { LibraryTransferValidationError, parseLibraryExport, validateMealMetadata, } from '../services/library-transfer';
const router = Router();
const libraryTypes: MealType[] = ['meal', 'category'];
async function duplicateMeal(host: string, type: MealType, title: string, except?: string) { const meals = await getAll<Pick<Meal, 'id' | 'title'>>(`SELECT id,title FROM meals WHERE host_id=? AND type=? AND archived=0 AND NOT EXISTS(SELECT 1 FROM notion_recipes n WHERE n.meal_id=meals.id)`, [host, type]); return meals.find(meal => meal.id !== except && meal.title.toLowerCase() === title.toLowerCase()); }
function getRequestedType(value: unknown): MealType | undefined {
    return typeof value === 'string' && ['meal', 'category', 'restaurant'].includes(value)
        ? value as MealType
        : undefined;
}
async function libraryResponses(meals: Meal[], includeArchived = false) {
    const ids = JSON.stringify(meals.map(meal => meal.id));
    const ingredients = await getAll<MealIngredient & {
        meal_id: string;
    }>('SELECT meal_id, amount, ingredient FROM meal_ingredients WHERE meal_id IN (SELECT value FROM json_each(?)) ORDER BY display_order', [ids]);
    const notions = await getAll<{
        meal_id: string;
        source_url: string;
    }>('SELECT meal_id, source_url FROM notion_recipes WHERE meal_id IN (SELECT value FROM json_each(?))', [ids]);
    const grouped = new Map<string, MealIngredient[]>();
    for (const row of ingredients) {
        const list = grouped.get(row.meal_id) ?? [];
        list.push({ amount: row.amount, ingredient: row.ingredient });
        grouped.set(row.meal_id, list);
    }
    return meals.map(meal => { const notion = notions.find(row => row.meal_id === meal.id); return { id: meal.id, title: meal.title, description: meal.description, notes: meal.notes ?? null, type: meal.type, ...(includeArchived ? { archived: meal.archived === 1 } : {}), pickCount: meal.pick_count, createdAt: meal.created_at, lastSelectedAt: meal.last_selected_at ?? null, ...(notion ? { source: 'notion' as const, notionUrl: notion.source_url } : {}), ...(meal.type === 'meal' ? { instructions: meal.instructions ?? null, totalMinutes: meal.total_minutes ?? null, effort: meal.effort ?? null, ingredients: grouped.get(meal.id) ?? [] } : {}) }; });
}
async function toLibraryMealResponse(meal: Meal, includeArchived = false) { return (await libraryResponses([meal], includeArchived))[0]; }
function addIngredients(database: Mutation, mealId: string, ingredients: MealIngredient[]): void { database.run(`INSERT INTO meal_ingredients(id,meal_id,amount,ingredient,display_order) SELECT lower(hex(randomblob(16))), ?, json_extract(value,'$.amount'),json_extract(value,'$.ingredient'),CAST(key AS INTEGER) FROM json_each(?)`, [mealId, JSON.stringify(ingredients)]); }
async function runTransaction(host: string, revision: number, action: (database: Mutation) => void): Promise<void> { const database = new Mutation(); database.library(host, revision); action(database); await database.commit(); }
// All meal routes require authentication
router.use(requireAuth);
// POST /api/meals/parse-recipe - Parse a full recipe without saving it
router.post('/parse-recipe', async (req, res) => {
    try {
        const revision = await libraryRevision(req.session.hostId!);
        res.json(parseRecipeText(req.body?.text));
    }
    catch (error) {
        if (error instanceof ConflictError) {
            res.status(409).json({ error: error.message });
            return;
        }
        if (error instanceof RecipeValidationError) {
            res.status(400).json({ error: error.message });
            return;
        }
        console.error('Parse recipe error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// GET /api/meals - List host's meals (excludes archived)
router.get('/', async (req, res) => {
    try {
        const revision = await libraryRevision(req.session.hostId!);
        const requestedType = getRequestedType(req.query.type);
        if (req.query.type !== undefined && !requestedType) {
            res.status(400).json({ error: 'Invalid meal type' });
            return;
        }
        const typeFilter = requestedType ? ' AND type = ?' : '';
        const params = requestedType
            ? [req.session.hostId, requestedType]
            : [req.session.hostId];
        const meals = await getAll<Meal>(`SELECT id, title, description, instructions, notes, total_minutes, effort, type, archived, pick_count, created_at,
        (SELECT MAX(selected_at) FROM session_history WHERE selected_meal_id = meals.id) AS last_selected_at
       FROM meals
       WHERE host_id = ? AND archived = 0${typeFilter}
       ORDER BY created_at DESC`, params);
        res.json(await libraryResponses(meals));
    }
    catch (error) {
        if (error instanceof ConflictError) {
            res.status(409).json({ error: error.message });
            return;
        }
        console.error('Get meals error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// GET /api/meals/all - List all host's meals including archived
router.get('/all', async (req, res) => {
    try {
        const revision = await libraryRevision(req.session.hostId!);
        const requestedType = getRequestedType(req.query.type);
        if (req.query.type !== undefined && !requestedType) {
            res.status(400).json({ error: 'Invalid meal type' });
            return;
        }
        const typeFilter = requestedType ? ' AND type = ?' : '';
        const params = requestedType
            ? [req.session.hostId, requestedType]
            : [req.session.hostId];
        const meals = await getAll<Meal>(`SELECT id, title, description, instructions, notes, total_minutes, effort, type, archived, pick_count, created_at,
        (SELECT MAX(selected_at) FROM session_history WHERE selected_meal_id = meals.id) AS last_selected_at
       FROM meals
       WHERE host_id = ?${typeFilter}
       ORDER BY created_at DESC`, params);
        res.json(await libraryResponses(meals, true));
    }
    catch (error) {
        if (error instanceof ConflictError) {
            res.status(409).json({ error: error.message });
            return;
        }
        console.error('Get all meals error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// GET /api/meals/export - Export active host library data without internal metadata
router.get('/export', async (req, res) => {
    try {
        const revision = await libraryRevision(req.session.hostId!);
        const meals = await getAll<Meal>(`SELECT id, title, description, instructions, notes, total_minutes, effort, type
       FROM meals
       WHERE host_id = ? AND archived = 0 AND type IN ('meal', 'category')
         AND NOT EXISTS (SELECT 1 FROM notion_recipes n WHERE n.meal_id = meals.id)
       ORDER BY type, title`, [req.session.hostId]);
        const allIngredients = await getAll<MealIngredient & {
            meal_id: string;
        }>('SELECT meal_id, amount, ingredient FROM meal_ingredients WHERE meal_id IN (SELECT value FROM json_each(?)) ORDER BY display_order', [JSON.stringify(meals.map(meal => meal.id))]);
        const byMeal = new Map<string, MealIngredient[]>();
        for (const row of allIngredients) {
            const list = byMeal.get(row.meal_id) ?? [];
            list.push({ amount: row.amount, ingredient: row.ingredient });
            byMeal.set(row.meal_id, list);
        }
        const options: LibraryExportOption[] = meals.map((meal) => meal.type === 'meal'
            ? {
                title: meal.title,
                type: 'meal',
                description: meal.description,
                notes: meal.notes ?? null,
                instructions: meal.instructions ?? null,
                totalMinutes: meal.total_minutes ?? null,
                effort: meal.effort ?? null,
                ingredients: byMeal.get(meal.id) ?? [],
            }
            : {
                title: meal.title,
                type: 'category',
                notes: meal.notes ?? null,
            });
        const data: LibraryExportData = {
            version: 1,
            exportedAt: new Date().toISOString(),
            options,
        };
        res.json(data);
    }
    catch (error) {
        if (error instanceof ConflictError) {
            res.status(409).json({ error: error.message });
            return;
        }
        console.error('Export library error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// POST /api/meals/import - Preview or import active library data
router.post('/import', async (req, res) => {
    try {
        const revision = await libraryRevision(req.session.hostId!);
        const { data, dryRun } = req.body ?? {};
        if (typeof dryRun !== 'boolean') {
            res.status(400).json({ error: 'dryRun must be a boolean' });
            return;
        }
        const { valid, invalid } = parseLibraryExport(data);
        const existing = await getAll<Pick<Meal, 'title' | 'type'>>(`SELECT title, type FROM meals
       WHERE host_id = ? AND archived = 0 AND type IN ('meal', 'category')
         AND NOT EXISTS (SELECT 1 FROM notion_recipes n WHERE n.meal_id = meals.id)`, [req.session.hostId]);
        const seen = new Set(existing.map((meal) => `${meal.type}:${meal.title.toLowerCase()}`));
        const duplicates: string[] = [];
        const ready: LibraryExportOption[] = [];
        valid.forEach((option) => {
            const key = `${option.type}:${option.title.toLowerCase()}`;
            if (seen.has(key)) {
                duplicates.push(`${option.title} (${option.type})`);
                return;
            }
            seen.add(key);
            ready.push(option);
        });
        if (!dryRun && ready.length > 0) {
            const mealRows: Record<string, unknown>[] = [];
            const mealIds = ready.map(() => uuidv4());
            const host = req.session.hostId!;
            for (const [index, option] of ready.entries())
                mealRows.push({ id: mealIds[index], host, title: await storedText(option.title, host), description: await storedText(option.type === 'meal' ? option.description : null, host), instructions: await storedText(option.type === 'meal' ? option.instructions : null, host), notes: await storedText(option.notes, host), totalMinutes: option.type === 'meal' ? option.totalMinutes ?? null : null, effort: option.type === 'meal' ? option.effort ?? null : null, type: option.type });
            async function* ingredientRows() { for (const [index, option] of ready.entries())
                for (const [order, row] of (option.ingredients ?? []).entries())
                    yield { id: uuidv4(), mealId: mealIds[index], amount: await storedText(row.amount, host), ingredient: await storedText(row.ingredient, host), order }; }
            const mealStage = await stageRows(host, mealRows);
            const ingredientStage = await stageRows(host, ingredientRows());
            const database = new Mutation();
            database.library(req.session.hostId!, revision);
            publishRows(database, mealStage, `INSERT INTO meals(id,host_id,title,description,instructions,notes,total_minutes,effort,type) SELECT json_extract(j.value,'$.id'),json_extract(j.value,'$.host'),json_extract(j.value,'$.title'),json_extract(j.value,'$.description'),json_extract(j.value,'$.instructions'),json_extract(j.value,'$.notes'),json_extract(j.value,'$.totalMinutes'),json_extract(j.value,'$.effort'),json_extract(j.value,'$.type') FROM $ROWS WHERE $STAGE ORDER BY c.ordinal, CAST(j.key AS INTEGER)`);
            publishRows(database, ingredientStage, `INSERT INTO meal_ingredients(id,meal_id,amount,ingredient,display_order) SELECT json_extract(j.value,'$.id'),json_extract(j.value,'$.mealId'),json_extract(j.value,'$.amount'),json_extract(j.value,'$.ingredient'),json_extract(j.value,'$.order') FROM $ROWS WHERE $STAGE ORDER BY c.ordinal, CAST(j.key AS INTEGER)`);
            if (ready.some(option => option.type === 'category'))
                database.run('UPDATE hosts SET takeout_onboarding_dismissed=1 WHERE id=?', [req.session.hostId]);
            await database.commit();
        }
        res.json({
            ready: ready.length,
            imported: dryRun ? 0 : ready.length,
            duplicates,
            invalid,
        });
    }
    catch (error) {
        if (error instanceof ConflictError) {
            res.status(409).json({ error: error.message });
            return;
        }
        if (error instanceof LibraryTransferValidationError) {
            res.status(400).json({ error: error.message });
            return;
        }
        console.error('Import library error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// GET /api/meals/:id - Get one host-owned meal, including private recipe data
router.get('/:id', async (req, res) => {
    try {
        const revision = await libraryRevision(req.session.hostId!);
        const meal = await getOne<Meal>(`SELECT id, title, description, instructions, notes, total_minutes, effort, type, archived, pick_count, created_at,
        (SELECT MAX(selected_at) FROM session_history WHERE selected_meal_id = meals.id) AS last_selected_at
       FROM meals
       WHERE id = ? AND host_id = ?`, [req.params.id, req.session.hostId]);
        if (!meal) {
            res.status(404).json({ error: 'Meal not found' });
            return;
        }
        res.json(await toLibraryMealResponse(meal, true));
    }
    catch (error) {
        if (error instanceof ConflictError) {
            res.status(409).json({ error: error.message });
            return;
        }
        console.error('Get meal error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// POST /api/meals - Create meal
router.post('/', async (req, res) => {
    try {
        const revision = await libraryRevision(req.session.hostId!);
        const { title, description, type = 'meal', instructions, ingredients, totalMinutes, effort, } = req.body as CreateMealRequest;
        if (!title || title.trim().length === 0) {
            res.status(400).json({ error: 'Title is required' });
            return;
        }
        if (!libraryTypes.includes(type)) {
            res.status(400).json({ error: 'Type must be meal or category' });
            return;
        }
        validateMealMetadata(req.body.totalMinutes, req.body.effort);
        const hasRecipeFields = instructions !== undefined || ingredients !== undefined || req.body.totalMinutes != null || req.body.effort != null;
        if (type === 'category' && hasRecipeFields) {
            res.status(400).json({ error: 'Food categories do not support recipes' });
            return;
        }
        let normalizedInstructions: string | null = null;
        let normalizedIngredients: MealIngredient[] = [];
        try {
            const revision = await libraryRevision(req.session.hostId!);
            if (instructions !== undefined) {
                normalizedInstructions = normalizeInstructions(instructions);
            }
            if (ingredients !== undefined) {
                normalizedIngredients = normalizeIngredients(ingredients);
            }
        }
        catch (error) {
            if (error instanceof ConflictError) {
                res.status(409).json({ error: error.message });
                return;
            }
            if (error instanceof RecipeValidationError) {
                res.status(400).json({ error: error.message });
                return;
            }
            throw error;
        }
        const normalizedTitle = title.trim();
        const existing = await duplicateMeal(req.session.hostId!, type, normalizedTitle);
        if (existing) {
            res.status(409).json({
                error: `A ${type === 'category' ? 'food category' : 'meal'} with this name already exists`,
                existingId: existing.id,
            });
            return;
        }
        const id = uuidv4();
        const persistedTitle = await storedText(normalizedTitle, req.session.hostId!);
        const normalizedDescription = type === 'category' ? null : description?.trim() || null;
        const persistedDescription = await storedText(normalizedDescription, req.session.hostId!);
        const persistedInstructions = await storedText(normalizedInstructions, req.session.hostId!);
        const persistedIngredients = await Promise.all(normalizedIngredients.map(async (row) => ({ amount: (await storedText(row.amount, req.session.hostId!))!, ingredient: (await storedText(row.ingredient, req.session.hostId!))! })));
        await runTransaction(req.session.hostId!, revision, (database) => {
            database.run(`INSERT INTO meals (id, host_id, title, description, instructions, total_minutes, effort, type)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [
                id,
                req.session.hostId,
                persistedTitle,
                persistedDescription,
                persistedInstructions,
                totalMinutes ?? null,
                effort ?? null,
                type,
            ]);
            addIngredients(database, id, persistedIngredients);
            if (type === 'category') {
                database.run('UPDATE hosts SET takeout_onboarding_dismissed = 1 WHERE id = ?', [req.session.hostId]);
            }
        });
        const created = await getOne<Meal>('SELECT * FROM meals WHERE id = ?', [id]);
        res.status(201).json(await toLibraryMealResponse(created!));
    }
    catch (error) {
        if (error instanceof ConflictError) {
            res.status(409).json({ error: error.message });
            return;
        }
        if (error instanceof LibraryTransferValidationError) {
            res.status(400).json({ error: error.message });
            return;
        }
        console.error('Create meal error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// PATCH /api/meals/:id - Update meal
router.patch('/:id', async (req, res) => {
    try {
        const revision = await libraryRevision(req.session.hostId!);
        const { id } = req.params;
        const { title, description, instructions, ingredients, notes } = req.body;
        // Verify ownership
        const meal = await getOne<Meal>('SELECT id, type FROM meals WHERE id = ? AND host_id = ?', [id, req.session.hostId]);
        if (!meal) {
            res.status(404).json({ error: 'Meal not found' });
            return;
        }
        if (await getOne('SELECT meal_id FROM notion_recipes WHERE meal_id = ? AND host_id = ?', [id, req.session.hostId])) {
            res.status(403).json({ error: 'Edit this recipe in Notion, then refresh your Notion recipes.' });
            return;
        }
        validateMealMetadata(req.body.totalMinutes, req.body.effort);
        const hasRecipeFields = instructions !== undefined || ingredients !== undefined || req.body.totalMinutes != null || req.body.effort != null;
        if (meal.type === 'category' && hasRecipeFields) {
            res.status(400).json({ error: 'Food categories do not support recipes' });
            return;
        }
        // Build update query dynamically
        const updates: string[] = [];
        const params: unknown[] = [];
        if (title !== undefined) {
            if (title.trim().length === 0) {
                res.status(400).json({ error: 'Title cannot be empty' });
                return;
            }
            const duplicate = await duplicateMeal(req.session.hostId!, meal.type, title.trim(), id);
            if (duplicate) {
                res.status(409).json({
                    error: `A ${meal.type === 'category' ? 'food category' : 'meal'} with this name already exists`,
                    existingId: duplicate.id,
                });
                return;
            }
            updates.push('title = ?');
            params.push(await storedText(title.trim(), req.session.hostId!));
        }
        if (description !== undefined) {
            if (meal.type === 'category') {
                res.status(400).json({ error: 'Food categories do not support descriptions' });
                return;
            }
            updates.push('description = ?');
            params.push(await storedText(description?.trim() || null, req.session.hostId!));
        }
        if (notes !== undefined) {
            if (notes !== null && typeof notes !== 'string') {
                res.status(400).json({ error: 'Notes must be text' });
                return;
            }
            updates.push('notes = ?');
            params.push(await storedText(notes?.trim() || null, req.session.hostId!));
        }
        for (const [field, column] of [['totalMinutes', 'total_minutes'], ['effort', 'effort']]) {
            if (req.body[field] !== undefined) {
                updates.push(`${column} = ?`);
                params.push(req.body[field]);
            }
        }
        let normalizedIngredients: MealIngredient[] | undefined;
        try {
            if (instructions !== undefined) {
                updates.push('instructions = ?');
                params.push(await storedText(normalizeInstructions(instructions), req.session.hostId!));
            }
            if (ingredients !== undefined) {
                normalizedIngredients = normalizeIngredients(ingredients);
            }
        }
        catch (error) {
            if (error instanceof ConflictError) {
                res.status(409).json({ error: error.message });
                return;
            }
            if (error instanceof RecipeValidationError) {
                res.status(400).json({ error: error.message });
                return;
            }
            throw error;
        }
        if (updates.length === 0 && normalizedIngredients === undefined) {
            res.status(400).json({ error: 'No fields to update' });
            return;
        }
        const persistedIngredients = normalizedIngredients === undefined ? undefined : await Promise.all(normalizedIngredients.map(async (row) => ({ amount: (await storedText(row.amount, req.session.hostId!))!, ingredient: (await storedText(row.ingredient, req.session.hostId!))! })));
        await runTransaction(req.session.hostId!, revision, (database) => {
            if (updates.length > 0) {
                database.run(`UPDATE meals SET ${updates.join(', ')} WHERE id = ?`, [...params, id]);
            }
            if (persistedIngredients !== undefined) {
                database.run('DELETE FROM meal_ingredients WHERE meal_id = ?', [id]);
                addIngredients(database, id, persistedIngredients);
            }
        });
        // Return updated meal
        const updated = await getOne<Meal>('SELECT * FROM meals WHERE id = ?', [id]);
        res.json(await toLibraryMealResponse(updated!));
    }
    catch (error) {
        if (error instanceof ConflictError) {
            res.status(409).json({ error: error.message });
            return;
        }
        if (error instanceof LibraryTransferValidationError) {
            res.status(400).json({ error: error.message });
            return;
        }
        console.error('Update meal error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// DELETE /api/meals/:id - Archive meal (soft delete)
router.delete('/:id', async (req, res) => {
    try {
        const revision = await libraryRevision(req.session.hostId!);
        const { id } = req.params;
        // Verify ownership
        const meal = await getOne<Meal>('SELECT id FROM meals WHERE id = ? AND host_id = ?', [id, req.session.hostId]);
        if (!meal) {
            res.status(404).json({ error: 'Meal not found' });
            return;
        }
        if (await getOne('SELECT meal_id FROM notion_recipes WHERE meal_id = ? AND host_id = ?', [id, req.session.hostId])) {
            res.status(403).json({ error: 'Remove this recipe in Notion, then refresh your Notion recipes.' });
            return;
        }
        // Soft delete by setting archived = 1
        await runTransaction(req.session.hostId!, revision, database => { database.run('UPDATE meals SET archived = 1 WHERE id = ? AND host_id = ?', [id, req.session.hostId]); });
        res.json({ message: 'Meal archived successfully' });
    }
    catch (error) {
        if (error instanceof ConflictError) {
            res.status(409).json({ error: error.message });
            return;
        }
        console.error('Delete meal error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// POST /api/meals/:id/restore - Restore archived meal
router.post('/:id/restore', async (req, res) => {
    try {
        const revision = await libraryRevision(req.session.hostId!);
        const { id } = req.params;
        // Verify ownership
        const meal = await getOne<Meal>('SELECT id, title, type FROM meals WHERE id = ? AND host_id = ?', [id, req.session.hostId]);
        if (!meal) {
            res.status(404).json({ error: 'Meal not found' });
            return;
        }
        if (await getOne('SELECT meal_id FROM notion_recipes WHERE meal_id = ? AND host_id = ?', [id, req.session.hostId])) {
            res.status(403).json({ error: 'Restore this recipe in Notion, then refresh your Notion recipes.' });
            return;
        }
        const duplicate = await duplicateMeal(req.session.hostId!, meal.type, meal.title, id);
        if (duplicate) {
            res.status(409).json({
                error: `An active ${meal.type === 'category' ? 'food category' : 'meal'} with this name already exists`,
                existingId: duplicate.id,
            });
            return;
        }
        await runTransaction(req.session.hostId!, revision, database => { database.run('UPDATE meals SET archived = 0 WHERE id = ? AND host_id = ?', [id, req.session.hostId]); });
        res.json({ message: 'Meal restored successfully' });
    }
    catch (error) {
        if (error instanceof ConflictError) {
            res.status(409).json({ error: error.message });
            return;
        }
        console.error('Restore meal error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
export default router;
