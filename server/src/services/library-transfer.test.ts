import { describe, expect, it } from 'vitest';
import { LibraryTransferValidationError, parseLibraryExport } from './library-transfer';

describe('library transfer validation', () => {
  it('normalizes meals and categories while preserving ingredient order', () => {
    expect(parseLibraryExport({
      version: 1,
      options: [
        {
          title: ' Soup ',
          type: 'meal',
          description: ' Warm ',
          notes: ' Winter ',
          instructions: ' Simmer ',
          ingredients: [
            { amount: ' 2 cups ', ingredient: ' stock ' },
            { amount: '', ingredient: ' salt ' },
          ],
        },
        { title: ' Thai ', type: 'category', notes: ' Try curry ' },
      ],
    }).valid).toEqual([
      {
        title: 'Soup',
        type: 'meal',
        description: 'Warm',
        notes: 'Winter',
        instructions: 'Simmer',
        ingredients: [
          { amount: '2 cups', ingredient: 'stock' },
          { amount: '', ingredient: 'salt' },
        ],
      },
      { title: 'Thai', type: 'category', notes: 'Try curry' },
    ]);
  });

  it('reports invalid entries without rejecting valid entries', () => {
    const result = parseLibraryExport({
      version: 1,
      options: [
        { title: 'Pizza', type: 'category' },
        { title: '', type: 'meal' },
        { title: 'Italian', type: 'category', instructions: 'Nope' },
      ],
    });

    expect(result.valid).toHaveLength(1);
    expect(result.invalid).toEqual([
      { index: 1, error: 'Title is required' },
      { index: 2, error: 'Categories cannot contain recipe fields' },
    ]);
  });

  it('rejects unsupported export versions', () => {
    expect(() => parseLibraryExport({ version: 2, options: [] }))
      .toThrow(LibraryTransferValidationError);
  });
});
