import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { runQuery } from '../db/schema.js';
import { QuickSessionRequest } from '../types.js';
import { hasDuplicateOptionTitles, isSessionMode, mealTypeForMode } from '../services/food-options.js';

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
    const { creatorName, meals, mode = 'home' } = req.body as QuickSessionRequest;

    if (!creatorName || !meals || meals.length === 0) {
      res.status(400).json({ error: 'Creator name and at least one meal required' });
      return;
    }

    if (!isSessionMode(mode)) {
      res.status(400).json({ error: 'Mode must be home or takeout' });
      return;
    }

    const normalizedMeals = meals
      .map((meal) => ({
        title: meal.title?.trim(),
        description: meal.description?.trim(),
      }))
      .filter((meal) => meal.title);

    if (normalizedMeals.length === 0) {
      res.status(400).json({ error: 'At least one option is required' });
      return;
    }

    if (hasDuplicateOptionTitles(normalizedMeals.map((meal) => meal.title))) {
      res.status(400).json({ error: 'Option names must be unique within a session' });
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
      `INSERT INTO sessions (id, host_id, invite_code, status, mode, created_at)
       VALUES (?, ?, ?, 'open', ?, datetime('now'))`,
      [sessionId, hostId, inviteCode, mode]
    );

    // Create temporary meals and add to session
    const optionType = mealTypeForMode(mode);
    const sessionMeals: Array<{ id: string; title: string; description: string | null; type: string; sessionMealId: string }> = [];
    for (let i = 0; i < normalizedMeals.length; i++) {
      const mealId = uuidv4();
      const meal = normalizedMeals[i];
      const description = mode === 'home' ? meal.description || null : null;

      runQuery(
        `INSERT INTO meals (id, host_id, title, description, type, temporary, creator_token, created_at)
         VALUES (?, ?, ?, ?, ?, 1, ?, datetime('now'))`,
        [mealId, hostId, meal.title, description, optionType, creatorToken]
      );

      // Add to session_meals
      const sessionMealId = uuidv4();
      runQuery(
        `INSERT INTO session_meals (id, session_id, meal_id, display_order)
         VALUES (?, ?, ?, ?)`,
        [sessionMealId, sessionId, mealId, i]
      );

      sessionMeals.push({
        id: mealId,
        title: meal.title,
        description,
        type: optionType,
        sessionMealId
      });
    }

    // Auto-join creator as participant
    const participantId = uuidv4();
    runQuery(
      `INSERT INTO participants (id, session_id, display_name, host_id, submitted, created_at)
       VALUES (?, ?, ?, ?, 0, datetime('now'))`,
      [participantId, sessionId, creatorName, isAuthenticated ? hostId : null]
    );

    res.json({
      session: {
        id: sessionId,
        inviteCode,
        status: 'open',
        mode,
      },
      participantId,
      creatorToken: isAuthenticated ? null : creatorToken,
      meals: sessionMeals
    });
  } catch (error) {
    console.error('Error creating quick session:', error);
    res.status(500).json({ error: 'Failed to create quick session' });
  }
});

export default router;
