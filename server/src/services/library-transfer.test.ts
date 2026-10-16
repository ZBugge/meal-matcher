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

it('accepts optional recipe metadata and rejects category or malformed metadata', () => {
  const result = parseLibraryExport({version: 1, options: [
    {title: 'Soup', type: 'meal', totalMinutes: 15, effort: 'easy'},
    {title: 'Old', type: 'meal'},
    {title: 'Clear', type: 'meal', totalMinutes: null, effort: null},
    {title: 'Bad time', type: 'meal', totalMinutes: 1.2},
    {title: 'Bad effort', type: 'meal', effort: 'hard'},
    {title: 'Category', type: 'category', totalMinutes: 15},
  ]});
  expect(result.valid).toHaveLength(3); expect(result.invalid).toHaveLength(3);
  expect(result.valid[0]).toMatchObject({totalMinutes: 15, effort: 'easy'});
  expect(result.valid[2]).toMatchObject({totalMinutes: null, effort: null});
});
