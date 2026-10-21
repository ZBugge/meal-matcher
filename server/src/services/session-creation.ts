import { Mutation } from '../db/schema';
import { generateInviteCode } from './matching';

export class InviteCodeExhaustedError extends Error {
    constructor() { super('Failed to generate unique invite code'); }
}

// Only a confirmed invite-code uniqueness rejection permits another attempt.
// Mutation resolves durable receipts first, so uncertain persistence is never
// interpreted as a collision or replayed here. Each attempt retains every guard.
export async function commitSessionCreation(
    build: (inviteCode: string) => Mutation,
    generate: () => string = generateInviteCode,
    commit: (batch: Mutation, inviteCode: string) => Promise<void> = batch => batch.commit()
): Promise<string> {
    for (let attempt = 0; attempt < 10; attempt++) {
        const code = generate();
        try { await commit(build(code), code); return code; }
        catch (error) {
            if (!/UNIQUE constraint failed: sessions\.invite_code(?=$|:|\s)/.test(String(error))) throw error;
        }
    }
    throw new InviteCodeExhaustedError();
}
