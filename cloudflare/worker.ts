import { env } from 'cloudflare:workers';
import { httpServerHandler } from 'cloudflare:node';
import { isIP } from 'node:net';
import { createApp } from '../server/src/index';
import { withRuntime, RuntimeEnv } from '../server/src/db/schema';
const bindings = env as unknown as RuntimeEnv;
createApp(bindings).listen(3000);
const adapter = httpServerHandler({ port: 3000 });
export default {
    fetch(request: Request, runtimeEnv: RuntimeEnv & {
        ASSETS: {
            fetch(request: Request): Promise<Response>;
        };
        RELEASE_ENVIRONMENT?: string;
        RELEASE_COMMIT?: string;
        RELEASE_SOURCE_SHA256?: string;
        RELEASE_WORKER_SHA256?: string;
        RELEASE_ASSET_SHA256?: string;
    }, ctx: unknown) {
        const url = new URL(request.url);
        if (url.pathname === '/api/deployment' && request.method === 'GET') {
            const identity = {
                environment: runtimeEnv.RELEASE_ENVIRONMENT,
                commit: runtimeEnv.RELEASE_COMMIT,
                sourceSha256: runtimeEnv.RELEASE_SOURCE_SHA256,
                workerSha256: runtimeEnv.RELEASE_WORKER_SHA256,
                assetSha256: runtimeEnv.RELEASE_ASSET_SHA256,
            };
            const configured = Object.values(identity).every(value => typeof value === 'string' && value.length > 0);
            return Response.json(configured ? identity : { error: 'Deployment identity unavailable' }, {
                status: configured ? 200 : 503,
                headers: { 'Cache-Control': 'no-store' },
            });
        }
        if (url.pathname !== '/api' && !url.pathname.startsWith('/api/'))
            return runtimeEnv.ASSETS.fetch(request);
        const headers = new Headers(request.headers);
        headers.delete('forwarded');
        headers.set('x-forwarded-proto', url.protocol.slice(0, -1));
        // CF-Connecting-IP is provider supplied. Never accept arbitrary X-Forwarded-For.
        const supplied = headers.get('cf-connecting-ip') || '';
        const version = isIP(supplied);
        const ip = version === 6 ? new URL('http://[' + supplied + ']').hostname.slice(1, -1).toLowerCase() : version === 4 ? supplied : 'unknown';
        headers.set('x-mealmatch-client-ip', ip);
        return withRuntime(runtimeEnv, () => adapter.fetch(new Request(request, { headers }), runtimeEnv, ctx));
    }
};
