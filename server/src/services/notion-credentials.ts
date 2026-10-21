import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { runtime } from '../db/schema';
import { NotionError } from './notion-reader';
const MAX_TOKEN = 4096;
function decodeKey(value: string): Buffer {
    if (!/^[A-Za-z0-9+/]{43}=$/.test(value))
        throw new NotionError('Notion encryption key must be a base64-encoded 32-byte key.', 503);
    const key = Buffer.from(value, 'base64');
    if (key.length !== 32 || key.toString('base64') !== value)
        throw new NotionError('Notion encryption key must be a base64-encoded 32-byte key.', 503);
    return key;
}
function encryptionKey(_create: boolean): Buffer { const configured = runtime().NOTION_ENCRYPTION_KEY; if (!configured)
    throw new NotionError('Set NOTION_ENCRYPTION_KEY before connecting Notion.', 503); return decodeKey(configured); }
function hostContext(hostId: string): Buffer {
    if (typeof hostId !== 'string' || !hostId || hostId.length > 256)
        throw new NotionError('Invalid Notion credential owner.', 400);
    return Buffer.from(`mealmatch:notion:v1:${hostId}`, 'utf8');
}
export function encryptNotionToken(token: string, hostId: string): string {
    if (typeof token !== 'string' || !token.trim() || token.length > MAX_TOKEN || /[\r\n\x00]/.test(token)) {
        throw new NotionError('A valid Notion integration token is required.', 400);
    }
    const context = hostContext(hostId);
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', encryptionKey(true), nonce);
    cipher.setAAD(context);
    const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
    return `v1.${nonce.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${encrypted.toString('base64url')}`;
}
export function decryptNotionToken(ciphertext: string, hostId: string): string {
    const context = hostContext(hostId);
    if (typeof ciphertext !== 'string' || ciphertext.length > 24000 || !/^v1\.[\w-]{16}\.[\w-]{22}\.[\w-]+$/.test(ciphertext)) {
        throw new NotionError('Saved Notion credentials cannot be read. Reconnect Notion.', 503);
    }
    const key = encryptionKey(false);
    try {
        const [, nonce, tag, encrypted] = ciphertext.split('.');
        const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(nonce, 'base64url'));
        decipher.setAAD(context);
        decipher.setAuthTag(Buffer.from(tag, 'base64url'));
        const token = Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64url')), decipher.final()]).toString('utf8');
        if (!token.trim() || token.length > MAX_TOKEN || /[\r\n\x00]/.test(token))
            throw new Error('Invalid token');
        return token;
    }
    catch {
        throw new NotionError('Saved Notion credentials cannot be read. Reconnect Notion.', 503);
    }
}
