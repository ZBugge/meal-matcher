import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { planningApi } from '../api/planning';
import { selectedWeek } from '../lib/week';

export function AddToWeek({ mealId, title }: { mealId: string; title: string }) {
  const [params] = useSearchParams();
  const week = selectedWeek(params.get('week'));
  return <AddToWeekTarget key={`${week}:${mealId}`} mealId={mealId} title={title} week={week} />;
}

function AddToWeekTarget({ mealId, title, week }: { mealId: string; title: string; week: string }) {
  const [state, setState] = useState<'idle' | 'saving' | 'added'>('idle');
  const [error, setError] = useState('');
  async function add() {
    if (state !== 'idle') return;
    setState('saving');
    setError('');
    try {
      await planningApi.addEntry(week, { mealId });
      setState('added');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add this meal. Please retry.');
      setState('idle');
    }
  }
  return <div className="mt-3">
    {state === 'added' ? <Link to={`/week?week=${week}`} className="inline-flex min-h-12 items-center text-sm font-semibold text-primary-700 underline">Added · View week</Link>
      : <button type="button" onClick={add} disabled={state === 'saving'} aria-label={`Add ${title} to this week`} className="btn btn-secondary text-sm">{state === 'saving' ? 'Adding…' : 'Add to this week'}</button>}
    {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
  </div>;
}
