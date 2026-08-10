import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { runQuery, getOne, getAll, getDatabase, saveDatabase } from '../db/schema';
import {
  Meal,
  MealIngredient,
  MealType,
  CreateMealRequest,
  LibraryExportData,
  LibraryExportOption,
} from '../types';
import { requireAuth } from '../middleware/auth';
import {
  normalizeIngredients,
  normalizeInstructions,
  parseRecipeText,
  RecipeValidationError,
} from '../services/recipe';
import {
  LibraryTransferValidationError,
  parseLibraryExport,
} from '../services/library-transfer';

const router = Router();

const libraryTypes: MealType[] = ['meal', 'category'];

function getRequestedType(value: unknown): MealType | undefined {
  return typeof value === 'string' && ['meal', 'category', 'restaurant'].includes(value)
    ? value as MealType
    : undefined;
}

function getMealIngredients(mealId: string): MealIngredient[] {
  return getAll<MealIngredient>(
    `SELECT amount, ingredient
     FROM meal_ingredients
     WHERE meal_id = ?
     ORDER BY display_order`,
    [mealId]
  );
}

function toLibraryMealResponse(meal: Meal, includeArchived = false) {
  const response = {
    id: meal.id,
    title: meal.title,
    description: meal.description,
    notes: meal.notes ?? null,
    type: meal.type,
    ...(includeArchived ? { archived: meal.archived === 1 } : {}),
    pickCount: meal.pick_count,
    createdAt: meal.created_at,
    lastSelectedAt: meal.last_selected_at ?? null,
  };

  return meal.type === 'meal'
    ? {
        ...response,
        instructions: meal.instructions ?? null,
        ingredients: getMealIngredients(meal.id),
      }
    : response;
}

function addIngredients(
  database: ReturnType<typeof getDatabase>,
  mealId: string,
  ingredients: MealIngredient[]
): void {
  ingredients.forEach((row, index) => {
    database.run(
      `INSERT INTO meal_ingredients (id, meal_id, amount, ingredient, display_order)
       VALUES (?, ?, ?, ?, ?)`,
      [uuidv4(), mealId, row.amount, row.ingredient, index]
    );
  });
}

function runTransaction(action: (database: ReturnType<typeof getDatabase>) => void): void {
  const database = getDatabase();
  database.run('BEGIN TRANSACTION');
  try {
    action(database);
    database.run('COMMIT');
  } catch (error) {
    database.run('ROLLBACK');
    throw error;
  }
  saveDatabase();
}

// All meal routes require authentication
router.use(requireAuth);

