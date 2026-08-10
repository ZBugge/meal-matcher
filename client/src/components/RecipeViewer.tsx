import { Meal } from '../api/client';

interface RecipeViewerProps {
  meal: Meal;
  onClose: () => void;
}

export default function RecipeViewer({ meal, onClose }: RecipeViewerProps) {
  const hasIngredients = (meal.ingredients?.length ?? 0) > 0;
  const hasInstructions = Boolean(meal.instructions?.trim());

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <article
        role="dialog"
        aria-modal="true"
        aria-labelledby="recipe-viewer-title"
        className="card max-h-[90vh] w-full max-w-2xl overflow-y-auto"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-primary-600">Recipe</p>
            <h2 id="recipe-viewer-title" className="text-2xl font-bold">
              {meal.title}
            </h2>
            {meal.description && (
              <p className="mt-1 text-gray-600">{meal.description}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close recipe"
            className="rounded p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {!hasIngredients && !hasInstructions ? (
          <p className="mt-6 rounded-lg bg-gray-50 p-4 text-gray-600">
            No recipe details have been added yet.
          </p>
        ) : (
          <div className="mt-6 space-y-8">
            {hasIngredients && (
              <section>
                <h3 className="text-lg font-bold">Ingredients</h3>
                <ul className="mt-3 divide-y divide-gray-200 rounded-lg border border-gray-200">
                  {meal.ingredients?.map((row, index) => (
                    <li key={`${row.amount}-${row.ingredient}-${index}`} className="flex gap-4 px-4 py-3">
                      <span className="w-28 shrink-0 font-medium text-gray-700">{row.amount}</span>
                      <span className="text-gray-900">{row.ingredient}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {hasInstructions && (
              <section>
                <h3 className="text-lg font-bold">Instructions</h3>
                <p className="mt-3 whitespace-pre-wrap text-gray-800">{meal.instructions}</p>
              </section>
            )}
          </div>
        )}
      </article>
    </div>
  );
}
