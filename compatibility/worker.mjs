// Synthetic local-only compatibility harness. Never deploy this diagnostic API.
import { env } from 'cloudflare:workers';
import { httpServerHandler } from 'cloudflare:node';
import { createDecipheriv } from 'node:crypto';
import express from '../server/node_modules/express/index.js';
import session from '../server/node_modules/express-session/index.js';
import bcrypt from '../server/node_modules/bcryptjs/index.js';

const asyncRoute = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
class ProofStore extends session.Store {
  get(id, callback) {
    env.DB.prepare('SELECT data FROM proof_sessions WHERE id=? AND expires>? AND revoked=0').bind(id, Date.now()).first()
      .then(row => row ? JSON.parse(row.data) : null).then(value => callback(null, value), callback);
  }
  set(id, value, callback = () => {}) {
    env.DB.prepare(`INSERT INTO proof_sessions(id,data,expires,revoked) VALUES (?,?,?,0)
      ON CONFLICT(id) DO UPDATE SET data=excluded.data,expires=excluded.expires WHERE proof_sessions.revoked=0`)
      .bind(id, JSON.stringify(value), Date.now() + 30 * 86400000).run().then(() => callback(), callback);
  }
  touch(id, value, callback = () => {}) {
    const expires = new Date(value.cookie.expires).getTime();
    env.DB.prepare('UPDATE proof_sessions SET expires=max(expires,?) WHERE id=? AND revoked=0 AND expires>? AND expires<?')
      .bind(expires, id, Date.now(), expires - 300000).run().then(() => callback(), callback);
  }
  destroy(id, callback = () => {}) {
    env.DB.prepare(`INSERT INTO proof_sessions(id,data,expires,revoked) VALUES (?,'{}',?,1)
      ON CONFLICT(id) DO UPDATE SET revoked=1,data='{}'`).bind(id, Date.now() + 30 * 86400000).run().then(() => callback(), callback);
  }
}
const app = express();
app.disable('x-powered-by');
// Worker fetch wrapper below replaces the forwarded protocol from actual URL.
app.set('trust proxy', 1);
app.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
app.use('/api/import', express.json({ limit: '5mb' }));
app.use(express.json());
app.use(session({ store: new ProofStore(), secret: 'synthetic-local-proof-secret-only-never-deploy', resave: false, saveUninitialized: false, rolling: true, cookie: { httpOnly: true, secure: 'auto', sameSite: 'lax', maxAge: 30 * 86400000 } }));
// express-session splits a known-length response to defer its final byte while
// touch/save completes. This adapter version drops that delayed byte. Streaming
// the complete body avoids that split while retaining awaited store completion.
app.use((_req, res, next) => {
  const end = res.end;
  res.end = function (chunk, encoding, callback) {
    if (!this.headersSent) this.removeHeader('Content-Length');
    return end.call(this, chunk, encoding, callback);
  };
  next();
});
app.post('/api/import', (req, res) => res.json({ length: req.body.text.length }));
app.post('/api/session', asyncRoute(async (req, res) => {
  await new Promise((resolve, reject) => req.session.regenerate(error => error ? reject(error) : resolve()));
  req.session.hostId = 'synthetic-host';
  await new Promise((resolve, reject) => req.session.save(error => error ? reject(error) : resolve()));
  res.json({ authenticated: true });
}));
app.get('/api/session', (req, res) => res.json({ authenticated: req.session.hostId === 'synthetic-host' }));
app.delete('/api/session', asyncRoute(async (req, res) => {
  await new Promise((resolve, reject) => req.session.destroy(error => error ? reject(error) : resolve()));
  res.clearCookie('connect.sid');
  res.json({ authenticated: false });
}));
app.post('/api/bcrypt', asyncRoute(async (req, res) => {
  const start = performance.now();
  const verified = await bcrypt.compare('synthetic-password', req.body.legacyHash);
  const created = await bcrypt.hash('synthetic-password', 10);
  res.json({ verified, createdUsable: await bcrypt.compare('synthetic-password', created), cost: bcrypt.getRounds(created), elapsedMs: performance.now() - start });
}));
app.post('/api/crypto', (req, res, next) => {
  try {
    const [, nonce, tag, encrypted] = req.body.ciphertext.split('.');
    const decipher = createDecipheriv('aes-256-gcm', Buffer.from(env.SYNTHETIC_KEY, 'base64'), Buffer.from(nonce, 'base64url'));
    decipher.setAAD(Buffer.from(`mealmatch:notion:v1:${req.body.hostId}`));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    const text = Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64url')), decipher.final()]).toString('utf8');
    res.json({ legacyCompatible: text === 'synthetic-token-only' });
  } catch { next(new Error('Synthetic decryption failed')); }
});
app.get('/api/error', asyncRoute(async () => { await Promise.resolve(); throw new Error('Synthetic async failure'); }));
app.use('/api', (_req, res) => res.status(404).json({ error: 'API route not found' }));
app.use((_req, res) => res.status(404).json({ error: 'API route not found' }));
app.use((error, _req, res, _next) => res.status(error.type === 'entity.too.large' ? 413 : error.type === 'entity.parse.failed' ? 400 : 500).json({ error: 'Request failed' }));
app.listen(3000);
const adapter = httpServerHandler({ port: 3000 });
export default {
  async fetch(request, bindings, ctx) {
    const url = new URL(request.url);
    if (url.pathname !== '/api' && !url.pathname.startsWith('/api/')) return bindings.ASSETS.fetch(request);
    const headers = new Headers(request.headers);
    headers.delete('forwarded');
    headers.set('x-forwarded-proto', url.protocol.slice(0, -1));
    return adapter.fetch(new Request(request, { headers }), bindings, ctx);
  },
};
