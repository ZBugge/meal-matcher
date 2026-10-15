import plansRoutes from '../routes/plans';
import express from 'express';
import session from 'express-session';
import type { AddressInfo } from 'net';
import { initializeDatabase } from '../db/schema';
import authRoutes from '../routes/auth';
import mealsRoutes from '../routes/meals';
import sessionsRoutes from '../routes/sessions';
import quickSessionRoutes from '../routes/quick-session';
import swipesRoutes from '../routes/swipes';

// Mount production routers without importing index.ts, which starts a global server.
// Vitest setup has already allocated this file's disposable DATABASE_PATH.
export async function startHttpTestServer() {
  await initializeDatabase();
  const app = express();
  app.use(express.json());
  app.use(session({
    secret: 'synthetic-http-test-secret', resave: false, saveUninitialized: false,
    cookie: { httpOnly: true, secure: false, sameSite: 'lax' },
  }));
  app.use('/api/auth', authRoutes);
  app.use('/api/meals', mealsRoutes);
  app.use('/api/plans', plansRoutes);
  app.use('/api/sessions', sessionsRoutes);
  app.use('/api/quick-session', quickSessionRoutes);
  app.use('/api', swipesRoutes);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    client() {
      let cookie = '';
      return {
        // Responses are deliberately checked by assertions, including malformed payloads.
        async request<T = any>(path: string, method = 'GET', body?: unknown) {
          const response = await fetch(`${baseUrl}/api${path}`, {
            method,
            headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
          });
          const setCookie = response.headers.get('set-cookie');
          if (setCookie) cookie = setCookie.split(';')[0];
          const responseBody = response.headers.get('content-type')?.includes('application/json')
            ? await response.json() : { error: await response.text() };
          return { status: response.status, body: responseBody as T };
        },
      };
    },
    async close() {
      await new Promise<void>((resolve, reject) => {
        server.close(error => error ? reject(error) : resolve());
        server.closeAllConnections();
      });
    },
  };
}

export type HttpTestServer = Awaited<ReturnType<typeof startHttpTestServer>>;
export type HttpTestClient = ReturnType<HttpTestServer['client']>;

export interface QuickFixture {
  session: { id: string; inviteCode: string; mode: string; status: string };
  participantId: string;
  creatorToken: string;
  meals: Array<{ id: string; sessionMealId: string; title: string; type: string; description: string | null }>;
}

export async function createQuickFixture(client: HttpTestClient): Promise<QuickFixture> {
  const response = await client.request('/quick-session', 'POST', {
    creatorName: 'Synthetic voter', mode: 'home', meals: [{ title: 'Soup' }, { title: 'Pasta' }],
  });
  if (response.status !== 200) throw new Error(`Quick fixture failed: ${response.status}`);
  return response.body;
}

