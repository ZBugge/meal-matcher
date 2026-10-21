import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { runQuery, getOne, getAll, Mutation, libraryRevision, ConflictError } from '../db/schema';
import { Session, Meal, Participant, CreateSessionRequest } from '../types';
import { requireAuth } from '../middleware/auth';
import { calculateResults } from '../services/matching';
import { isSessionMode, mealTypeForMode } from '../services/food-options';
import { commitSessionCreation, InviteCodeExhaustedError } from '../services/session-creation';
import { operation, completedOperation, commitOperation, OperationConflictError } from '../services/operation-receipts';
const router = Router();
// All session routes require authentication
router.use(requireAuth);
// GET /api/sessions - List host's sessions
router.get('/', async (req, res) => {
    try {
        const sessions = await getAll<Session & {
            meal_count: number;
            participant_count: number;
            selected_meal_title: string | null;
            selected_meal_type: Meal['type'] | null;
        }>(`SELECT
        s.*,
        selected_meal.title as selected_meal_title,
        selected_meal.type as selected_meal_type,
        (SELECT COUNT(*) FROM session_meals WHERE session_id = s.id) as meal_count,
        (SELECT COUNT(*) FROM participants WHERE session_id = s.id) as participant_count
      FROM sessions s
      LEFT JOIN meals selected_meal ON selected_meal.id = s.selected_meal_id
      WHERE s.host_id = ?
      ORDER BY s.created_at DESC`, [req.session.hostId]);
        res.json(sessions.map(session => ({
            id: session.id,
            inviteCode: session.invite_code,
            status: session.status,
            mode: session.mode,
            selectedMealId: session.selected_meal_id,
            selectedMeal: session.selected_meal_id && session.selected_meal_title && session.selected_meal_type
                ? {
                    id: session.selected_meal_id,
                    title: session.selected_meal_title,
                    type: session.selected_meal_type,
                }
                : null,
            mealCount: session.meal_count,
            participantCount: session.participant_count,
            createdAt: session.created_at,
            closedAt: session.closed_at,
        })));
    }
    catch (error) {
        if (error instanceof ConflictError) {
            res.status(409).json({ error: error.message });
            return;
        }
        console.error('Get sessions error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// POST /api/sessions - Create session with meal IDs
router.post('/', async (req, res) => {
    try {
        const key = req.get('Idempotency-Key');
        if (key && !/^[A-Za-z0-9_-]{20,100}$/.test(key)) { res.status(400).json({ error: 'Use an Idempotency-Key of 20 to 100 letters, digits, underscores or hyphens.' }); return; }
        const op = key ? operation(req.session.hostId!, key, 'POST /api/sessions', req.body) : undefined;
        if (op) {
            const accepted = await completedOperation(op);
            if (accepted?.kind === 'json') { res.status(accepted.status).json(accepted.value); return; }
        }
        const { mealIds, mode = 'home' } = req.body as CreateSessionRequest;
        if (!mealIds || mealIds.length === 0) {
            res.status(400).json({ error: 'At least one option is required' });
            return;
        }
        if (new Set(mealIds).size !== mealIds.length) {
            res.status(400).json({ error: 'Option IDs must be unique' });
            return;
        }
        if (!isSessionMode(mode)) {
            res.status(400).json({ error: 'Mode must be home or takeout' });
            return;
        }
        const expectedType = mealTypeForMode(mode);
        const revision = await libraryRevision(req.session.hostId!);
        // Verify all meals belong to this host and are not archived
        const meals = await getAll<Meal>(`SELECT id FROM meals
       WHERE id IN (SELECT value FROM json_each(?))
         AND host_id = ? AND archived = 0 AND type = ?`, [JSON.stringify(mealIds), req.session.hostId, expectedType]);
        if (meals.length !== mealIds.length) {
            res.status(400).json({ error: 'Some options are invalid, inaccessible, or do not match the session mode' });
            return;
        }
        const sessionId=uuidv4();
        const shuffled=[...mealIds].sort(()=>Math.random()-.5);
        const response = (code: string) => ({ id: sessionId, inviteCode: code, status: 'open', mode, mealCount: mealIds.length });
        const inviteCode=await commitSessionCreation(code=>{
        const database=new Mutation();
        database.library(req.session.hostId!, revision);
        database.assert(`(SELECT COUNT(*) FROM meals WHERE id IN (SELECT value FROM json_each(?)) AND host_id = ? AND archived = 0 AND type = ?) = ?`, [JSON.stringify(mealIds), req.session.hostId, expectedType, mealIds.length]);
        database.run('INSERT INTO sessions(id,host_id,invite_code,mode) VALUES (?,?,?,?)', [sessionId, req.session.hostId, code, mode]);
        database.run('INSERT INTO session_meals(id,session_id,meal_id,display_order) SELECT lower(hex(randomblob(16))), ?, value, CAST(key AS INTEGER) FROM json_each(?)', [sessionId, JSON.stringify(shuffled)]);
        return database;
        }, undefined, (batch, code) => commitOperation(batch, op, { kind: 'json', value: response(code), status: 201 }));
        res.status(201).json(op?.completed?.kind === 'json' ? op.completed.value : response(inviteCode));
    }
    catch (error) {
        if (error instanceof ConflictError) {
            res.status(409).json({ error: error.message });
            return;
        }
        if(error instanceof OperationConflictError){res.status(409).json({error:error.message});return;}
        if(error instanceof InviteCodeExhaustedError){res.status(500).json({error:error.message});return;}
        console.error('Create session error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// GET /api/sessions/:id - Get session details (host view)
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const session = await getOne<Session>('SELECT * FROM sessions WHERE id = ? AND host_id = ?', [id, req.session.hostId]);
        if (!session) {
            res.status(404).json({ error: 'Session not found' });
            return;
        }
        // Get meals in this session
        const meals = await getAll<Meal & {
            display_order: number;
        }>(`SELECT m.*, sm.display_order
       FROM meals m
       JOIN session_meals sm ON m.id = sm.meal_id
       WHERE sm.session_id = ?
       ORDER BY sm.display_order`, [id]);
        // Get participants
        const participants = await getAll<Participant>(`SELECT id, display_name, submitted, created_at
       FROM participants
       WHERE session_id = ?
       ORDER BY created_at`, [id]);
        // Calculate results if session is closed
        let results = null;
        if (session.status === 'closed') {
            results = await calculateResults(id, true); // Include voter details for host
        }
        res.json({
            id: session.id,
            inviteCode: session.invite_code,
            status: session.status,
            mode: session.mode,
            selectedMealId: session.selected_meal_id,
            createdAt: session.created_at,
            closedAt: session.closed_at,
            meals: meals.map(m => ({
                id: m.id,
                title: m.title,
                description: m.description,
                type: m.type,
            })),
            participants: participants.map(p => ({
                id: p.id,
                displayName: p.display_name,
                submitted: p.submitted === 1,
                createdAt: p.created_at,
            })),
            results,
        });
    }
    catch (error) {
        if (error instanceof ConflictError) {
            res.status(409).json({ error: error.message });
            return;
        }
        console.error('Get session error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// POST /api/sessions/:id/close - Close session
router.post('/:id/close', async (req, res) => {
    try {
        const { id } = req.params;
        const { creatorToken } = req.body;
        // Check if user is authenticated OR has a valid creator token
        let session: Session | undefined;
        if (req.session.hostId) {
            // Authenticated user
            session = await getOne<Session>('SELECT * FROM sessions WHERE id = ? AND host_id = ?', [id, req.session.hostId]);
        }
        else if (creatorToken) {
            // Anonymous creator with token
            session = await getOne<Session>('SELECT * FROM sessions WHERE id = ?', [id]);
            // Verify the creator token matches any meal in this session
            if (session) {
                const mealWithToken = await getOne<{
                    id: string;
                }>(`SELECT m.id FROM meals m
           JOIN session_meals sm ON m.id = sm.meal_id
           WHERE sm.session_id = ? AND m.creator_token = ?
           LIMIT 1`, [id, creatorToken]);
                if (!mealWithToken) {
                    session = undefined; // Invalid token
                }
            }
        }
        if (!session) {
            res.status(404).json({ error: 'Session not found or unauthorized' });
            return;
        }
        if (session.status === 'closed') {
            res.status(400).json({ error: 'Session is already closed' });
            return;
        }
        const close = await runQuery("UPDATE sessions SET status = 'closed', closed_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'open' AND host_id = ?", [id, req.session.hostId]);
        if (!close.meta.changes) {
            res.status(400).json({ error: 'Session is already closed' });
            return;
        }
        // Calculate and return results
        const results = await calculateResults(id, true);
        res.json({
            message: 'Session closed successfully',
            results,
        });
    }
    catch (error) {
        if (error instanceof ConflictError) {
            res.status(409).json({ error: error.message });
            return;
        }
        console.error('Close session error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// POST /api/sessions/:id/select - Select final meal
router.post('/:id/select', async (req, res) => {
    try {
        const { id } = req.params;
        const { mealId } = req.body;
        if (!mealId) {
            res.status(400).json({ error: 'Meal ID is required' });
            return;
        }
        const session = await getOne<Session>('SELECT * FROM sessions WHERE id = ? AND host_id = ?', [id, req.session.hostId]);
        if (!session) {
            res.status(404).json({ error: 'Session not found' });
            return;
        }
        if (session.status !== 'closed') {
            res.status(400).json({ error: 'Session must be closed before selecting a meal' });
            return;
        }
        if (session.selected_meal_id) {
            if (session.selected_meal_id === mealId) {
                res.json({ message: 'Meal selected successfully' });
                return;
            }
            res.status(409).json({ error: 'A final meal has already been selected for this session' });
            return;
        }
        // Verify meal is part of this session
        const sessionMeal = await getOne('SELECT id FROM session_meals WHERE session_id = ? AND meal_id = ?', [id, mealId]);
        if (!sessionMeal) {
            res.status(400).json({ error: 'Meal is not part of this session' });
            return;
        }
        const database = new Mutation();
        database.run(`INSERT INTO session_history(id,session_id,selected_meal_id) SELECT ?, s.id, ? FROM sessions s WHERE s.id = ? AND s.host_id = ? AND s.status = 'closed' AND s.selected_meal_id IS NULL AND EXISTS(SELECT 1 FROM session_meals WHERE session_id = s.id AND meal_id = ?) ON CONFLICT(session_id) DO NOTHING`, [uuidv4(), mealId, id, req.session.hostId, mealId]);
        database.run(`UPDATE meals SET pick_count = pick_count + 1 WHERE id = ? AND EXISTS(SELECT 1 FROM session_history h JOIN sessions s ON h.session_id=s.id WHERE s.id=? AND h.selected_meal_id = ? AND s.selected_meal_id IS NULL)`, [mealId, id, mealId]);
        database.run(`UPDATE sessions SET selected_meal_id = (SELECT selected_meal_id FROM session_history WHERE session_id = sessions.id) WHERE id = ? AND selected_meal_id IS NULL`, [id]);
        await database.commit();
        const selected = await getOne<Session>('SELECT selected_meal_id FROM sessions WHERE id=?', [id]);
        if (selected?.selected_meal_id !== mealId) {
            res.status(409).json({ error: 'A final meal has already been selected for this session' });
            return;
        }
        res.json({ message: 'Meal selected successfully' });
    }
    catch (error) {
        if (error instanceof ConflictError) {
            res.status(409).json({ error: error.message });
            return;
        }
        console.error('Select meal error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
export default router;
