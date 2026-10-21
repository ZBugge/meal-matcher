import { randomBytes } from 'node:crypto';
import { startLocalWorker } from './worker-local.mjs';

const directory = process.env.MEALMATCH_LOCAL_STATE;
const port = Number(process.env.MEALMATCH_LOCAL_PORT);
if (!directory || !Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Explicit isolated browser state/port required');
const active = await startLocalWorker({ directory, port, secrets: { SESSION_SECRET: randomBytes(48).toString('base64'), NOTION_ENCRYPTION_KEY: randomBytes(32).toString('base64') } });
console.log(`Isolated browser Worker ready at ${active.url}`);
let closing;
const close = () => closing ??= active.runtime.dispose();
process.once('SIGINT', () => { close().finally(() => process.exit()); });
process.once('SIGTERM', () => { close().finally(() => process.exit()); });
