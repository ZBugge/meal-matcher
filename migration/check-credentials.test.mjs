import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, createCipheriv, createHash } from 'node:crypto';
import { checkCredentials } from './check-credentials.mjs';

test('recovery checks original host-bound credential without exposing or mutating secrets', () => {
  const key = randomBytes(32), nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  cipher.setAAD(Buffer.from('mealmatch:notion:v1:host'));
  const encrypted = Buffer.concat([cipher.update('synthetic-token'), cipher.final()]);
  const ciphertext = `v1.${nonce.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${encrypted.toString('base64url')}`;
  const payload = { format: 'mealmatch-private-d1-backup', version: 1, data: { notion_connections: [{ host_id: { type: 'string', value: 'host' }, token_ciphertext: { type: 'string', value: ciphertext } }] } };
  const serialized = JSON.stringify(payload);
  const hash = createHash('sha256').update(serialized).digest('hex');
  assert.deepEqual(checkCredentials(serialized, hash, key.toString('base64')), { connections: 1, decrypted: 1, unchangedCiphertext: true });
  assert.equal(JSON.stringify(payload), serialized);
  assert.throws(() => checkCredentials(serialized, '0'.repeat(64), key.toString('base64')), /hash mismatch/);
  assert.throws(() => checkCredentials(serialized, hash, randomBytes(32).toString('base64')));
  payload.data.notion_connections[0].host_id.value = 'other';
  const tampered = JSON.stringify(payload);
  assert.throws(() => checkCredentials(tampered, createHash('sha256').update(tampered).digest('hex'), key.toString('base64')));
});
