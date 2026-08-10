import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mealsApi, participantApi } from './client';

// Mock fetch
const mockFetch = vi.fn();
(globalThis as any).fetch = mockFetch;

describe('API Client - Session Closed Handling', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should throw ApiException with sessionClosed flag when session is closed', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({
        error: 'This session has ended',
        sessionClosed: true,
      }),
    });

    try {
      await participantApi.submitSwipes('session123', 'participant123', []);
      expect.fail('Should have thrown an error');
    } catch (error: any) {
      expect(error.message).toBe('This session has ended');
      expect(error.sessionClosed).toBe(true);
    }
  });

  it('should throw ApiException without sessionClosed flag for other errors', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({
        error: 'Some other error',
      }),
    });

    try {
      await participantApi.submitSwipes('session123', 'participant123', []);
      expect.fail('Should have thrown an error');
    } catch (error: any) {
      expect(error.message).toBe('Some other error');
      expect(error.sessionClosed).toBe(false);
    }
  });

  it('preserves the existing record ID for duplicate library options', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({
        error: 'A food category with this name already exists',
        existingId: 'category-123',
      }),
    });

    await expect(mealsApi.create('Pizza', undefined, 'category')).rejects.toMatchObject({
      existingId: 'category-123',
      sessionClosed: false,
    });
  });

  it('sends recipe instructions and two-field ingredient rows for home meals', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: 'meal-123',
        title: 'Garlic soup',
        description: null,
        type: 'meal',
        pickCount: 0,
        instructions: 'Simmer.',
        ingredients: [{ amount: '2 bulbs', ingredient: 'garlic' }],
      }),
    });

    await mealsApi.create('Garlic soup', undefined, 'meal', {
      instructions: 'Simmer.',
      ingredients: [{ amount: '2 bulbs', ingredient: 'garlic' }],
    });

    expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toEqual({
      title: 'Garlic soup',
      type: 'meal',
      instructions: 'Simmer.',
      ingredients: [{ amount: '2 bulbs', ingredient: 'garlic' }],
    });
  });

  it('sends full recipe text to the authenticated parser', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        title: 'Garlic Soup',
        description: null,
        instructions: 'Simmer.',
        ingredients: [{ amount: '2 bulbs', ingredient: 'garlic' }],
      }),
    });

    await mealsApi.parseRecipe('Title: Garlic Soup');

    expect(mockFetch).toHaveBeenCalledWith('/api/meals/parse-recipe', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ text: 'Title: Garlic Soup' }),
    }));
  });

  it('loads one host-owned meal for the read-only recipe viewer', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: 'meal-123',
        title: 'Garlic Soup',
        description: null,
        type: 'meal',
        pickCount: 1,
        instructions: 'Simmer.',
        ingredients: [{ amount: '2 bulbs', ingredient: 'garlic' }],
      }),
    });

    await mealsApi.get('meal-123');

    expect(mockFetch).toHaveBeenCalledWith('/api/meals/meal-123', expect.any(Object));
  });

  it('sends private library notes only to the authenticated meal endpoint', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: 'meal-123',
        title: 'Thai food',
        description: null,
        notes: 'Ask for mild spice.',
        type: 'category',
        pickCount: 1,
      }),
    });

    await mealsApi.update('meal-123', { notes: 'Ask for mild spice.' });

    expect(mockFetch).toHaveBeenCalledWith('/api/meals/meal-123', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ notes: 'Ask for mild spice.' }),
    }));
  });

  it('previews and confirms versioned library imports', async () => {
    const data = { version: 1 as const, exportedAt: '2026-08-10T00:00:00Z', options: [] };
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ ready: 0, imported: 0, duplicates: [], invalid: [] }),
    });

    await mealsApi.previewImport(data);
    await mealsApi.importLibrary(data);

    expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toEqual({ data, dryRun: true });
    expect(JSON.parse(mockFetch.mock.calls[1][1].body)).toEqual({ data, dryRun: false });
  });
});
