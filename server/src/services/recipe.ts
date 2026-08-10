import { MealIngredient, ParsedRecipe } from '../types';

export class RecipeValidationError extends Error {}

export function normalizeInstructions(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== 'string') {
    throw new RecipeValidationError('Instructions must be text');
  }

  return value.trim() || null;
}

export function normalizeIngredients(value: unknown): MealIngredient[] {
  if (!Array.isArray(value)) {
    throw new RecipeValidationError('Ingredients must be an array');
  }

  return value.map((row, index) => {
    if (!row || typeof row !== 'object') {
      throw new RecipeValidationError(`Ingredient ${index + 1} must be an object`);
    }

    const amount = (row as Record<string, unknown>).amount;
    const ingredient = (row as Record<string, unknown>).ingredient;
    if (typeof amount !== 'string' || typeof ingredient !== 'string') {
      throw new RecipeValidationError(
        `Ingredient ${index + 1} must have text amount and ingredient fields`
      );
    }

    const normalizedIngredient = ingredient.trim();
    if (!normalizedIngredient) {
      throw new RecipeValidationError(`Ingredient ${index + 1} cannot be empty`);
    }

    return {
      amount: amount.trim(),
      ingredient: normalizedIngredient,
    };
  });
}

export function parseRecipeText(value: unknown): ParsedRecipe {
  if (typeof value !== 'string') {
    throw new RecipeValidationError('Recipe text is required');
  }

  let text = value.replace(/\r\n?/g, '\n').trim();
  if (text.length > 50_000) {
    throw new RecipeValidationError('Recipe text is too long');
  }

  const fenced = text.match(/^```[^\n]*\n([\s\S]*?)\n```$/);
  if (fenced) text = fenced[1].trim();

  const lines = text.split('\n');
  let title: string | null = null;
  let description: string | null = null;
  let sawDescription = false;
  let section: 'header' | 'ingredients' | 'instructions' = 'header';
  let sawIngredients = false;
  let sawInstructions = false;
  const ingredientRows: MealIngredient[] = [];
  const instructionLines: string[] = [];

  lines.forEach((line, index) => {
    const trimmed = line.trim();

    if (/^Ingredients:\s*$/i.test(trimmed)) {
      if (sawIngredients || sawInstructions) {
        throw new RecipeValidationError(`Unexpected Ingredients section on line ${index + 1}`);
      }
      sawIngredients = true;
      section = 'ingredients';
      return;
    }

    if (/^Instructions:\s*$/i.test(trimmed)) {
      if (!sawIngredients || sawInstructions) {
        throw new RecipeValidationError(`Unexpected Instructions section on line ${index + 1}`);
      }
      sawInstructions = true;
      section = 'instructions';
      return;
    }

    if (section === 'header') {
      if (!trimmed) return;

      const titleMatch = trimmed.match(/^Title:\s*(.*)$/i);
      if (titleMatch) {
        if (title !== null) {
          throw new RecipeValidationError(`Duplicate Title on line ${index + 1}`);
        }
        title = titleMatch[1].trim();
        return;
      }

      const descriptionMatch = trimmed.match(/^Description:\s*(.*)$/i);
      if (descriptionMatch) {
        if (sawDescription) {
          throw new RecipeValidationError(`Duplicate Description on line ${index + 1}`);
        }
        sawDescription = true;
        description = descriptionMatch[1].trim() || null;
        return;
      }

      throw new RecipeValidationError(`Unexpected header on line ${index + 1}`);
    }

    if (section === 'ingredients') {
      if (!trimmed) return;

      const delimiterIndex = line.indexOf('|');
      if (delimiterIndex === -1) {
        throw new RecipeValidationError(
          `Ingredient ${ingredientRows.length + 1} on line ${index + 1} must use "amount | ingredient"`
        );
      }

      ingredientRows.push({
        amount: line.slice(0, delimiterIndex),
        ingredient: line.slice(delimiterIndex + 1),
      });
      return;
    }

    instructionLines.push(line);
  });

  if (!title) {
    throw new RecipeValidationError('Recipe text must include a non-empty Title');
  }
  if (!sawIngredients) {
    throw new RecipeValidationError('Recipe text must include an Ingredients section');
  }
  if (ingredientRows.length === 0) {
    throw new RecipeValidationError('Recipe text must include at least one ingredient');
  }

  return {
    title,
    description,
    instructions: normalizeInstructions(instructionLines.join('\n')),
    ingredients: normalizeIngredients(ingredientRows),
  };
}
