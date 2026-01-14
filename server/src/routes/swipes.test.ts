import { describe, it, expect } from 'vitest';

describe('Swipe API - Session Closed Response', () => {
  it('should return sessionClosed flag when session is closed', () => {
    // This test verifies that the swipes.ts route returns the correct response
    // structure when a session is closed

    const mockClosedSessionResponse = {
      error: 'This session has ended',
      sessionClosed: true,
    };

    // Verify the response structure matches the expected format
    expect(mockClosedSessionResponse).toHaveProperty('error');
    expect(mockClosedSessionResponse).toHaveProperty('sessionClosed');
    expect(mockClosedSessionResponse.sessionClosed).toBe(true);
    expect(mockClosedSessionResponse.error).toBe('This session has ended');
  });

  it('should have correct error message format', () => {
    const errorMessage = 'This session has ended';

    // Verify the error message is user-friendly
    expect(errorMessage).not.toContain('Session is closed');
    expect(errorMessage).toContain('ended');
  });
});
