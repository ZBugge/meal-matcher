import { RecipeIngredient } from '../api/client';

interface RecipeFieldsProps {
  instructions: string;
  ingredients: RecipeIngredient[];
  onInstructionsChange: (value: string) => void;
  onIngredientsChange: (value: RecipeIngredient[]) => void;
}

export default function RecipeFields({
  instructions,
  ingredients,
  onInstructionsChange,
  onIngredientsChange,
}: RecipeFieldsProps) {
  const updateIngredient = (
    index: number,
    field: keyof RecipeIngredient,
    value: string
  ) => {
    onIngredientsChange(
      ingredients.map((row, rowIndex) =>
        rowIndex === index ? { ...row, [field]: value } : row
      )
    );
  };

  const moveIngredient = (index: number, offset: -1 | 1) => {
    const destination = index + offset;
    if (destination < 0 || destination >= ingredients.length) return;

    const reordered = [...ingredients];
    [reordered[index], reordered[destination]] = [reordered[destination], reordered[index]];
    onIngredientsChange(reordered);
  };

  return (
    <fieldset className="space-y-4 border-t border-gray-200 pt-4">
      <legend className="font-semibold text-gray-900">Recipe (optional)</legend>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Instructions
        </label>
        <textarea
          value={instructions}
          onChange={(event) => onInstructionsChange(event.target.value)}
          className="input"
          rows={4}
          placeholder="Describe how to make this meal"
        />
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700">Ingredients</span>
          <button
            type="button"
            onClick={() => onIngredientsChange([...ingredients, { amount: '', ingredient: '' }])}
            className="text-sm font-medium text-primary-600 hover:text-primary-700"
          >
            Add ingredient
          </button>
        </div>

        {ingredients.length === 0 ? (
          <p className="text-sm text-gray-500">No ingredients added.</p>
        ) : (
          <div className="space-y-2">
            {ingredients.map((row, index) => (
              <div key={index} className="grid grid-cols-[minmax(0,0.35fr)_minmax(0,1fr)_auto] gap-2 items-center">
                <input
                  type="text"
                  value={row.amount}
                  onChange={(event) => updateIngredient(index, 'amount', event.target.value)}
                  className="input"
                  placeholder="Amount"
                  aria-label={`Ingredient ${index + 1} amount`}
                />
                <input
                  type="text"
                  value={row.ingredient}
                  onChange={(event) => updateIngredient(index, 'ingredient', event.target.value)}
                  className="input"
                  placeholder="Ingredient"
                  aria-label={`Ingredient ${index + 1} name`}
                  required
                />
                <div className="flex">
                  <button
                    type="button"
                    onClick={() => moveIngredient(index, -1)}
                    disabled={index === 0}
                    className="p-1 text-gray-500 disabled:text-gray-300"
                    aria-label={`Move ingredient ${index + 1} up`}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => moveIngredient(index, 1)}
                    disabled={index === ingredients.length - 1}
                    className="p-1 text-gray-500 disabled:text-gray-300"
                    aria-label={`Move ingredient ${index + 1} down`}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => onIngredientsChange(ingredients.filter((_, rowIndex) => rowIndex !== index))}
                    className="p-1 text-red-500"
                    aria-label={`Remove ingredient ${index + 1}`}
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </fieldset>
  );
}
