import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { runQuery, getOne } from '../db/schema';
import { Host, RegisterRequest, LoginRequest, UpdateHostPreferencesRequest } from '../types';
import { requireAuth } from '../middleware/auth';
const router = Router();
// POST /api/auth/register - Create host account
router.post('/register', async (req, res) => {
    try {
        const { email, password } = req.body as RegisterRequest;
        if (!email || !password) {
            res.status(400).json({ error: 'Email and password are required' });
            return;
        }
        if (password.length < 6) {
            res.status(400).json({ error: 'Password must be at least 6 characters' });
            return;
        }
        // Check if email already exists
        const existing = await getOne<Host>('SELECT id FROM hosts WHERE email = ?', [email.toLowerCase()]);
        if (existing) {
            res.status(400).json({ error: 'Email already registered' });
            return;
        }
        // Hash password and create account
        const passwordHash = await bcrypt.hash(password, 10);
        const id = uuidv4();
        await runQuery('INSERT INTO hosts (id, email, password_hash) VALUES (?, ?, ?)', [id, email.toLowerCase(), passwordHash]);
        // Rotate identifiers before granting authentication; persist before responding.
        await new Promise<void>((resolve, reject) => req.session.regenerate(error => error ? reject(error) : resolve()));
        req.session.hostId = id;
        await new Promise<void>((resolve, reject) => req.session.save(error => error ? reject(error) : resolve()));
        res.status(201).json({
            id,
            email: email.toLowerCase(),
            takeoutOnboardingDismissed: false,
        });
    }
    catch (error) {
        if (String(error).includes('UNIQUE constraint failed: hosts.email')) {
            res.status(400).json({ error: 'Email already registered' });
            return;
        }
        res.status(500).json({ error: 'Internal server error' });
    }
});
// POST /api/auth/login - Login host
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body as LoginRequest;
        if (!email || !password) {
            res.status(400).json({ error: 'Email and password are required' });
            return;
        }
        // Find host by email
        const host = await getOne<Host>('SELECT id, email, password_hash, takeout_onboarding_dismissed FROM hosts WHERE email = ?', [email.toLowerCase()]);
        if (!host) {
            res.status(401).json({ error: 'Invalid email or password' });
            return;
        }
        // Verify password
        const valid = await bcrypt.compare(password, host.password_hash);
        if (!valid) {
            res.status(401).json({ error: 'Invalid email or password' });
            return;
        }
        // Rotate identifiers before granting authentication; persist before responding.
        await new Promise<void>((resolve, reject) => req.session.regenerate(error => error ? reject(error) : resolve()));
        req.session.hostId = host.id;
        await new Promise<void>((resolve, reject) => req.session.save(error => error ? reject(error) : resolve()));
        res.json({
            id: host.id,
            email: host.email,
            takeoutOnboardingDismissed: Boolean(host.takeout_onboarding_dismissed),
        });
    }
    catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// POST /api/auth/logout - Logout host
router.post('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Logout error:', err);
            res.status(500).json({ error: 'Failed to logout' });
            return;
        }
        res.json({ message: 'Logged out successfully' });
    });
});
// GET /api/auth/me - Get current host
router.get('/me', requireAuth, async (req, res) => {
    try {
        const host = await getOne<Host>('SELECT id, email, created_at, takeout_onboarding_dismissed FROM hosts WHERE id = ?', [req.session.hostId]);
        if (!host) {
            res.status(404).json({ error: 'Host not found' });
            return;
        }
        res.json({
            id: host.id,
            email: host.email,
            createdAt: host.created_at,
            takeoutOnboardingDismissed: Boolean(host.takeout_onboarding_dismissed),
        });
    }
    catch (error) {
        console.error('Get me error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// PATCH /api/auth/preferences - Persist host-level UI preferences
router.patch('/preferences', requireAuth, async (req, res) => {
    try {
        const { takeoutOnboardingDismissed } = req.body as UpdateHostPreferencesRequest;
        if (typeof takeoutOnboardingDismissed !== 'boolean') {
            res.status(400).json({ error: 'takeoutOnboardingDismissed must be a boolean' });
            return;
        }
        await runQuery('UPDATE hosts SET takeout_onboarding_dismissed = ? WHERE id = ?', [takeoutOnboardingDismissed ? 1 : 0, req.session.hostId]);
        const host = await getOne<Host>('SELECT id, email, created_at, takeout_onboarding_dismissed FROM hosts WHERE id = ?', [req.session.hostId]);
        if (!host) {
            res.status(404).json({ error: 'Host not found' });
            return;
        }
        res.json({
            id: host.id,
            email: host.email,
            createdAt: host.created_at,
            takeoutOnboardingDismissed: Boolean(host.takeout_onboarding_dismissed),
        });
    }
    catch (error) {
        console.error('Update preferences error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
export default router;
