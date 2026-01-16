import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { runQuery, getOne, getAll } from '../db/schema';
import { Session, Meal, Participant, JoinSessionRequest, SubmitSwipesRequest } from '../types';
import { calculateResults } from '../services/matching';

const router = Router();

// GET /api/join/:inviteCode - Get session for swiping (public)
router.get('/join/:inviteCode', (req, res) => {
  try {
    const { inviteCode } = req.params;

    const session = getOne<Session>(
      'SELECT * FROM sessions WHERE invite_code = ?',
      [inviteCode.toUpperCase()]
    );

    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    if (session.status === 'closed') {
      res.status(400).json({ error: 'This session has ended', sessionClosed: true });
      return;
    }

    // Get participant count
    const participantCount = getOne<{ count: number }>(
      'SELECT COUNT(*) as count FROM participants WHERE session_id = ?',
      [session.id]
    );

    res.json({
      id: session.id,
      status: session.status,
      participantCount: participantCount?.count || 0,
    });
  } catch (error) {
    console.error('Get join session error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/join/:inviteCode - Join session with display name
router.post('/join/:inviteCode', (req, res) => {
  try {
    const { inviteCode } = req.params;
    const { displayName } = req.body as JoinSessionRequest;

    if (!displayName || displayName.trim().length === 0) {
      res.status(400).json({ error: 'Display name is required' });
      return;
    }

    const session = getOne<Session>(
      'SELECT * FROM sessions WHERE invite_code = ?',
      [inviteCode.toUpperCase()]
    );

    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    if (session.status === 'closed') {
      res.status(400).json({ error: 'This session has ended' });
      return;
    }

    // Create participant
    const participantId = uuidv4();
    runQuery(
      'INSERT INTO participants (id, session_id, display_name, host_id) VALUES (?, ?, ?, ?)',
      [participantId, session.id, displayName.trim(), req.session.hostId || null]
    );

    // Get meals for this session (randomized order for this participant)
    const meals = getAll<Meal & { session_meal_id: string }>(
      `SELECT m.id, m.title, m.description, sm.id as session_meal_id
       FROM meals m
       JOIN session_meals sm ON m.id = sm.meal_id
       WHERE sm.session_id = ?`,
      [session.id]
    );

    // Shuffle meals for this participant
    const shuffledMeals = [...meals].sort(() => Math.random() - 0.5);

    res.status(201).json({
      participantId,
      sessionId: session.id,
      meals: shuffledMeals.map(m => ({
        id: m.id,
        title: m.title,
        description: m.description,
        sessionMealId: m.session_meal_id,
      })),
    });
  } catch (error) {
    console.error('Join session error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/swipes/:sessionId - Submit all swipes
router.post('/swipes/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;
    const { participantId, swipes } = req.body as SubmitSwipesRequest;

    if (!participantId || !swipes || swipes.length === 0) {
      res.status(400).json({ error: 'Participant ID and swipes are required' });
      return;
    }

    // Verify participant exists and belongs to this session
    const participant = getOne<Participant>(
      'SELECT * FROM participants WHERE id = ? AND session_id = ?',
      [participantId, sessionId]
    );

    if (!participant) {
      res.status(404).json({ error: 'Participant not found' });
      return;
    }

    if (participant.submitted === 1) {
      res.status(400).json({ error: 'Swipes already submitted' });
      return;
    }

    // Verify session is still open
    const session = getOne<Session>('SELECT status FROM sessions WHERE id = ?', [sessionId]);
    if (!session || session.status === 'closed') {
      res.status(400).json({ error: 'This session has ended', sessionClosed: true });
      return;
    }

    // Get session_meal mappings
    const sessionMeals = getAll<{ id: string; meal_id: string }>(
      'SELECT id, meal_id FROM session_meals WHERE session_id = ?',
      [sessionId]
    );

    const mealToSessionMeal = new Map(sessionMeals.map(sm => [sm.meal_id, sm.id]));

    // Insert swipes
    for (const swipe of swipes) {
      const sessionMealId = mealToSessionMeal.get(swipe.mealId);
      if (!sessionMealId) {
        res.status(400).json({ error: `Invalid meal ID: ${swipe.mealId}` });
        return;
      }

      runQuery(
        'INSERT OR REPLACE INTO swipes (id, participant_id, session_meal_id, vote) VALUES (?, ?, ?, ?)',
        [uuidv4(), participantId, sessionMealId, swipe.vote ? 1 : 0]
      );
    }

    // Mark participant as submitted
    runQuery('UPDATE participants SET submitted = 1 WHERE id = ?', [participantId]);

    res.json({ message: 'Swipes submitted successfully' });
  } catch (error) {
    console.error('Submit swipes error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/results/:sessionId - Get results (after close)
router.get('/results/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;
    const isHost = req.query.host === 'true';

    const session = getOne<Session>('SELECT * FROM sessions WHERE id = ?', [sessionId]);

    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    // Check if requestor is the host
    const requestorIsHost = req.session.hostId === session.host_id;

    if (session.status !== 'closed') {
      res.json({
        status: 'waiting',
        message: 'Session is still open. Results will be available after the host closes it.',
      });
      return;
    }

    // Calculate results (include voters only for host)
    const results = calculateResults(sessionId, requestorIsHost && isHost);

    // Get selected meal info if any
    let selectedMeal = null;
    if (session.selected_meal_id) {
      const meal = getOne<Meal>('SELECT id, title, description FROM meals WHERE id = ?', [session.selected_meal_id]);
      if (meal) {
        selectedMeal = {
          id: meal.id,
          title: meal.title,
          description: meal.description,
        };
      }
    }

    res.json({
      status: 'closed',
      results,
      selectedMeal,
      isHost: requestorIsHost,
    });
  } catch (error) {
    console.error('Get results error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/close-session/:sessionId - Close session with creator token (no auth required)
router.post('/close-session/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;
    const { creatorToken } = req.body;

    if (!creatorToken) {
      res.status(400).json({ error: 'Creator token is required' });
      return;
    }

    // Get the session
    const session = getOne<Session>(
      'SELECT * FROM sessions WHERE id = ?',
      [sessionId]
    );

    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    // Verify the creator token matches any meal in this session
    const mealWithToken = getOne<{ id: string }>(
      `SELECT m.id FROM meals m
       JOIN session_meals sm ON m.id = sm.meal_id
       WHERE sm.session_id = ? AND m.creator_token = ?
       LIMIT 1`,
      [sessionId, creatorToken]
    );

    if (!mealWithToken) {
      res.status(403).json({ error: 'Invalid creator token' });
      return;
    }

    if (session.status === 'closed') {
      res.status(400).json({ error: 'Session is already closed' });
      return;
    }

    runQuery(
      'UPDATE sessions SET status = ?, closed_at = CURRENT_TIMESTAMP WHERE id = ?',
      ['closed', sessionId]
    );

    // Calculate and return results
    const results = calculateResults(sessionId, true);

    res.json({
      message: 'Session closed successfully',
      results,
    });
  } catch (error) {
    console.error('Close session error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/session-status/:sessionId - Check session status (for polling)
router.get('/session-status/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;

    const session = getOne<Session>('SELECT status, selected_meal_id FROM sessions WHERE id = ?', [sessionId]);

    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    // Get participants with their status
    const participants = getAll<Participant>(
      `SELECT id, display_name, submitted, created_at
       FROM participants
       WHERE session_id = ?
       ORDER BY created_at`,
      [sessionId]
    );

    res.json({
      status: session.status,
      selectedMealId: session.selected_meal_id,
      participants: participants.map(p => ({
        id: p.id,
        displayName: p.display_name,
        submitted: p.submitted === 1,
      })),
    });
  } catch (error) {
    console.error('Get session status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