// POST /api/meals/parse-recipe - Parse a full recipe without saving it
router.post('/parse-recipe', (req, res) => {
  try {
    res.json(parseRecipeText(req.body?.text));
  } catch (error) {
    if (error instanceof RecipeValidationError) {
      res.status(400).json({ error: error.message });
      return;
    }

    console.error('Parse recipe error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/meals - List host's meals (excludes archived)
router.get('/', (req, res) => {
  try {
    const requestedType = getRequestedType(req.query.type);
    if (req.query.type !== undefined && !requestedType) {
      res.status(400).json({ error: 'Invalid meal type' });
      return;
    }

    const typeFilter = requestedType ? ' AND type = ?' : '';
    const params = requestedType
      ? [req.session.hostId, requestedType]
      : [req.session.hostId];
    const meals = getAll<Meal>(
      `SELECT id, title, description, instructions, notes, type, archived, pick_count, created_at,
        (SELECT MAX(selected_at) FROM session_history WHERE selected_meal_id = meals.id) AS last_selected_at
       FROM meals
       WHERE host_id = ? AND archived = 0${typeFilter}
       ORDER BY created_at DESC`,
      params
    );

    res.json(meals.map(meal => toLibraryMealResponse(meal)));
  } catch (error) {
    console.error('Get meals error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/meals/all - List all host's meals including archived
router.get('/all', (req, res) => {
  try {
    const requestedType = getRequestedType(req.query.type);
    if (req.query.type !== undefined && !requestedType) {
      res.status(400).json({ error: 'Invalid meal type' });
      return;
    }

    const typeFilter = requestedType ? ' AND type = ?' : '';
    const params = requestedType
      ? [req.session.hostId, requestedType]
      : [req.session.hostId];
    const meals = getAll<Meal>(
      `SELECT id, title, description, instructions, notes, type, archived, pick_count, created_at,
        (SELECT MAX(selected_at) FROM session_history WHERE selected_meal_id = meals.id) AS last_selected_at
       FROM meals
       WHERE host_id = ?${typeFilter}
       ORDER BY created_at DESC`,
      params
    );

    res.json(meals.map(meal => toLibraryMealResponse(meal, true)));
  } catch (error) {
    console.error('Get all meals error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/meals/export - Export active host library data without internal metadata
router.get('/export', (req, res) => {
  try {
    const meals = getAll<Meal>(
      `SELECT id, title, description, instructions, notes, type
       FROM meals
       WHERE host_id = ? AND archived = 0 AND type IN ('meal', 'category')
       ORDER BY type, title`,
      [req.session.hostId]
    );
    const options: LibraryExportOption[] = meals.map((meal) => meal.type === 'meal'
      ? {
          title: meal.title,
          type: 'meal',
          description: meal.description,
          notes: meal.notes ?? null,
          instructions: meal.instructions ?? null,
          ingredients: getMealIngredients(meal.id),
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
  } catch (error) {
    console.error('Export library error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/meals/import - Preview or import active library data
router.post('/import', (req, res) => {
  try {
    const { data, dryRun } = req.body ?? {};
    if (typeof dryRun !== 'boolean') {
      res.status(400).json({ error: 'dryRun must be a boolean' });
      return;
    }

    const { valid, invalid } = parseLibraryExport(data);
    const existing = getAll<Pick<Meal, 'title' | 'type'>>(
      `SELECT title, type FROM meals
       WHERE host_id = ? AND archived = 0 AND type IN ('meal', 'category')`,
      [req.session.hostId]
    );
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
      runTransaction((database) => {
        ready.forEach((option) => {
          const id = uuidv4();
          database.run(
            `INSERT INTO meals (id, host_id, title, description, instructions, notes, type)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              id,
              req.session.hostId,
              option.title,
              option.type === 'meal' ? option.description ?? null : null,
              option.type === 'meal' ? option.instructions ?? null : null,
              option.notes ?? null,
              option.type,
            ]
          );
          if (option.type === 'meal') addIngredients(database, id, option.ingredients ?? []);
        });
        if (ready.some((option) => option.type === 'category')) {
          database.run(
            'UPDATE hosts SET takeout_onboarding_dismissed = 1 WHERE id = ?',
            [req.session.hostId]
          );
        }
      });
    }

    res.json({
      ready: ready.length,
      imported: dryRun ? 0 : ready.length,
      duplicates,
      invalid,
    });
  } catch (error) {
    if (error instanceof LibraryTransferValidationError) {
      res.status(400).json({ error: error.message });
      return;
    }
    console.error('Import library error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/meals/:id - Get one host-owned meal, including private recipe data
router.get('/:id', (req, res) => {
  try {
    const meal = getOne<Meal>(
      `SELECT id, title, description, instructions, notes, type, archived, pick_count, created_at,
        (SELECT MAX(selected_at) FROM session_history WHERE selected_meal_id = meals.id) AS last_selected_at
       FROM meals
       WHERE id = ? AND host_id = ?`,
      [req.params.id, req.session.hostId]
    );

    if (!meal) {
      res.status(404).json({ error: 'Meal not found' });
      return;
    }

    res.json(toLibraryMealResponse(meal, true));
  } catch (error) {
    console.error('Get meal error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/meals - Create meal
router.post('/', (req, res) => {
  try {
    const {
      title,
      description,
      type = 'meal',
      instructions,
      ingredients,
    } = req.body as CreateMealRequest;

    if (!title || title.trim().length === 0) {
      res.status(400).json({ error: 'Title is required' });
      return;
    }

    if (!libraryTypes.includes(type)) {
      res.status(400).json({ error: 'Type must be meal or category' });
      return;
    }

    const hasRecipeFields = instructions !== undefined || ingredients !== undefined;
    if (type === 'category' && hasRecipeFields) {
      res.status(400).json({ error: 'Food categories do not support recipes' });
      return;
    }

    let normalizedInstructions: string | null = null;
    let normalizedIngredients: MealIngredient[] = [];
    try {
      if (instructions !== undefined) {
        normalizedInstructions = normalizeInstructions(instructions);
      }
      if (ingredients !== undefined) {
        normalizedIngredients = normalizeIngredients(ingredients);
      }
    } catch (error) {
      if (error instanceof RecipeValidationError) {
        res.status(400).json({ error: error.message });
        return;
      }
      throw error;
    }

    const normalizedTitle = title.trim();
    const existing = getOne<Meal>(
      `SELECT id FROM meals
       WHERE host_id = ? AND type = ? AND archived = 0 AND LOWER(title) = LOWER(?)`,
      [req.session.hostId, type, normalizedTitle]
    );

    if (existing) {
      res.status(409).json({
        error: `A ${type === 'category' ? 'food category' : 'meal'} with this name already exists`,
        existingId: existing.id,
      });
      return;
    }

    const id = uuidv4();
    const normalizedDescription = type === 'category' ? null : description?.trim() || null;

    runTransaction((database) => {
      database.run(
        `INSERT INTO meals (id, host_id, title, description, instructions, type)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          id,
          req.session.hostId,
          normalizedTitle,
          normalizedDescription,
          normalizedInstructions,
          type,
        ]
      );
      addIngredients(database, id, normalizedIngredients);

      if (type === 'category') {
        database.run(
          'UPDATE hosts SET takeout_onboarding_dismissed = 1 WHERE id = ?',
          [req.session.hostId]
        );
      }
    });

    const created = getOne<Meal>('SELECT * FROM meals WHERE id = ?', [id]);
    res.status(201).json(toLibraryMealResponse(created!));
  } catch (error) {
    console.error('Create meal error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/meals/:id - Update meal
router.patch('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, instructions, ingredients, notes } = req.body;

    // Verify ownership
    const meal = getOne<Meal>(
      'SELECT id, type FROM meals WHERE id = ? AND host_id = ?',
      [id, req.session.hostId]
    );

    if (!meal) {
      res.status(404).json({ error: 'Meal not found' });
      return;
    }

    const hasRecipeFields = instructions !== undefined || ingredients !== undefined;
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
      const duplicate = getOne<Meal>(
        `SELECT id FROM meals
         WHERE host_id = ? AND type = ? AND archived = 0
           AND LOWER(title) = LOWER(?) AND id <> ?`,
        [req.session.hostId, meal.type, title.trim(), id]
      );
      if (duplicate) {
        res.status(409).json({
          error: `A ${meal.type === 'category' ? 'food category' : 'meal'} with this name already exists`,
          existingId: duplicate.id,
        });
        return;
      }
      updates.push('title = ?');
      params.push(title.trim());
    }

    if (description !== undefined) {
      if (meal.type === 'category') {
        res.status(400).json({ error: 'Food categories do not support descriptions' });
        return;
      }
      updates.push('description = ?');
      params.push(description?.trim() || null);
    }

    if (notes !== undefined) {
      if (notes !== null && typeof notes !== 'string') {
        res.status(400).json({ error: 'Notes must be text' });
        return;
      }
      updates.push('notes = ?');
      params.push(notes?.trim() || null);
    }

    let normalizedIngredients: MealIngredient[] | undefined;
    try {
      if (instructions !== undefined) {
        updates.push('instructions = ?');
        params.push(normalizeInstructions(instructions));
      }
      if (ingredients !== undefined) {
        normalizedIngredients = normalizeIngredients(ingredients);
      }
    } catch (error) {
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

    runTransaction((database) => {
      if (updates.length > 0) {
        database.run(
          `UPDATE meals SET ${updates.join(', ')} WHERE id = ?`,
          [...params, id]
        );
      }
      if (normalizedIngredients !== undefined) {
        database.run('DELETE FROM meal_ingredients WHERE meal_id = ?', [id]);
        addIngredients(database, id, normalizedIngredients);
      }
    });

    // Return updated meal
    const updated = getOne<Meal>('SELECT * FROM meals WHERE id = ?', [id]);
    res.json(toLibraryMealResponse(updated!));
  } catch (error) {
    console.error('Update meal error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/meals/:id - Archive meal (soft delete)
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;

    // Verify ownership
    const meal = getOne<Meal>(
      'SELECT id FROM meals WHERE id = ? AND host_id = ?',
      [id, req.session.hostId]
    );

    if (!meal) {
      res.status(404).json({ error: 'Meal not found' });
      return;
    }

    // Soft delete by setting archived = 1
    runQuery('UPDATE meals SET archived = 1 WHERE id = ?', [id]);

    res.json({ message: 'Meal archived successfully' });
  } catch (error) {
    console.error('Delete meal error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/meals/:id/restore - Restore archived meal
router.post('/:id/restore', (req, res) => {
  try {
    const { id } = req.params;

    // Verify ownership
    const meal = getOne<Meal>(
      'SELECT id, title, type FROM meals WHERE id = ? AND host_id = ?',
      [id, req.session.hostId]
    );

    if (!meal) {
      res.status(404).json({ error: 'Meal not found' });
      return;
    }

    const duplicate = getOne<Meal>(
      `SELECT id FROM meals
       WHERE host_id = ? AND type = ? AND archived = 0
         AND LOWER(title) = LOWER(?) AND id <> ?`,
      [req.session.hostId, meal.type, meal.title, id]
    );
    if (duplicate) {
      res.status(409).json({
        error: `An active ${meal.type === 'category' ? 'food category' : 'meal'} with this name already exists`,
        existingId: duplicate.id,
      });
      return;
    }

    runQuery('UPDATE meals SET archived = 0 WHERE id = ?', [id]);

    res.json({ message: 'Meal restored successfully' });
  } catch (error) {
    console.error('Restore meal error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
