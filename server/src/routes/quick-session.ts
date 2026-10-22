import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { Mutation, storedText, libraryRevision, ConflictError } from '../db/schema.js';
import { QuickSessionRequest } from '../types.js';
import { hasDuplicateOptionTitles, isSessionMode, mealTypeForMode } from '../services/food-options.js';
import { commitSessionCreation, InviteCodeExhaustedError } from '../services/session-creation';
import { operation, anonymousQuickOperation, completedOperation, commitOperation, OperationConflictError } from '../services/operation-receipts';
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
        const key = req.get('Idempotency-Key');
        if (key && !/^[a-fA-F0-9]{64}$/.test(key)) { res.status(400).json({ error: 'Use a cryptographically random 32-byte hexadecimal Idempotency-Key.' }); return; }
        const op = key ? req.session.hostId ? operation(req.session.hostId, key, 'POST /api/quick-session', req.body) : anonymousQuickOperation(key, req.body) : undefined;
        if (op) {
            const accepted = await completedOperation(op);
            if (accepted?.kind === 'json') { res.status(accepted.status).json(accepted.value); return; }
        }
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
        // Anonymous sessions have nullable ownership; authenticated options remain host-owned.
        const hostId = isAuthenticated ? req.session.hostId : null;
        const revision = hostId ? await libraryRevision(hostId) : undefined;

        // Create session
        const sessionId = uuidv4();
        const optionType = mealTypeForMode(mode);
        const sessionMeals: Array<{
            id: string;
            title: string;
            description: string | null;
            type: string;
            sessionMealId: string;
        }> = [];
        const storedMeals: Record<string, unknown>[] = [];
        for (const [order, meal] of normalizedMeals.entries()) {
            const mealId = uuidv4(), sessionMealId = uuidv4();
            const description = mode === 'home' ? meal.description || null : null;
            storedMeals.push({ id: mealId, sessionMealId, order, title: await storedText(meal.title, hostId ?? creatorToken), description: await storedText(description, hostId ?? creatorToken) });
            sessionMeals.push({ id: mealId, title: meal.title, description, type: optionType, sessionMealId });
        }
        const encodedMeals = JSON.stringify(storedMeals);
        const participantId = uuidv4();
        const response = (code: string) => ({
            session: { id: sessionId, inviteCode: code, status: 'open', mode }, participantId,
            creatorToken: isAuthenticated ? null : creatorToken, meals: sessionMeals,
        });
        const inviteCode = await commitSessionCreation(code => {
        const database = new Mutation();
        if(hostId)database.library(hostId,revision!);
        database.run("INSERT INTO sessions(id,host_id,invite_code,status,mode) VALUES (?,?,?,'open',?)",[sessionId,hostId,code,mode]);
        database.run(`INSERT INTO meals(id,host_id,title,description,type,temporary,creator_token) SELECT json_extract(value,'$.id'),?,json_extract(value,'$.title'),json_extract(value,'$.description'),?,1,? FROM json_each(?)`, [hostId, optionType, creatorToken, encodedMeals]);
        database.run(`INSERT INTO session_meals(id,session_id,meal_id,display_order) SELECT json_extract(value,'$.sessionMealId'),?,json_extract(value,'$.id'),json_extract(value,'$.order') FROM json_each(?)`, [sessionId, encodedMeals]);
        // Auto-join creator as participant
        database.run(`INSERT INTO participants (id, session_id, display_name, host_id, submitted, created_at)
       VALUES (?, ?, ?, ?, 0, datetime('now'))`, [participantId, sessionId, creatorName, isAuthenticated ? hostId : null]);
        return database;
        }, generateInviteCode, (batch, code) => commitOperation(batch, op, { kind: 'json', value: response(code), status: 200 }));
        res.json(op?.completed?.kind === 'json' ? op.completed.value : response(inviteCode));
    }
    catch (error) {
        if (error instanceof ConflictError) {
            res.status(409).json({ error: error.message });
            return;
        }
        if(error instanceof OperationConflictError){res.status(409).json({error:error.message});return;}
        if(error instanceof InviteCodeExhaustedError){res.status(500).json({error:error.message});return;}
        console.error('Error creating quick session:', error);
        res.status(500).json({ error: 'Failed to create quick session' });
    }
});
export default router;
