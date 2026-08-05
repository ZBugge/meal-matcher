import { MealType, SessionMode } from '../types';

export function isSessionMode(value: unknown): value is SessionMode {
  return value === 'home' || value === 'takeout';
}

export function mealTypeForMode(mode: SessionMode): MealType {
  return mode === 'home' ? 'meal' : 'category';
}

export function hasDuplicateOptionTitles(titles: string[]): boolean {
  const normalized = titles.map((title) => title.trim().toLowerCase());
  return new Set(normalized).size !== normalized.length;
}
