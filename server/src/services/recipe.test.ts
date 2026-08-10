import { describe, expect, it } from 'vitest';
import {
  normalizeIngredients,
  normalizeInstructions,
  parseRecipeText,
  RecipeValidationError,
} from './recipe';

describe('recipe normalization', () => {
  it('preserves free-text amounts while trimming ingredient rows', () => {
    expect(normalizeIngredients([
      { amount: ' 2 bulbs ', ingredient: ' garlic ' },
      { amount: '4oz', ingredient: 'milk' },
    ])).toEqual([
      { amount: '2 bulbs', ingredient: 'garlic' },
      { amount: '4oz', ingredient: 'milk' },
    ]);
  });

  it('allows an empty amount but requires an ingredient name', () => {
    expect(normalizeIngredients([{ amount: '', ingredient: 'salt' }])).toEqual([
      { amount: '', ingredient: 'salt' },
    ]);
    expect(() => normalizeIngredients([{ amount: '1 cup', ingredient: ' ' }]))
      .toThrow(RecipeValidationError);
  });

  it('normalizes blank instructions to null', () => {
    expect(normalizeInstructions('  Mix everything.  ')).toBe('Mix everything.');
    expect(normalizeInstructions('  ')).toBeNull();
  });

  it('parses the deterministic full-recipe paste format', () => {
    expect(parseRecipeText(`
Title: Garlic Soup
Description: Creamy roasted garlic soup
Ingredients:
2 bulbs | garlic
4oz | milk
to taste | salt
Instructions:
Roast the garlic.
Blend and simmer.
    `)).toEqual({
      title: 'Garlic Soup',
      description: 'Creamy roasted garlic soup',
      instructions: 'Roast the garlic.\nBlend and simmer.',
      ingredients: [
        { amount: '2 bulbs', ingredient: 'garlic' },
        { amount: '4oz', ingredient: 'milk' },
        { amount: 'to taste', ingredient: 'salt' },
      ],
    });
  });

  it('accepts an LLM code fence and an empty amount', () => {
    expect(parseRecipeText(`\`\`\`text
Title: Toast
Ingredients:
 | bread
Instructions:
Toast it.
\`\`\``)).toMatchObject({
      title: 'Toast',
      ingredients: [{ amount: '', ingredient: 'bread' }],
    });
  });

  it('reports malformed ingredient rows with their line number', () => {
    expect(() => parseRecipeText(`Title: Soup
Ingredients:
2 bulbs garlic`)).toThrow('line 3 must use "amount | ingredient"');
  });
});
