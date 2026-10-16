import { LibraryExportData, LibraryExportOption, MealIngredient } from '../types';
import { normalizeIngredients, normalizeInstructions, RecipeValidationError } from './recipe';

export class LibraryTransferValidationError extends Error {}

function normalizeOptionalText(value: unknown, field: string): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw new LibraryTransferValidationError(`${field} must be text or null`);
  }
  return value.trim() || null;
}

export function validateMealMetadata(totalMinutes: unknown, effort: unknown): void {
  if (totalMinutes != null && (typeof totalMinutes !== 'number' || !Number.isInteger(totalMinutes) || totalMinutes < 1 || totalMinutes > 1440)) {
    throw new LibraryTransferValidationError('Total time must be a whole number from 1 to 1440 minutes');
  }
  if (effort != null && !['easy', 'medium', 'involved'].includes(effort as string)) {
    throw new LibraryTransferValidationError('Effort must be easy, medium, involved, or null');
  }
}

export function parseLibraryExport(value: unknown): {
  valid: LibraryExportOption[];
  invalid: Array<{ index: number; error: string }>;
} {
  if (!value || typeof value !== 'object') {
    throw new LibraryTransferValidationError('Import data must be an object');
  }

  const data = value as Partial<LibraryExportData>;
  if (data.version !== 1) {
    throw new LibraryTransferValidationError('Unsupported library export version');
  }
  if (!Array.isArray(data.options)) {
    throw new LibraryTransferValidationError('Import data must contain an options array');
  }
  if (data.options.length > 1_000) {
    throw new LibraryTransferValidationError('Import data cannot contain more than 1000 options');
  }

  const valid: LibraryExportOption[] = [];
  const invalid: Array<{ index: number; error: string }> = [];

  data.options.forEach((raw, index) => {
    try {
      if (!raw || typeof raw !== 'object') {
        throw new LibraryTransferValidationError('Option must be an object');
      }
      const option = raw as unknown as Record<string, unknown>;
      if (typeof option.title !== 'string' || !option.title.trim()) {
        throw new LibraryTransferValidationError('Title is required');
      }
      if (option.type !== 'meal' && option.type !== 'category') {
        throw new LibraryTransferValidationError('Type must be meal or category');
      }

      const title = option.title.trim();
      const notes = normalizeOptionalText(option.notes, 'Notes');
      if (option.type === 'category') {
        if (option.description != null || option.instructions != null || option.ingredients != null || option.totalMinutes != null || option.effort != null) {
          throw new LibraryTransferValidationError('Categories cannot contain recipe fields');
        }
        valid.push({ title, type: 'category', notes });
        return;
      }

      validateMealMetadata(option.totalMinutes, option.effort);
      let ingredients: MealIngredient[] = [];
      try {
        ingredients = option.ingredients === undefined ? [] : normalizeIngredients(option.ingredients);
      } catch (error) {
        if (error instanceof RecipeValidationError) {
          throw new LibraryTransferValidationError(error.message);
        }
        throw error;
      }
      valid.push({
        title,
        type: 'meal',
        description: normalizeOptionalText(option.description, 'Description'),
        notes,
        instructions: normalizeInstructions(option.instructions ?? null),
        ingredients,
        ...(option.totalMinutes !== undefined ? { totalMinutes: option.totalMinutes as number | null } : {}),
        ...(option.effort !== undefined ? { effort: option.effort as LibraryExportOption['effort'] } : {}),
      });
    } catch (error) {
      invalid.push({
        index,
        error: error instanceof Error ? error.message : 'Invalid option',
      });
    }
  });

  return { valid, invalid };
}
