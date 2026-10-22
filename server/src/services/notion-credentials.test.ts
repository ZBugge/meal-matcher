import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { encryptNotionToken as encrypt, decryptNotionToken as decrypt } from './notion-credentials';
import { withRuntime, RuntimeEnv } from '../db/schema';
let key: string | undefined;
const bindings = () => ({ SESSION_SECRET: 'synthetic-credential-test-session-secret', NOTION_ENCRYPTION_KEY: key } as RuntimeEnv);
const encryptNotionToken = (token: string, host: string) => withRuntime(bindings(), () => encrypt(token, host));
const decryptNotionToken = (value: string, host: string) => withRuntime(bindings(), () => decrypt(value, host));
beforeEach(() => { key = Buffer.alloc(32, 7).toString('base64'); });
afterEach(() => { vi.restoreAllMocks(); });
describe('host-bound encrypted Notion credentials', () => {
    it('encrypts without plaintext and decrypts with a stable Worker secret binding', async () => {
        const encrypted = encryptNotionToken('ntn_private_token', 'host-one');
        const original = key!;
        expect(encrypted).not.toContain('ntn_private_token');
        expect(original).not.toContain('ntn_private_token');
        expect(Buffer.from(original, 'base64')).toHaveLength(32);
        // A new module/request receives the same explicit Worker secret binding.
        const restarted = await import('./notion-credentials');
        expect(withRuntime(bindings(), () => restarted.decryptNotionToken(encrypted, 'host-one'))).toBe('ntn_private_token');
        expect(encryptNotionToken('another', 'host-one')).not.toEqual(encrypted);
        expect(key).toBe(original);
    });
    it('uses random nonces and authenticates owner and ciphertext', () => {
        const encrypted = encryptNotionToken('ntn_private_token', 'host-one');
        expect(encryptNotionToken('ntn_private_token', 'host-one')).not.toBe(encrypted);
        expect(() => decryptNotionToken(encrypted, 'host-two')).toThrow('cannot be read');
        const parts = encrypted.split('.');
        parts[3] = `${parts[3][0] === 'A' ? 'B' : 'A'}${parts[3].slice(1)}`;
        expect(() => decryptNotionToken(parts.join('.'), 'host-one')).toThrow('cannot be read');
    });
    it('requires a valid Worker secret binding and authenticates the configured key', () => {
        key = undefined;
        expect(() => encryptNotionToken('token', 'host')).toThrow('Set NOTION_ENCRYPTION_KEY');
        key = 'not-a-key';
        expect(() => encryptNotionToken('token', 'host')).toThrow('base64');
        key = Buffer.alloc(32, 7).toString('base64');
        const encrypted = encryptNotionToken('token', 'host');
        expect(decryptNotionToken(encrypted, 'host')).toBe('token');
        key = Buffer.alloc(32, 8).toString('base64');
        expect(() => decryptNotionToken(encrypted, 'host')).toThrow('cannot be read');
    });
    it('rejects malformed or missing Worker keys without generating a replacement', () => {
        key = 'bad';
        expect(() => encryptNotionToken('token', 'host')).toThrow('base64');
        expect(key).toBe('bad');
        key = Buffer.alloc(32, 7).toString('base64');
        const encrypted = encryptNotionToken('token', 'host');
        key = undefined;
        expect(() => decryptNotionToken(encrypted, 'host')).toThrow('Set NOTION_ENCRYPTION_KEY');
        expect(key).toBeUndefined();
    });
    it.each(['', 'x'.repeat(4097), 'token\r\nHeader: injected', 'token\u0000'])('rejects invalid/oversized tokens', token => { expect(() => encryptNotionToken(token, 'host')).toThrow('valid Notion integration token'); });
    it.each(['', 'token', 'v2.abc.def.ghi', 'x'.repeat(24001)])('rejects invalid/oversized ciphertext', value => { expect(() => decryptNotionToken(value, 'host')).toThrow('cannot be read'); });
    it('rejects an empty credential owner', () => { expect(() => encryptNotionToken('token', '')).toThrow('owner'); });
});
