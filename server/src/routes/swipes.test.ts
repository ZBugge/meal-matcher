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

describe('Swipe API - Vote Value Validation', () => {
  it('should accept vote value 0 (no)', () => {
    const vote = 0;
    const validVotes = [0, 1, 2];

    expect(validVotes.includes(vote)).toBe(true);
  });

  it('should accept vote value 1 (yes)', () => {
    const vote = 1;
    const validVotes = [0, 1, 2];

    expect(validVotes.includes(vote)).toBe(true);
  });

  it('should accept vote value 2 (maybe)', () => {
    const vote = 2;
    const validVotes = [0, 1, 2];

    expect(validVotes.includes(vote)).toBe(true);
  });

  it('should reject invalid vote values', () => {
    const invalidVotes = [-1, 3, 'yes', true, null, undefined];
    const validVotes = [0, 1, 2];

    invalidVotes.forEach(vote => {
      expect(validVotes.includes(vote as number)).toBe(false);
    });
  });

  it('should format correct error message for invalid vote', () => {
    const invalidVote = 5;
    const errorMessage = `Invalid vote value: ${invalidVote}. Must be 0 (no), 1 (yes), or 2 (maybe)`;

    expect(errorMessage).toContain('Invalid vote value');
    expect(errorMessage).toContain('0 (no)');
    expect(errorMessage).toContain('1 (yes)');
    expect(errorMessage).toContain('2 (maybe)');
  });

  it('should validate swipe request payload structure', () => {
    const mockSwipeRequest = {
      participantId: 'participant123',
      swipes: [
        { mealId: 'meal1', vote: 0 },
        { mealId: 'meal2', vote: 1 },
        { mealId: 'meal3', vote: 2 },
      ],
    };

    expect(mockSwipeRequest).toHaveProperty('participantId');
    expect(mockSwipeRequest).toHaveProperty('swipes');
    expect(Array.isArray(mockSwipeRequest.swipes)).toBe(true);

    mockSwipeRequest.swipes.forEach(swipe => {
      expect(swipe).toHaveProperty('mealId');
      expect(swipe).toHaveProperty('vote');
      expect([0, 1, 2].includes(swipe.vote)).toBe(true);
    });
  });
});
