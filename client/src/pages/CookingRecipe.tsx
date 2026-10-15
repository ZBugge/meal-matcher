import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { mealsApi, type Meal } from '../api/client';
import { selectedWeek } from '../lib/week';
export function CookingRecipe() {
  const { mealId } = useParams();
  const [params] = useSearchParams();
  const week = selectedWeek(params.get('week'));
  const [meal, setMeal] = useState<Meal | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true); setError(''); setMeal(null);
    if (!mealId) { setError('Recipe not found.'); setLoading(false); return; }
    mealsApi.get(mealId).then(value => { if (active) { if (value.type === 'meal') setMeal(value); else setError('Choose a home recipe to cook.'); } }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [mealId, reload]);
  return <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">
    <div className="flex flex-wrap gap-4"><Link className="btn btn-secondary" to={`/week?week=${week}`}>Back to week plan</Link><Link className="btn btn-secondary" to="/dashboard">My Meals</Link></div>
    {loading && <p role="status">Opening recipe…</p>}
    {error && <div role="alert" className="card text-red-700">{error} <button className="underline" onClick={() => setReload(value => value + 1)}>Retry</button></div>}
    {meal && <><h1 className="text-4xl font-bold break-words">{meal.title}</h1>{meal.description && <p className="text-xl">{meal.description}</p>}
      <section className="card space-y-3"><h2 className="text-2xl font-bold">Ingredients</h2>{meal.ingredients?.length ? <ul className="space-y-4 text-xl">{meal.ingredients.map((row, index) => <li key={index}><label className="flex gap-3 items-start"><input type="checkbox" className="w-6 h-6 mt-1 shrink-0"/><span>{row.amount} {row.ingredient}</span></label></li>)}</ul> : <p>No ingredients saved yet. Edit this recipe in My Meals to add them.</p>}</section>
      <section className="card space-y-3"><h2 className="text-2xl font-bold">Instructions</h2><p className="text-xl leading-relaxed whitespace-pre-wrap break-words">{meal.instructions || 'No instructions saved yet. Edit this recipe in My Meals to add them.'}</p></section>
      {meal.notes && <section className="card"><h2 className="text-2xl font-bold mb-3">Your notes</h2><p className="text-xl whitespace-pre-wrap break-words">{meal.notes}</p></section>}
    </>}
  </main>;
}
