// Local, read-only recovery proof. Never prints a key, token, host ID or ciphertext.
import { createHash, createDecipheriv } from 'node:crypto';
import { constants, openSync, fstatSync, readFileSync, closeSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function checkCredentials(backupBytes, expectedHash, encodedKey) {
  if (createHash('sha256').update(backupBytes).digest('hex') !== expectedHash) throw new Error('Backup hash mismatch');
  if (!/^[A-Za-z0-9+/]{43}=$/.test(encodedKey)) throw new Error('Invalid recovery key format');
  const key = Buffer.from(encodedKey, 'base64');
  if (key.length !== 32 || key.toString('base64') !== encodedKey) throw new Error('Invalid recovery key');
  try {
    const payload = JSON.parse(backupBytes);
    if (payload.format !== 'mealmatch-private-d1-backup' || payload.version !== 1 || !Array.isArray(payload.data?.notion_connections)) throw new Error('Unsupported backup');
    let decrypted = 0;
    for (const row of payload.data.notion_connections) {
      if (row.host_id?.type !== 'string' || row.token_ciphertext?.type !== 'string') throw new Error('Unsupported credential row');
      const hostId = row.host_id.value;
      const ciphertext = row.token_ciphertext.value;
      if (!hostId || hostId.length > 256 || !/^v1\.[\w-]{16}\.[\w-]{22}\.[\w-]+$/.test(ciphertext) || ciphertext.length > 24000) throw new Error('Unsupported credential envelope');
      const [, nonce, tag, encrypted] = ciphertext.split('.');
      const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(nonce, 'base64url'));
      decipher.setAAD(Buffer.from(`mealmatch:notion:v1:${hostId}`, 'utf8'));
      decipher.setAuthTag(Buffer.from(tag, 'base64url'));
      const plaintext = Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64url')), decipher.final()]);
      try {
        const token = plaintext.toString('utf8');
        if (!token.trim() || token.length > 4096 || /[\r\n\x00]/.test(token)) throw new Error('Invalid decrypted credential');
        decrypted++;
      } finally { plaintext.fill(0); }
    }
    return { connections: payload.data.notion_connections.length, decrypted, unchangedCiphertext: true };
  } finally { key.fill(0); }
}

function main() {
  const args = process.argv.slice(2);
  if (args.length !== 6 || args[0] !== '--backup' || args[2] !== '--sha256' || args[4] !== '--key') throw new Error('Explicit backup, checksum and original key-file paths required');
  const descriptor = openSync(args[5], constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
  try {
    const metadata = fstatSync(descriptor);
    if (!metadata.isFile() || metadata.size !== 44 || process.platform !== 'win32' && (metadata.mode & 0o077) !== 0) throw new Error('Refusing key-file metadata');
    const before = readFileSync(descriptor, 'utf8');
    const result = checkCredentials(readFileSync(args[1]), args[3], before);
    // Original custody is preserved; this descriptor is read-only and no key is created.
    console.log(JSON.stringify({ ok: true, localOnly: true, ...result }));
  } finally { closeSync(descriptor); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch { console.error('Credential recovery proof failed. Preserve the original key/ciphertext and inspect privately; no credentials were changed.'); process.exitCode = 1; }
}
