import { RequestHandler } from 'express';
import { createHash } from 'node:crypto';
import { statement } from '../db/schema';
export const abuseGuard: RequestHandler = (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
        next();
        return;
    }
    const auth = req.path.startsWith('/api/auth/login') || req.path.startsWith('/api/auth/register');
    const ip = `ip:${req.headers['x-mealmatch-client-ip'] || 'unknown'}`;
    const targets: Array<{
        identity: string;
        maximum: number;
    }> = [{ identity: ip, maximum: auth ? 120 : 1200 }];
    if (auth && typeof req.body?.email === 'string')
        targets.push({ identity: `email:${req.body.email.trim().toLowerCase()}`, maximum: 20 });
    else if (req.session.hostId)
        targets.push({ identity: `account:${req.session.hostId}`, maximum: 600 });
    const window = Math.floor(Date.now() / 60000);
    Promise.all(targets.map(async (target) => {
        const key = createHash('sha256').update(`${auth ? 'auth' : 'write'}:${target.identity}`).digest('hex');
        const row = await statement(`INSERT INTO abuse_windows(key,window,count) VALUES (?,?,1) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN window=excluded.window THEN count+1 ELSE 1 END,window=excluded.window RETURNING count`, [key, window]).first<{
            count: number;
        }>();
        if (!row)
            throw new Error('Abuse counter unavailable');
        return row.count > target.maximum;
    })).then(limits => { if (limits.some(Boolean)) {
        res.status(429).json({ error: 'Too many requests. Try again shortly.' });
    }
    else
        next(); }, next);
};
