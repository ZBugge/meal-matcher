import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { runQuery, getOne, getAll } from '../db/schema';
import { Meal, MealType, CreateMealRequest } from '../types';
import { requireAuth } from '../middleware/auth';

const router = Router();

const libraryTypes: MealType[] = ['meal', 'category'];

function getRequestedType(value: unknown): MealType | undefined {
  return typeof value === 'string' && ['meal', 'category', 'restaurant'].includes(value)
    ? value as MealType
    : undefined;
}

// All meal routes require authentication
router.use(requireAuth);

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
      `SELECT id, title, description, type, archived, pick_count, created_at,
        (SELECT MAX(selected_at) FROM session_history WHERE selected_meal_id = meals.id) AS last_selected_at
       FROM meals
       WHERE host_id = ? AND archived = 0${typeFilter}
       ORDER BY created_at DESC`,
      params
    );

    res.json(meals.map(meal => ({
      id: meal.id,
      title: meal.title,
      description: meal.description,
      type: meal.type,
      pickCount: meal.pick_count,
      createdAt: meal.created_at,
      lastSelectedAt: meal.last_selected_at ?? null,
    })));
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
      `SELECT id, title, description, type, archived, pick_count, created_at,
        (SELECT MAX(selected_at) FROM session_history WHERE selected_meal_id = meals.id) AS last_selected_at
       FROM meals
       WHERE host_id = ?${typeFilter}
       ORDER BY created_at DESC`,
      params
    );

    res.json(meals.map(meal => ({
      id: meal.id,
      title: meal.title,
      description: meal.description,
      type: meal.type,
      archived: meal.archived === 1,
      pickCount: meal.pick_count,
      createdAt: meal.created_at,
      lastSelectedAt: meal.last_selected_at ?? null,
    })));
  } catch (error) {
    console.error('Get all meals error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/meals - Create meal
router.post('/', (req, res) => {
  try {
    const { title, description, type = 'meal' } = req.body as CreateMealRequest;

    if (!title || title.trim().length === 0) {
      res.status(400).json({ error: 'Title is required' });
      return;
    }

    if (!libraryTypes.includes(type)) {
      res.status(400).json({ error: 'Type must be meal or category' });
      return;
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

    runQuery(
      'INSERT INTO meals (id, host_id, title, description, type) VALUES (?, ?, ?, ?, ?)',
      [id, req.session.hostId, normalizedTitle, normalizedDescription, type]
    );

    if (type === 'category') {
      runQuery(
        'UPDATE hosts SET takeout_onboarding_dismissed = 1 WHERE id = ?',
        [req.session.hostId]
      );
    }

    res.status(201).json({
      id,
      title: normalizedTitle,
      description: normalizedDescription,
      type,
      pickCount: 0,
    });
  } catch (error) {
    console.error('Create meal error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/meals/:id - Update meal
router.patch('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { title, description } = req.body;

    // Verify ownership
    const meal = getOne<Meal>(
      'SELECT id, type FROM meals WHERE id = ? AND host_id = ?',
      [id, req.session.hostId]
    );

    if (!meal) {
      res.status(404).json({ error: 'Meal not found' });
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

    if (updates.length === 0) {
      res.status(400).json({ error: 'No fields to update' });
      return;
    }

    params.push(id);
    runQuery(`UPDATE meals SET ${updates.join(', ')} WHERE id = ?`, params);

    // Return updated meal
    const updated = getOne<Meal>('SELECT * FROM meals WHERE id = ?', [id]);
    res.json({
      id: updated!.id,
      title: updated!.title,
      description: updated!.description,
      type: updated!.type,
      pickCount: updated!.pick_count,
    });
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
