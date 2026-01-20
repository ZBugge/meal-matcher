import { describe, it, expect } from 'vitest';
import { parseTokenUsageFromLog } from './state.js';

describe('parseTokenUsageFromLog', () => {
  it('should parse token usage from standard Claude output format', () => {
    const logContent = `
Some output here
Token usage: 12345/200000; 187655 remaining
More output
    `.trim();

    const result = parseTokenUsageFromLog(logContent);
    expect(result).not.toBeNull();
    expect(result?.inputTokens).toBeGreaterThan(0);
    expect(result?.outputTokens).toBeGreaterThan(0);
  });

  it('should parse explicit input/output token counts', () => {
    const logContent = `
Agent processing...
Input tokens: 5000
Output tokens: 3000
Done.
    `.trim();

    const result = parseTokenUsageFromLog(logContent);
    expect(result).not.toBeNull();
    expect(result?.inputTokens).toBe(5000);
    expect(result?.outputTokens).toBe(3000);
  });

  it('should return null for log with no token information', () => {
    const logContent = 'Some random log output without tokens';

    const result = parseTokenUsageFromLog(logContent);
    expect(result).toBeNull();
  });

  it('should use the last occurrence of token usage', () => {
    const logContent = `
First: Token usage: 1000/200000; 199000 remaining
Second: Token usage: 5000/200000; 195000 remaining
Third: Token usage: 10000/200000; 190000 remaining
    `.trim();

    const result = parseTokenUsageFromLog(logContent);
    expect(result).not.toBeNull();
    // Should use the last occurrence (10000)
    expect(result!.inputTokens + result!.outputTokens).toBeGreaterThan(0);
  });

  it('should handle logs with alternative token formats', () => {
    const logContent = `
Processing request...
Tokens in: 2500
Tokens out: 1500
Complete.
    `.trim();

    const result = parseTokenUsageFromLog(logContent);
    expect(result).not.toBeNull();
    expect(result?.inputTokens).toBe(2500);
    expect(result?.outputTokens).toBe(1500);
  });
});
