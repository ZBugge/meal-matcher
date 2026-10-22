const STORAGE = 'mealmatch:pending-mutations:v1';
const RETENTION = 30 * 86400000;
interface Pending { key: string; createdAt: number }
const pending = new Map<string, Pending>();

function load() {
  try {
    const saved: unknown = JSON.parse(sessionStorage.getItem(STORAGE) || '[]');
    if (!Array.isArray(saved)) return;
    for (const value of saved) {
      if (value && /^[a-f0-9]{64}$/.test(value.fingerprint) && typeof value.key === 'string'
        && /^[a-f0-9]{64}$/.test(value.key) && Number.isFinite(value.createdAt)
        && Date.now() - value.createdAt < RETENTION && !pending.has(value.fingerprint)) {
        pending.set(value.fingerprint, { key: value.key, createdAt: value.createdAt });
      }
    }
  } catch { /* Storage denial/corruption must not stop an ordinary save. */ }
}
function save() {
  try {
    sessionStorage.setItem(STORAGE, JSON.stringify([...pending].filter(([fingerprint]) => /^[a-f0-9]{64}$/.test(fingerprint)).map(([fingerprint, value]) => ({ fingerprint, ...value }))));
  } catch { /* In-memory keys still protect an explicit retry in this page. */ }
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => JSON.stringify(key) + ':' + canonical(item)).join(',') + '}';
  return JSON.stringify(value);
}
function randomKey() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), value => value.toString(16).padStart(2, '0')).join('');
}

// A failed acknowledgement retains the intent key. A successful second, identical
// action gets a fresh key, so deliberately adding the same dinner twice still works.
export async function operationAttempt(endpoint: string, options: RequestInit) {
  if ((options.method || 'GET').toUpperCase() !== 'POST' || (!/^\/plans\//.test(endpoint) && !['/sessions', '/quick-session'].includes(endpoint)) || typeof options.body !== 'string') return undefined;
  const explicit = new Headers(options.headers).get('Idempotency-Key');
  if (explicit) return { key: explicit, acknowledged() {} };
  let body: unknown;
  try { body = JSON.parse(options.body); } catch { return undefined; }
  const intent = 'POST ' + endpoint.split('?')[0] + '\n' + canonical(body);
  const fingerprint = crypto.subtle
    ? Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(intent))), value => value.toString(16).padStart(2, '0')).join('')
    : 'memory:' + intent;
  load();
  for (const [key, value] of pending) if (Date.now() - value.createdAt >= RETENTION) pending.delete(key);
  let operation = pending.get(fingerprint);
  if (!operation) { operation = { key: randomKey(), createdAt: Date.now() }; pending.set(fingerprint, operation); save(); }
  const key = operation.key;
  return { key, acknowledged() { if (pending.get(fingerprint)?.key === key) { pending.delete(fingerprint); save(); } } };
}

export function clearPendingOperations() {
  pending.clear();
  try { sessionStorage.removeItem(STORAGE); } catch { /* Storage may be disabled. */ }
}
