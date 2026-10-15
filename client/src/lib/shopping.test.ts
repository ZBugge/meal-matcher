import { describe, expect, it } from 'vitest';
import { combinedAmount, shoppingGroups, itemAisle } from './shopping';
import type { ShoppingItem } from '../api/planning';
const item = (ingredient: string, amount: string, overrides: Partial<ShoppingItem> = {}): ShoppingItem => ({ id: crypto.randomUUID(), ingredient, amount, aisle: null, state: 'needed', entryId: null, sourceTitle: null, displayOrder: 0, ...overrides });
describe('shopping consolidation', () => {
  it('normalizes case/spacing and preserves each source contribution', () => {
    const rows = [item('  White   beans ', '2 cans', { sourceTitle: 'Soup' }), item('white beans', '1 can', { sourceTitle: 'Tacos' })];
    expect(shoppingGroups(rows)).toEqual([expect.objectContaining({ amount: '3 cans', items: rows, aisle: 'Pantry' })]);
  });
  it('sums only compatible understood units and keeps ambiguous text intact', () => {
    expect(combinedAmount([item('x', '1/2 cup'), item('x', '1.5 cups'), item('x', '200 g'), item('x', '1 kg'), item('x', 'a handful'), item('x', '2 x 400 g cans, drained')])).toBe('2 cups + 200 g + 1 kg + a handful + 2 x 400 g cans, drained');
    expect(combinedAmount([item('x', 'to taste'), item('x', 'to taste')])).toBe('to taste + to taste');
    expect(combinedAmount([item('x', '1/0 cup'), item('x', '1/3 cup')])).toBe('1/0 cup + 1/3 cup');
  });
  it('separates states and explicit aisle choices, leaving unknown items Other', () => {
    const rows = [item('Milk', '1 carton'), item('milk', '1 carton', { state: 'bought' }), item('Milk', '2 cartons', { aisle: 'Frozen' })];
    expect(shoppingGroups(rows)).toHaveLength(3);
    expect(itemAisle(item('mystery ingredient', ''))).toBe('Other');
    expect(itemAisle(item('milk', '', { aisle: 'Other' }))).toBe('Other');
  });
});
