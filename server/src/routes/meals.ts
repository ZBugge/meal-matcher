import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { runQuery, getOne, getAll } from '../db/schema';
import { Meal, CreateMealRequest } from '../types';
import { requireAuth } from '../middleware/auth';

const router = Router();

// All meal routes require authentication
router.use(requireAuth);

// GET /api/meals - List host's meals (excludes archived)
router.get('/', (req, res) => {
  try {
    const meals = getAll<Meal>(
      `SELECT id, title, description, type, archived, pick_count, created_at
       FROM meals
       WHERE host_id = ? AND archived = 0
       ORDER BY created_at DESC`,
      [req.session.hostId]
    );

    res.json(meals.map(meal => ({
      id: meal.id,
      title: meal.title,
      description: meal.description,
      type: meal.type,
      pickCount: meal.pick_count,
      createdAt: meal.created_at,
    })));
  } catch (error) {
    console.error('Get meals error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/meals/all - List all host's meals including archived
router.get('/all', (req, res) => {
  try {
    const meals = getAll<Meal>(
      `SELECT id, title, description, type, archived, pick_count, created_at
       FROM meals
       WHERE host_id = ?
       ORDER BY created_at DESC`,
      [req.session.hostId]
    );

    res.json(meals.map(meal => ({
      id: meal.id,
      title: meal.title,
      description: meal.description,
      type: meal.type,
      archived: meal.archived === 1,
      pickCount: meal.pick_count,
      createdAt: meal.created_at,
    })));
  } catch (error) {
    console.error('Get all meals error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/meals - Create meal
router.post('/', (req, res) => {
  try {
    const { title, description } = req.body as CreateMealRequest;

    if (!title || title.trim().length === 0) {
      res.status(400).json({ error: 'Title is required' });
      return;
    }

    const id = uuidv4();

    runQuery(
      'INSERT INTO meals (id, host_id, title, description) VALUES (?, ?, ?, ?)',
      [id, req.session.hostId, title.trim(), description?.trim() || null]
    );

    res.status(201).json({
      id,
      title: title.trim(),
      description: description?.trim() || null,
      type: 'meal',
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
      'SELECT id FROM meals WHERE id = ? AND host_id = ?',
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
      updates.push('title = ?');
      params.push(title.trim());
    }

    if (description !== undefined) {
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
      'SELECT id FROM meals WHERE id = ? AND host_id = ?',
      [id, req.session.hostId]
    );

    if (!meal) {
      res.status(404).json({ error: 'Meal not found' });
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
