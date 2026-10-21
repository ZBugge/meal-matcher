import express, { ErrorRequestHandler } from 'express';
import session from 'express-session';
import { RuntimeEnv, ConflictError, getAll } from './db/schema';
import authRoutes from './routes/auth';
import mealsRoutes from './routes/meals';
import notionRoutes from './routes/notion';
import plansRoutes from './routes/plans';
import sessionsRoutes from './routes/sessions';
import swipesRoutes from './routes/swipes';
import quickRoutes from './routes/quick-session';
import { SqliteSessionStore } from './services/sessionStore';
import { abuseGuard } from './middleware/abuse';
declare module 'express-session' {
    interface SessionData {
        hostId?: string;
        participantId?: string;
    }
}
export function createApp(env: RuntimeEnv) {
    if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32)
        throw new Error('SESSION_SECRET must contain at least 32 characters');
    const app = express();
    app.disable('x-powered-by');
    app.set('trust proxy', 1);
    app.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
    app.use('/api/meals/import', express.json({ limit: '5mb' }));
    app.use(express.json());
    app.use(session({ store: new SqliteSessionStore(), secret: env.SESSION_SECRET, resave: false, saveUninitialized: false, rolling: true, cookie: { httpOnly: true, secure: 'auto', sameSite: 'lax', maxAge: 30 * 86400000 } }));
    app.use((_req, res, next) => { const end = res.end; res.end = function (this: typeof res, ...args: Parameters<typeof end>) { if (!this.headersSent)
        this.removeHeader('Content-Length'); return end.apply(this, args); } as typeof end; next(); });
    app.use((req, res, next) => { if (req.session.hostId && !['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers.origin && req.headers.origin !== `${req.protocol}://${req.get('host')}`) {
        res.status(403).json({ error: 'Request origin is not allowed' });
        return;
    } next(); });
    app.use(abuseGuard);
    // Express 4 does not forward rejected async route handlers. Wrap each declared
    // handler before mounting without changing routing order or middleware contracts.
    for (const router of [authRoutes, mealsRoutes, notionRoutes, plansRoutes, sessionsRoutes, swipesRoutes, quickRoutes]) {
        for (const layer of (router as unknown as {
            stack: Array<{
                route?: {
                    stack: Array<{
                        handle: Function;
                    }>;
                };
            }>;
        }).stack) {
            for (const route of layer.route?.stack ?? []) {
                const handler = route.handle;
                route.handle = (req: unknown, res: unknown, next: (error?: unknown) => void) => { try {
                    Promise.resolve(handler(req, res, next)).catch(next);
                }
                catch (error) {
                    next(error);
                } };
            }
        }
    }
    app.use('/api/auth', authRoutes);
    app.use('/api/meals', mealsRoutes);
    app.use('/api/notion', notionRoutes);
    app.use('/api/plans', plansRoutes);
    app.use('/api/sessions', sessionsRoutes);
    app.use('/api/quick-session', quickRoutes);
    app.use('/api', swipesRoutes);
    app.get('/api/health', async (_req, res, next) => { try {
        await getAll('SELECT library_revision,plan_revision FROM hosts LIMIT 0');
        res.json({ status: 'ok' });
    }
    catch (error) {
        next(error);
    } });
    app.use((_req, res) => { res.status(404).json({ error: 'API route not found' }); });
    const errors: ErrorRequestHandler = (error, _req, res, _next) => { res.status(error instanceof ConflictError ? 409 : error.type === 'entity.too.large' ? 413 : error.type === 'entity.parse.failed' ? 400 : 500).json({ error: error instanceof ConflictError ? error.message : 'Request failed' }); };
    app.use(errors);
    return app;
}
