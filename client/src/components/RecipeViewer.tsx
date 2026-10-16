import { Meal } from '../api/client';
import { ModalSheet } from './ModalSheet';
interface RecipeViewerProps { meal: Meal; onClose: () => void }
export default function RecipeViewer({ meal, onClose }: RecipeViewerProps) {
  const hasIngredients = (meal.ingredients?.length ?? 0) > 0;
  const hasInstructions = Boolean(meal.instructions?.trim());
  return <ModalSheet title={meal.title} onClose={onClose}><p className="eyebrow">Recipe</p>{meal.description && <p className="text-muted">{meal.description}</p>}
    {(meal.totalMinutes != null || meal.effort) && <p className="text-muted">{[meal.totalMinutes != null ? `${meal.totalMinutes} min` : '', meal.effort ? `${meal.effort[0].toUpperCase()}${meal.effort.slice(1)} effort` : ''].filter(Boolean).join(' · ')}</p>}
    {!hasIngredients && !hasInstructions ? <p className="bg-primary-50 p-4 rounded-xl">No recipe details have been added yet.</p> : <div className="space-y-6">{hasIngredients && <section><h3 className="text-xl font-semibold">Ingredients</h3><ul className="divide-y divide-stone-200 mt-3">{meal.ingredients?.map((row, index) => <li key={index} className="py-3 space-y-1"><span className="block font-medium">{row.ingredient}</span><span className="block text-muted whitespace-pre-wrap">{row.amount}</span></li>)}</ul></section>}{hasInstructions && <section><h3 className="text-xl font-semibold">Instructions</h3><p className="mt-3 whitespace-pre-wrap leading-relaxed">{meal.instructions}</p></section>}</div>}
    {meal.notes && <section><h3 className="text-xl font-semibold">Your notes</h3><p className="mt-3 whitespace-pre-wrap">{meal.notes}</p></section>}<button type="button" className="btn btn-secondary w-full" onClick={onClose}>Close recipe</button>
  </ModalSheet>;
}
