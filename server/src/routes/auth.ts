import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { runQuery, getOne } from '../db/schema';
import { Host, RegisterRequest, LoginRequest } from '../types';
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
    const existing = getOne<Host>('SELECT id FROM hosts WHERE email = ?', [email.toLowerCase()]);
    if (existing) {
      res.status(400).json({ error: 'Email already registered' });
      return;
    }

    // Hash password and create account
    const passwordHash = await bcrypt.hash(password, 10);
    const id = uuidv4();

    runQuery(
      'INSERT INTO hosts (id, email, password_hash) VALUES (?, ?, ?)',
      [id, email.toLowerCase(), passwordHash]
    );

    // Set session
    req.session.hostId = id;

    res.status(201).json({
      id,
      email: email.toLowerCase(),
    });
  } catch (error) {
    console.error('Register error:', error);
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
    const host = getOne<Host>(
      'SELECT id, email, password_hash FROM hosts WHERE email = ?',
      [email.toLowerCase()]
    );

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

    // Set session
    req.session.hostId = host.id;

    res.json({
      id: host.id,
      email: host.email,
    });
  } catch (error) {
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
router.get('/me', requireAuth, (req, res) => {
  try {
    const host = getOne<Host>(
      'SELECT id, email, created_at FROM hosts WHERE id = ?',
      [req.session.hostId]
    );

    if (!host) {
      res.status(404).json({ error: 'Host not found' });
      return;
    }

    res.json({
      id: host.id,
      email: host.email,
      createdAt: host.created_at,
    });
  } catch (error) {
    console.error('Get me error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
