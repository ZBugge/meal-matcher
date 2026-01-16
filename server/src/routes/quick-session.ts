import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { runQuery, getOne } from '../db/schema.js';
import { QuickSessionRequest, Session, Participant } from '../types.js';

const router = Router();

// Generate a unique 6-character invite code
function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No ambiguous chars
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// POST /api/quick-session - Create a quick session without authentication
router.post('/', async (req: Request, res: Response) => {
  try {
    const { creatorName, meals } = req.body as QuickSessionRequest;

    if (!creatorName || !meals || meals.length === 0) {
      res.status(400).json({ error: 'Creator name and at least one meal required' });
      return;
    }

    // Generate a unique creator token for anonymous sessions
    const creatorToken = crypto.randomBytes(32).toString('hex');
    const isAuthenticated = !!req.session.hostId;

    // For anonymous users, use a placeholder host_id (we'll use the creator token)
    // For authenticated users, use their actual host_id
    const hostId = isAuthenticated ? req.session.hostId : `temp_${creatorToken}`;

    // Create session
    const sessionId = uuidv4();
    const inviteCode = generateInviteCode();

    runQuery(
      `INSERT INTO sessions (id, host_id, invite_code, status, created_at)
       VALUES (?, ?, ?, 'open', datetime('now'))`,
      [sessionId, hostId, inviteCode]
    );

    // Create temporary meals and add to session
    const mealIds: string[] = [];
    for (let i = 0; i < meals.length; i++) {
      const mealId = uuidv4();
      const meal = meals[i];

      runQuery(
        `INSERT INTO meals (id, host_id, title, description, type, temporary, creator_token, created_at)
         VALUES (?, ?, ?, ?, 'meal', 1, ?, datetime('now'))`,
        [mealId, hostId, meal.title, meal.description || null, creatorToken]
      );

      // Add to session_meals
      const sessionMealId = uuidv4();
      runQuery(
        `INSERT INTO session_meals (id, session_id, meal_id, display_order)
         VALUES (?, ?, ?, ?)`,
        [sessionMealId, sessionId, mealId, i]
      );

      mealIds.push(mealId);
    }

    // Auto-join creator as participant
    const participantId = uuidv4();
    runQuery(
      `INSERT INTO participants (id, session_id, display_name, host_id, submitted, created_at)
       VALUES (?, ?, ?, ?, 0, datetime('now'))`,
      [participantId, sessionId, creatorName, isAuthenticated ? hostId : null]
    );

    // Get the created session
    const session = getOne<Session>(
      'SELECT * FROM sessions WHERE id = ?',
      [sessionId]
    );

    res.json({
      session,
      participantId,
      creatorToken: isAuthenticated ? null : creatorToken,
      mealIds
    });
  } catch (error) {
    console.error('Error creating quick session:', error);
    res.status(500).json({ error: 'Failed to create quick session' });
  }
});

export default router;
