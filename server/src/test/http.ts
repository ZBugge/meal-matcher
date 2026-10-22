import { randomUUID } from 'node:crypto';
import { testFixture, resetNotionFixture } from './runtime';
export async function startHttpTestServer() {
    const active = await testFixture();
    const baseUrl = active.url.replace(/\/$/, '');
    let clientIndex = 0;
    return { client() {
            let cookie = '';
            const ip = `198.51.100.${++clientIndex}`;
            return { getCookie() { return cookie; }, setCookie(value: string) { cookie = value; }, async request<T = any>(route: string, method = 'GET', body?: unknown, headers: Record<string, string> = {}) {
                    if ((route === '/notion' && method === 'PUT') || route === '/notion/refresh')
                        resetNotionFixture();
                    const current = await testFixture();
                    const response = await fetch(`${current.url.replace(/\/$/, '')}/api${route}`, { method, headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip, ...(cookie ? { cookie } : {}), ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
                    const setCookie = response.headers.get('set-cookie');
                    if (setCookie)
                        cookie = setCookie.split(';')[0];
                    const result = response.headers.get('content-type')?.includes('application/json') ? await response.json() : { error: await response.text() };
                    return { status: response.status, body: result as T };
                } };
        }, async close() { } };
}
export type HttpTestServer = Awaited<ReturnType<typeof startHttpTestServer>>;
export type HttpTestClient = ReturnType<HttpTestServer['client']>;
export interface QuickFixture {
    session: {
        id: string;
        inviteCode: string;
        mode: string;
        status: string;
    };
    participantId: string;
    creatorToken: string;
    meals: Array<{
        id: string;
        sessionMealId: string;
        title: string;
        type: string;
        description: string | null;
    }>;
}
export async function createQuickFixture(client: HttpTestClient): Promise<QuickFixture> { const result = await client.request('/quick-session', 'POST', { creatorName: 'Synthetic voter', mode: 'home', meals: [{ title: 'Soup' }, { title: 'Pasta' }] }); if (result.status !== 200)
    throw new Error(`Quick fixture failed: ${result.status}`); return result.body; }
