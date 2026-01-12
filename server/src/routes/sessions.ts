import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { runQuery, getOne, getAll } from '../db/schema';
import { Session, Meal, Participant, CreateSessionRequest } from '../types';
import { requireAuth } from '../middleware/auth';
import { generateInviteCode, calculateResults } from '../services/matching';

const router = Router();

// All session routes require authentication
router.use(requireAuth);

// GET /api/sessions - List host's sessions
router.get('/', (req, res) => {
  try {
    const sessions = getAll<Session & { meal_count: number; participant_count: number }>(
      `SELECT
        s.*,
        (SELECT COUNT(*) FROM session_meals WHERE session_id = s.id) as meal_count,
        (SELECT COUNT(*) FROM participants WHERE session_id = s.id) as participant_count
      FROM sessions s
      WHERE s.host_id = ?
      ORDER BY s.created_at DESC`,
      [req.session.hostId]
    );

    res.json(sessions.map(session => ({
      id: session.id,
      inviteCode: session.invite_code,
      status: session.status,
      selectedMealId: session.selected_meal_id,
      mealCount: session.meal_count,
      participantCount: session.participant_count,
      createdAt: session.created_at,
      closedAt: session.closed_at,
    })));
  } catch (error) {
    console.error('Get sessions error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/sessions - Create session with meal IDs
router.post('/', (req, res) => {
  try {
    const { mealIds } = req.body as CreateSessionRequest;

    if (!mealIds || mealIds.length === 0) {
      res.status(400).json({ error: 'At least one meal is required' });
      return;
    }

    // Verify all meals belong to this host and are not archived
    const meals = getAll<Meal>(
      `SELECT id FROM meals WHERE id IN (${mealIds.map(() => '?').join(',')}) AND host_id = ? AND archived = 0`,
      [...mealIds, req.session.hostId]
    );

    if (meals.length !== mealIds.length) {
      res.status(400).json({ error: 'Some meals are invalid or not accessible' });
      return;
    }

    // Generate unique invite code
    let inviteCode = generateInviteCode();
    let attempts = 0;
    while (getOne<Session>('SELECT id FROM sessions WHERE invite_code = ?', [inviteCode])) {
      inviteCode = generateInviteCode();
      attempts++;
      if (attempts > 10) {
        res.status(500).json({ error: 'Failed to generate unique invite code' });
        return;
      }
    }

    // Create session
    const sessionId = uuidv4();
    runQuery(
      'INSERT INTO sessions (id, host_id, invite_code) VALUES (?, ?, ?)',
      [sessionId, req.session.hostId, inviteCode]
    );

    // Create session_meals entries with randomized order
    const shuffledMealIds = [...mealIds].sort(() => Math.random() - 0.5);
    shuffledMealIds.forEach((mealId, index) => {
      runQuery(
        'INSERT INTO session_meals (id, session_id, meal_id, display_order) VALUES (?, ?, ?, ?)',
        [uuidv4(), sessionId, mealId, index]
      );
    });

    res.status(201).json({
      id: sessionId,
      inviteCode,
      status: 'open',
      mealCount: mealIds.length,
    });
  } catch (error) {
    console.error('Create session error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/sessions/:id - Get session details (host view)
router.get('/:id', (req, res) => {
  try {
    const { id } = req.params;

    const session = getOne<Session>(
      'SELECT * FROM sessions WHERE id = ? AND host_id = ?',
      [id, req.session.hostId]
    );

    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    // Get meals in this session
    const meals = getAll<Meal & { display_order: number }>(
      `SELECT m.*, sm.display_order
       FROM meals m
       JOIN session_meals sm ON m.id = sm.meal_id
       WHERE sm.session_id = ?
       ORDER BY sm.display_order`,
      [id]
    );

    // Get participants
    const participants = getAll<Participant>(
      `SELECT id, display_name, submitted, created_at
       FROM participants
       WHERE session_id = ?
       ORDER BY created_at`,
      [id]
    );

    // Calculate results if session is closed
    let results = null;
    if (session.status === 'closed') {
      results = calculateResults(id, true); // Include voter details for host
    }

    res.json({
      id: session.id,
      inviteCode: session.invite_code,
      status: session.status,
      selectedMealId: session.selected_meal_id,
      createdAt: session.created_at,
      closedAt: session.closed_at,
      meals: meals.map(m => ({
        id: m.id,
        title: m.title,
        description: m.description,
      })),
      participants: participants.map(p => ({
        id: p.id,
        displayName: p.display_name,
        submitted: p.submitted === 1,
        createdAt: p.created_at,
      })),
      results,
    });
  } catch (error) {
    console.error('Get session error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/sessions/:id/close - Close session
router.post('/:id/close', (req, res) => {
  try {
    const { id } = req.params;

    const session = getOne<Session>(
      'SELECT * FROM sessions WHERE id = ? AND host_id = ?',
      [id, req.session.hostId]
    );

    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    if (session.status === 'closed') {
      res.status(400).json({ error: 'Session is already closed' });
      return;
    }

    runQuery(
      'UPDATE sessions SET status = ?, closed_at = CURRENT_TIMESTAMP WHERE id = ?',
      ['closed', id]
    );

    // Calculate and return results
    const results = calculateResults(id, true);

    res.json({
      message: 'Session closed successfully',
      results,
    });
  } catch (error) {
    console.error('Close session error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/sessions/:id/select - Select final meal
router.post('/:id/select', (req, res) => {
  try {
    const { id } = req.params;
    const { mealId } = req.body;

    if (!mealId) {
      res.status(400).json({ error: 'Meal ID is required' });
      return;
    }

    const session = getOne<Session>(
      'SELECT * FROM sessions WHERE id = ? AND host_id = ?',
      [id, req.session.hostId]
    );

    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    if (session.status !== 'closed') {
      res.status(400).json({ error: 'Session must be closed before selecting a meal' });
      return;
    }

    // Verify meal is part of this session
    const sessionMeal = getOne(
      'SELECT id FROM session_meals WHERE session_id = ? AND meal_id = ?',
      [id, mealId]
    );

    if (!sessionMeal) {
      res.status(400).json({ error: 'Meal is not part of this session' });
      return;
    }

    // Update session with selected meal
    runQuery('UPDATE sessions SET selected_meal_id = ? WHERE id = ?', [mealId, id]);

    // Increment meal's pick count
    runQuery('UPDATE meals SET pick_count = pick_count + 1 WHERE id = ?', [mealId]);

    // Record in history
    runQuery(
      'INSERT OR REPLACE INTO session_history (id, session_id, selected_meal_id) VALUES (?, ?, ?)',
      [uuidv4(), id, mealId]
    );

    res.json({ message: 'Meal selected successfully' });
  } catch (error) {
    console.error('Select meal error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
