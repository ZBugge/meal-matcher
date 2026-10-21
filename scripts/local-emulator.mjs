import path from 'node:path';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

// Use Cloudflare's supported option converter with Wrangler's exact emulator
// dependency. Preserve the existing explicit D1 directory and namespace; never
// let an omitted persistence option silently select a temporary/new database.
export class LocalMiniflare extends Miniflare {
  constructor({ d1Persist, ...options }) {
    if (typeof d1Persist !== 'string' || !path.isAbsolute(d1Persist) || path.basename(d1Persist) !== 'd1') throw new Error('Explicit absolute local D1 persistence directory required');
    super(convertV4MiniflareOptions({ ...options, resourcePersistencePath: path.dirname(d1Persist), telemetry: { enabled: false } }));
  }
}
