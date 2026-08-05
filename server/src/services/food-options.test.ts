import { describe, expect, it } from 'vitest';
import {
  hasDuplicateOptionTitles,
  isSessionMode,
  mealTypeForMode,
} from './food-options';

describe('food option domain rules', () => {
  it('recognizes only supported session modes', () => {
    expect(isSessionMode('home')).toBe(true);
    expect(isSessionMode('takeout')).toBe(true);
    expect(isSessionMode('mixed')).toBe(false);
    expect(isSessionMode(undefined)).toBe(false);
  });

  it('maps each session mode to its allowed option type', () => {
    expect(mealTypeForMode('home')).toBe('meal');
    expect(mealTypeForMode('takeout')).toBe('category');
  });

  it('detects duplicate titles case-insensitively after trimming', () => {
    expect(hasDuplicateOptionTitles(['Pizza', ' pizza '])).toBe(true);
    expect(hasDuplicateOptionTitles(['Pizza', 'Sushi'])).toBe(false);
  });
});
