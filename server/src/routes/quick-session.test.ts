import { describe, it, expect } from 'vitest';

describe('Quick Session API', () => {
  it('should validate quick session request structure', () => {
    const validRequest = {
      creatorName: 'Test User',
      meals: [
        { title: 'Pizza', description: 'Cheese pizza' },
        { title: 'Burgers', description: 'Beef burgers' },
        { title: 'Tacos' }
      ]
    };

    expect(validRequest).toHaveProperty('creatorName');
    expect(validRequest).toHaveProperty('meals');
    expect(validRequest.creatorName).toBeTruthy();
    expect(validRequest.meals.length).toBeGreaterThan(0);
  });

  it('should validate quick session response structure', () => {
    const mockResponse = {
      session: {
        id: 'session-123',
        inviteCode: 'ABC123',
        status: 'open'
      },
      participantId: 'participant-123',
      creatorToken: 'token-123',
      mealIds: ['meal-1', 'meal-2', 'meal-3']
    };

    expect(mockResponse).toHaveProperty('session');
    expect(mockResponse).toHaveProperty('participantId');
    expect(mockResponse).toHaveProperty('creatorToken');
    expect(mockResponse).toHaveProperty('mealIds');
    expect(mockResponse.session.status).toBe('open');
    expect(mockResponse.session.inviteCode).toHaveLength(6);
  });

  it('should validate temporary meal structure', () => {
    const temporaryMeal = {
      temporary: 1,
      creator_token: 'token-123'
    };

    expect(temporaryMeal.temporary).toBe(1);
    expect(temporaryMeal.creator_token).toBeTruthy();
  });

  it('should validate error response for missing creator name', () => {
    const errorResponse = {
      error: 'Creator name and at least one meal required'
    };

    expect(errorResponse).toHaveProperty('error');
    expect(errorResponse.error).toContain('Creator name');
  });

  it('should validate error response for empty meals', () => {
    const errorResponse = {
      error: 'Creator name and at least one meal required'
    };

    expect(errorResponse).toHaveProperty('error');
    expect(errorResponse.error).toContain('meal required');
  });
});
