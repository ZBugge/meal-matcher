import type { ShoppingItem } from '../api/planning';
export const aisles = ['Produce', 'Meat & fish', 'Dairy & eggs', 'Bakery', 'Pantry', 'Frozen', 'Other'] as const;
export function itemAisle(item: ShoppingItem): string {
  if (item.aisle) return item.aisle;
  const name = item.ingredient.toLowerCase();
  const rules: [string, RegExp][] = [
    ['Frozen', /\b(frozen)\b/], ['Meat & fish', /\b(chicken|beef|pork|salmon|fish|turkey|shrimp)\b/],
    ['Dairy & eggs', /\b(milk|cheese|yogurt|butter|eggs?|cream)\b/], ['Bakery', /\b(bread|bagels?|tortillas?|buns?)\b/],
    ['Produce', /\b(apples?|onions?|garlic|spinach|tomatoes?|potatoes?|carrots?|lettuce|lemons?|broccoli|peppers?|bananas?)\b/],
    ['Pantry', /\b(beans?|pasta|rice|flour|sugar|oil|salt|pepper|cans?|lentils?)\b/],
  ];
  return rules.find(([, pattern]) => pattern.test(name))?.[0] ?? 'Other';
}
const normalize = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase();
// Only sum understood identical units. No conversions or interpretation of prose.
export function combinedAmount(items: ShoppingItem[]): string {
  const sums = new Map<string, { total: number; label: string }>();
  const output: ({ unit: string } | { raw: string })[] = [];
  const units: Record<string, string> = { g: 'g', gram: 'g', grams: 'g', kg: 'kg', ml: 'ml', l: 'l', oz: 'oz', lb: 'lb', lbs: 'lb', cup: 'cups', cups: 'cups', tbsp: 'tbsp', tsp: 'tsp', can: 'cans', cans: 'cans', bag: 'bags', bags: 'bags', carton: 'cartons', cartons: 'cartons' };
  for (const item of items) {
    const value = normalize(item.amount);
    const match = /^(\d+(?:\.\d+)?|\d+\/\d+)(?:\s+([a-z]+))?$/.exec(value);
    const unit = match ? (match[2] ? units[match[2]] : '') : undefined;
    const parts = match?.[1].split('/').map(Number);
    const quantity = parts ? parts[0] / (parts[1] ?? 1) : NaN;
    if (unit !== undefined && Number.isFinite(quantity) && quantity >= 0 && Number.isSafeInteger(quantity * 1000000)) {
      if (!sums.has(unit)) { sums.set(unit, { total: 0, label: unit }); output.push({ unit }); }
      const next = sums.get(unit)!.total + quantity * 1000000;
      if (Number.isSafeInteger(next)) sums.get(unit)!.total = next;
      else output.push({ raw: item.amount });
    } else if (item.amount.trim()) output.push({ raw: item.amount });
  }
  return output.map(part => 'raw' in part ? part.raw : `${sums.get(part.unit)!.total / 1000000} ${sums.get(part.unit)!.label}`.trim()).join(' + ');
}
export interface ShoppingGroup { key: string; ingredient: string; aisle: string; state: ShoppingItem['state']; items: ShoppingItem[]; amount: string }
export function shoppingGroups(items: ShoppingItem[], memberships?: Readonly<Record<string, string>>): ShoppingGroup[] {
  const groups = new Map<string, ShoppingGroup>();
  for (const item of items) {
    // Keep previously separate rows apart while shopping so checking and
    // restoring one row never absorbs an already purchased amount.
    const aisle = itemAisle(item); const key = JSON.stringify([normalize(item.ingredient), aisle, item.state, ...(memberships ? [memberships[item.id] ?? null] : [])]);
    if (!groups.has(key)) groups.set(key, { key, ingredient: item.ingredient.trim(), aisle, state: item.state, items: [], amount: '' });
    groups.get(key)!.items.push(item);
  }
  return [...groups.values()].map(group => ({ ...group, amount: combinedAmount(group.items) }));
}
