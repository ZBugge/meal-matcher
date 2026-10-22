import { createHash } from 'node:crypto';
import { getOne, Mutation, statement } from '../db/schema';

export type OperationResponse = { kind: 'week'; week: string; status: number }
    | { kind: 'json'; value: unknown; status: number };
export interface Operation {
    host: string;
    key: string;
    scope: string;
    digest: string;
    response?: OperationResponse;
    completed?: OperationResponse;
    anonymous?: boolean;
}
export class OperationConflictError extends Error {
    constructor() { super('This Idempotency-Key was already used for different request data.'); }
}
function canonical(value: unknown): string {
    if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
    if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical((value as Record<string, unknown>)[key])).join(',') + '}';
    return JSON.stringify(value ?? null);
}
export function operation(host: string, key: string, scope: string, body: unknown): Operation {
    return { host, key, scope, digest: createHash('sha256').update(canonical(body)).digest('hex') };
}
export function anonymousQuickOperation(key: string, body: unknown): Operation {
    const op = operation('', createHash('sha256').update(key).digest('hex'), 'POST /api/quick-session', body);
    return { ...op, anonymous: true };
}
export async function completedOperation(op: Operation): Promise<OperationResponse | undefined> {
    const receipt = await getOne<{ digest: string; response: string }>(op.anonymous
        ? 'SELECT digest,response FROM anonymous_operation_receipts WHERE key_hash=?'
        : 'SELECT digest,response FROM operation_receipts WHERE host_id=? AND key=? AND scope=?', op.anonymous ? [op.key] : [op.host, op.key, op.scope]);
    if (!receipt) return undefined;
    if (receipt.digest !== op.digest) throw new OperationConflictError();
    return JSON.parse(receipt.response) as OperationResponse;
}
// The receipt and domain writes share one D1 transaction. Only a confirmed
// receipt-key collision can reuse another attempt's result; other failures are
// propagated without retrying the domain writes.
export async function commitOperation(batch: Mutation, op: Operation | undefined, response: OperationResponse): Promise<void> {
    if (!op) { await batch.commit(); return; }
    const descriptor = op.response ?? response;
    const serialized = JSON.stringify(descriptor);
    if (Buffer.byteLength(serialized) > (op.scope === 'POST /api/quick-session' ? 1572864 : 8192)) throw new Error('Operation response exceeds receipt bound');
    batch.statements.unshift(op.anonymous
        ? statement('INSERT INTO anonymous_operation_receipts(key_hash,digest,response,created_at) VALUES (?,?,?,?)', [op.key, op.digest, serialized, Date.now()])
        : statement('INSERT INTO operation_receipts(host_id,key,scope,digest,response,created_at) VALUES (?,?,?,?,?,?)', [op.host, op.key, op.scope, op.digest, serialized, Date.now()]));
    try { await batch.commit(); op.completed = descriptor; }
    catch (error) {
        const constraint = op.anonymous ? 'UNIQUE constraint failed: anonymous_operation_receipts.key_hash' : 'UNIQUE constraint failed: operation_receipts.host_id, operation_receipts.key, operation_receipts.scope';
        if (!String(error).includes(constraint)) throw error;
        const accepted = await completedOperation(op);
        if (!accepted) throw error;
        op.completed = accepted;
    }
}
