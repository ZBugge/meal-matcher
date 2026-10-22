import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { createServer } from 'node:http';
import { chromium, expect } from '@playwright/test';
import { startIsolatedTestWorker as startLocalWorker } from './test-state.mjs';
import { privateDirectory } from './local-paths.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));

// A real previous script is served at the same origin before updating to the
// current Worker asset. Browser request interception interferes with Chromium's
// offline navigation, so this fixture uses a loopback HTTP transport instead.
async function previousServiceWorkerOrigin(base, script) {
  let previous = true;
  const server = createServer(async (request, response) => {
    try {
      if (request.method !== 'GET') { response.writeHead(405); response.end(); return; }
      const url = new URL(request.url, base);
      if (url.pathname === '/sw.js' && previous) {
        response.writeHead(200, { 'content-type': 'application/javascript', 'cache-control': 'no-cache' });
        response.end(script.replace('mealmatch-public-v1', 'mealmatch-public-previous-fixture')); return;
      }
      const upstream = await fetch(url, { signal: AbortSignal.timeout(5000) });
      const headers = Object.fromEntries(upstream.headers);
      for (const name of ['connection', 'transfer-encoding', 'content-encoding', 'content-length']) delete headers[name];
      response.writeHead(upstream.status, headers);
      response.end(Buffer.from(await upstream.arrayBuffer()));
    } catch { response.writeHead(502); response.end(); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return { origin: `http://127.0.0.1:${server.address().port}`, update: () => { previous = false; }, close: async () => { server.closeAllConnections(); await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); } };
}

async function smoke() {
  const started = Date.now();
  const directory = path.join(root, '.verification', `production-${randomUUID()}`);
  await privateDirectory(root, path.dirname(directory));
  const secrets = { SESSION_SECRET: randomBytes(48).toString('base64'), NOTION_ENCRYPTION_KEY: randomBytes(32).toString('base64') };
  let active;
  try {
    active = await startLocalWorker({ directory, secrets });
    const base = new URL(active.url).origin;
    const port = Number(new URL(base).port);
    const html = await readFile(path.join(root, 'client/dist/index.html'), 'utf8');
    const assets = [...html.matchAll(/(?:src|href)=["']([^"']+\.(?:js|css)(?:\?[^"']*)?)["']/g)].map(match => match[1]);
    assert(assets.some(asset => asset.endsWith('.js')), 'Compiled client has no JavaScript asset');
    const request = (route, options = {}) => fetch(`${base}${route}`, { ...options, signal: AbortSignal.timeout(3000) });
    const deadline = Date.now() + 15_000;
    while (true) {
      try {
        const health = await request('/api/health');
        if (health.ok && (await health.json()).status === 'ok') break;
      } catch { /* The newly started process may not be listening yet. */ }
      assert(Date.now() < deadline, 'Compiled production server readiness timed out');
      await delay(50);
    }
    for (const route of ['/', '/week', '/shopping', '/recipes', '/join/SMOKE2', '/results/production-smoke']) {
      const response = await request(route);
      assert.equal(response.status, 200, `SPA route failed: ${route}`);
      assert.match(response.headers.get('content-type') ?? '', /text\/html/, 'SPA response must be HTML');
      assert.equal(await response.text(), html, `SPA route did not serve compiled index: ${route}`);
    }
    for (const asset of assets) {
      const url = new URL(asset, `${base}/`);
      assert.equal(url.origin, base, 'Compiled assets must be served by this production process');
      const response = await request(url.pathname + url.search);
      assert.equal(response.status, 200, 'Compiled asset request failed');
      assert.match(response.headers.get('content-type') ?? '', asset.includes('.css') ? /text\/css/ : /javascript/, 'Wrong compiled asset content type');
      assert((await response.arrayBuffer()).byteLength > 0, 'Compiled asset is empty');
      assert.match(response.headers.get('cache-control') ?? '', /immutable/, 'Fingerprint asset cache policy missing');
    }
    for (const route of ['/api', '/api/does-not-exist']) {
      const response = await request(route, { headers: { Accept: 'text/html', 'Sec-Fetch-Mode': 'navigate' } });
      assert.equal(response.status, 404);
      assert.match(response.headers.get('content-type') ?? '', /application\/json/);
      assert.equal(response.headers.get('cache-control'), 'no-store');
    }
    const json = async (route, body, status = 200, headers = {}) => {
      const response = await request(route, body === undefined ? { headers } : {
        method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body),
      });
      assert.equal(response.status, status, `Unexpected production API status for ${route.split('?')[0]}`);
      assert.match(response.headers.get('content-type') ?? '', /application\/json/, 'Production API must return JSON');
      return response.json();
    };
    const created = await json('/api/quick-session', { creatorName: 'Smoke creator', mode: 'takeout', meals: [{ title: 'Thai' }, { title: 'Pizza' }] });
    assert.equal(created.session.mode, 'takeout');
    assert.equal(created.meals.length, 2);
    assert.equal(typeof created.creatorToken, 'string');
    assert(created.creatorToken.length >= 32, 'Anonymous creator credential missing');
    const joined = await json(`/api/join/${created.session.inviteCode}`, { displayName: 'Smoke guest' }, 201);
    assert.equal(joined.sessionId, created.session.id);
    assert.notEqual(joined.participantId, created.participantId);
    assert.deepEqual(joined.meals.map(meal => meal.id).sort(), created.meals.map(meal => meal.id).sort());
    const sessionId = created.session.id;
    for (const [participantId, votes] of [[created.participantId, [1, 0]], [joined.participantId, [2, 1]]]) {
      await json(`/api/swipes/${sessionId}`, { participantId, swipes: created.meals.map((meal, index) => ({ mealId: meal.id, vote: votes[index] })) });
    }
    const progress = await json(`/api/session-status/${sessionId}`);
    assert.equal(progress.participants.length, 2);
    assert(progress.participants.every(participant => participant.submitted === true), 'Production votes were not submitted');
    const closed = await json(`/api/close-session/${sessionId}`, { creatorToken: created.creatorToken });
    assert(closed.results.every(option => !('voters' in option)), 'Anonymous close response leaked voter identities');
    const result = await json(`/api/results/${sessionId}?host=true`);
    assert.equal(result.status, 'closed');
    assert.equal(result.isHost, false);
    assert.deepEqual(result.results.map(option => ({ title: option.title, yes: option.yesCount, maybe: option.maybeCount, total: option.totalVotes, percent: option.percentage })), [
      { title: 'Thai', yes: 1, maybe: 1, total: 2, percent: 100 },
      { title: 'Pizza', yes: 1, maybe: 0, total: 2, percent: 50 },
    ]);
    assert(result.results.every(option => !('voters' in option)), 'Public production results leaked voter identities');
    await json(`/api/swipes/${sessionId}`, { participantId: joined.participantId, swipes: [{ mealId: created.meals[0].id, vote: 0 }] }, 400);

    // Dispatch the actual HTTPS Request URL. This proves protocol/cookie behavior,
    // not hosted TLS; client-controlled forwarded headers must not grant trust.
    const secureRequest = (route, options = {}) => active.runtime.dispatchFetch(`https://127.0.0.1:${port}${route}`, options);
    const registration = await secureRequest('/api/auth/register', {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-proto': 'http' },
      body: JSON.stringify({ email: 'production-smoke@example.test', password: randomUUID() }),
    });
    assert.equal(registration.status, 201, 'Production proxy registration failed');
    const cookie = registration.headers.get('set-cookie');
    assert(cookie, 'HTTPS proxy did not receive a session cookie');
    for (const attribute of [/;\s*Secure(?:;|$)/i, /;\s*HttpOnly(?:;|$)/i, /;\s*SameSite=Lax(?:;|$)/i]) {
      assert(attribute.test(cookie), 'Production session cookie lacks a required security attribute');
    }
    const accountResponse = await secureRequest('/api/auth/me', { headers: { cookie: cookie.split(';')[0] } });
    assert.equal(accountResponse.status, 200);
    const account = await accountResponse.json();
    assert.equal(account.email, 'production-smoke@example.test', 'Production session cookie did not authenticate');
    await active.runtime.dispose();
    active = await startLocalWorker({ directory, secrets, port, migrate: false });
    const restartDeadline = Date.now() + 15000;
    while (true) {
      try { const health = await request('/api/health'); if (health.ok) break; } catch { /* starting */ }
      assert(Date.now() < restartDeadline, 'Production restart timed out');
      await delay(50);
    }
    const resumedResponse = await secureRequest('/api/auth/me', { headers: { cookie: cookie.split(';')[0] } });
    assert.equal(resumedResponse.status, 200);
    const resumed = await resumedResponse.json();
    assert.equal(resumed.email, 'production-smoke@example.test', 'Family login was lost after server restart');
    assert.equal((await json(`/api/results/${sessionId}`)).status, 'closed', 'Accepted voting data lost after Worker restart');
    const manifest = await (await request('/manifest.webmanifest')).json();
    assert.equal(manifest.display, 'standalone');
    assert.equal(manifest.start_url, '/week');
    for (const icon of manifest.icons) {
      const response = await request(icon.src);
      assert.equal(response.status, 200);
      assert.match(response.headers.get('content-type') ?? '', /image\/png/);
    }
    const browser = await chromium.launch({ headless: true });
    let pwa;
    try {
      const context = await browser.newContext();
      const serviceWorker = await readFile(path.join(root, 'client/dist/sw.js'), 'utf8');
      assert(serviceWorker.includes('mealmatch-public-v1'));
      pwa = await previousServiceWorkerOrigin(base, serviceWorker);
      const page = await context.newPage();
      await page.goto(`${pwa.origin}/quick`);
      await page.waitForFunction(() => !!navigator.serviceWorker.controller, undefined, { timeout: 10000 });
      assert(await page.evaluate(() => caches.has('mealmatch-public-previous-fixture')), 'Previous service worker fixture did not install');
      pwa.update();
      await page.evaluate(async () => { const registration = await navigator.serviceWorker.getRegistration(); await registration.update(); });
      await expect.poll(() => page.evaluate(async () => (await caches.has('mealmatch-public-v1')) && !(await caches.has('mealmatch-public-previous-fixture'))), { timeout: 10000 }).toBe(true);
      await expect.poll(() => page.evaluate(async () => {
        const registration = await navigator.serviceWorker.getRegistration();
        return registration?.active?.state === 'activated' && navigator.serviceWorker.controller === registration.active && !!(await caches.match('/offline.html'));
      }), { timeout: 10000 }).toBe(true);
      const privateCached = await page.evaluate(async () => {
        const keys = await caches.keys();
        const urls = (await Promise.all(keys.map(async key => (await (await caches.open(key)).keys()).map(request => request.url)))).flat();
        return urls.some(url => { const pathname = new URL(url).pathname; return pathname === '/api' || pathname.startsWith('/api/'); });
      });
      assert.equal(privateCached, false, 'Service worker cached private API data');
      await context.setOffline(true);
      assert(await page.evaluate(async () => { try { await fetch('/api', { headers: { Accept: 'text/html' } }); return false; } catch { return true; } }), 'Offline API navigation received HTML instead of a network failure');
      await page.goto(`${pwa.origin}/week`);
      assert.match(await page.locator('h1').innerText(), /connection away/);
    } finally { await browser.close(); if (pwa) await pwa.close(); }
    return { success: true, runtime: 'Worker/StaticAssets/D1', hostedTlsVerified: false, elapsedMs: Date.now() - started, checks: ['compiled-spa', 'compiled-assets', 'anonymous-lifecycle', 'public-results', 'actual-url-secure-cookie', 'persistent-login-and-votes-restart', 'pwa-install-update-offline-private-api-exclusion'] };
  } finally {
    if (active) await active.runtime.dispose();
  }
}

try {
  const args = process.argv.slice(2);
  assert(args.length === 0 || (args.length === 2 && args[0] === '--output'), 'Usage: node scripts/production-smoke.mjs [--output path]');
  const result = await smoke();
  if (args.length) await writeFile(path.resolve(args[1]), `${JSON.stringify(result)}\n`);
  console.log(JSON.stringify(result));
} catch (error) {
  // Assertions contain only synthetic counts/status, never credentials or response bodies.
  console.error(`Production smoke failed: ${error.message}`);
  process.exitCode = 1;
}
