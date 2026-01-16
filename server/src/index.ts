import express from 'express';
import cors from 'cors';
import session from 'express-session';
import path from 'path';
import { initializeDatabase } from './db/schema';
import authRoutes from './routes/auth';
import mealsRoutes from './routes/meals';
import sessionsRoutes from './routes/sessions';
import swipesRoutes from './routes/swipes';
import quickSessionRoutes from './routes/quick-session';

declare module 'express-session' {
  interface SessionData {
    hostId?: string;
    participantId?: string;
  }
}

const app = express();
const PORT = process.env.PORT || 3000;

// Trust Railway's reverse proxy in production
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// Serve static files FIRST in production (before CORS)
const clientPath = path.join(__dirname, '../../client/dist');
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(clientPath));
}

// CORS only in development
if (process.env.NODE_ENV !== 'production') {
  app.use(cors({
    origin: ['http://localhost:5173'],
    credentials: true,
  }));
}

// Body parsers
app.use(express.json());

// Session middleware
const sessionSecret = process.env.SESSION_SECRET || 'dev-secret-change-in-production';
app.use(session({
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
  },
}));

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/meals', mealsRoutes);
app.use('/api/sessions', sessionsRoutes);
app.use('/api/quick-session', quickSessionRoutes);
app.use('/api', swipesRoutes);

// Health check endpoint
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// SPA fallback LAST in production
if (process.env.NODE_ENV === 'production') {
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientPath, 'index.html'));
  });
}

async function startServer() {
  // Initialize database
  await initializeDatabase();

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer().catch(console.error);

export default app;
