import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('planning mutation acknowledgements', () => {
  beforeEach(() => {
    vi.resetModules();
    sessionStorage.clear();
    const browserCrypto = globalThis.crypto;
    const digests = new Map<string, ArrayBuffer>();
    vi.stubGlobal('crypto', {
      getRandomValues: (bytes: Uint8Array) => browserCrypto.getRandomValues(bytes),
      subtle: { async digest(_algorithm: string, bytes: Uint8Array) {
        const input = new TextDecoder().decode(bytes);
        if (!digests.has(input)) digests.set(input, new Uint8Array(32).fill(digests.size + 1).buffer);
        return digests.get(input)!;
      } },
    });
  });
  afterEach(() => { vi.unstubAllGlobals(); sessionStorage.clear(); });
  const options = { method: 'POST', body: JSON.stringify({ mealId: 'synthetic-meal', date: null }) };
  const response = (status = 201) => ({ ok: status < 400, status, json: async () => status < 400 ? { saved: true } : { error: 'synthetic failure' } });

  it('reuses a private intent key after a lost response and reload, then rotates after acknowledgement', async () => {
    const fetch = vi.fn().mockRejectedValueOnce(new TypeError('synthetic lost response')).mockResolvedValue(response());
    vi.stubGlobal('fetch', fetch);
    let { request } = await import('./client');
    await expect(request('/plans/2026-10-19/entries', options)).rejects.toThrow('lost response');
    const first = fetch.mock.calls[0][1].headers['Idempotency-Key'];
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    const stored = sessionStorage.getItem('mealmatch:pending-mutations:v1')!;
    expect(stored).not.toContain('synthetic-meal');
    expect(stored).not.toContain('2026-10-19');
    vi.resetModules();
    ({ request } = await import('./client'));
    await request('/plans/2026-10-19/entries', options);
    expect(fetch.mock.calls[1][1].headers['Idempotency-Key']).toBe(first);
    await request('/plans/2026-10-19/entries', options);
    expect(fetch.mock.calls[2][1].headers['Idempotency-Key']).not.toBe(first);
  });

  it('retains an unacknowledged key through rate limits and other rejections, and isolates changed requests', async () => {
    const fetch = vi.fn().mockRejectedValueOnce(new TypeError('synthetic committed response lost')).mockResolvedValueOnce(response(429)).mockResolvedValueOnce(response(400)).mockResolvedValue(response());
    vi.stubGlobal('fetch', fetch);
    const { request } = await import('./client');
    await expect(request('/plans/2026-10-19/entries', options)).rejects.toThrow();
    await expect(request('/plans/2026-10-19/entries', options)).rejects.toThrow();
    const keys = () => fetch.mock.calls.map(call => call[1].headers['Idempotency-Key']);
    expect(keys()[1]).toBe(keys()[0]);
    await expect(request('/plans/2026-10-19/entries', options)).rejects.toThrow();
    expect(keys()[2]).toBe(keys()[0]);
    await request('/plans/2026-10-19/entries', options);
    expect(keys()[3]).toBe(keys()[0]);
    await request('/plans/2026-10-26/entries', options);
    expect(keys()[4]).not.toBe(keys()[0]);
    await request('/auth/login', { method: 'POST', body: JSON.stringify({ email: 'synthetic@example.test', password: 'synthetic' }) });
    expect(fetch.mock.calls[5][1].headers['Idempotency-Key']).toBeUndefined();
  });
});
