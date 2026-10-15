import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { planningApi, type WeekPlan } from '../api/planning';
import { selectedWeek, shiftWeek, weekDates, dateLabel } from '../lib/week';

export function WeekPlan() {
  const [params, setParams] = useSearchParams();
  const week = selectedWeek(params.get('week'));
  const [plan, setPlan] = useState<WeekPlan | null>(null);
  const [takeout, setTakeout] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    planningApi.getWeek(week).then(value => {
      if (active) setPlan(value);
    }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [week, reload]);
  const save = useCallback(async (action: () => Promise<WeekPlan>) => {
    setBusy(true); setError('');
    try { setPlan(await action()); return true; } catch (e) { setError(e instanceof Error ? e.message : 'Could not save. Try again.'); return false; }
    finally { setBusy(false); }
  }, []);
  return <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">
    <div className="flex flex-wrap gap-3 items-center justify-between"><h1 className="text-3xl font-bold">Week plan</h1><Link className="btn btn-primary" to={`/shopping?week=${week}`}>Shopping list</Link></div>
    <p className="text-gray-600">Choose a few meals together, leave nights flexible, and shop for what you need.</p>
    <nav className="flex items-center justify-between gap-2" aria-label="Choose week">
      <button className="btn btn-secondary" disabled={busy} onClick={() => setParams({ week: shiftWeek(week, -1) })}>Previous</button>
      <span className="font-semibold text-center">Week of {dateLabel(week)}</span>
      <button className="btn btn-secondary" disabled={busy} onClick={() => setParams({ week: shiftWeek(week, 1) })}>Next</button>
    </nav>
    {error && <div role="alert" className="card text-red-700">{error} <button className="underline" onClick={() => setReload(value => value + 1)} disabled={busy}>Retry loading</button></div>}
    {loading ? <p role="status">Loading your week…</p> : plan && <>
      <section className="space-y-3" aria-label="Planned meals">
        <h2 className="text-xl font-bold">On the menu</h2>
        {plan.entries.length === 0 && <p className="text-gray-600">No meals agreed yet. Start a vote, add favorites from the results, or plan a meal from your library.</p>}
        {plan.entries.map(entry => <article className="card space-y-3" key={entry.id}>
          <div className="flex gap-3 items-start justify-between"><div><p className="text-sm text-gray-500">{entry.kind === 'takeout' ? 'Takeout night' : 'Home cooking'}</p><h3 className="text-xl font-semibold">{entry.title}</h3></div><button className="text-red-700 underline py-2" disabled={busy} aria-label={`Remove ${entry.title}`} onClick={() => save(() => planningApi.removeEntry(week, entry.id))}>Remove</button></div>
          <div className="flex flex-wrap gap-3 items-center"><label className="flex-1 min-w-40">Night<select className="input mt-1" aria-label={`Night for ${entry.title}`} value={entry.date ?? ''} disabled={busy} onChange={e => save(() => planningApi.updateEntry(week, entry.id, { date: e.target.value || null }))}><option value="">Flexible / undecided</option>{weekDates(week).map(date => <option key={date} value={date}>{dateLabel(date)}</option>)}</select></label>
          {entry.kind === 'home' && entry.mealId && <Link className="btn btn-primary mt-5" to={`/cook/${entry.mealId}?week=${week}`}>Cook recipe</Link>}</div>
        </article>)}
      </section>
      <section className="card space-y-3" aria-label="Choose together">
        <h2 className="text-xl font-bold">Decide what goes on the menu</h2>
        <p className="text-gray-600">Vote on your options, then use "Add to this week" on the results you agree on. Adding a recipe also adds its ingredients to shopping.</p>
        <Link className="btn btn-primary inline-flex min-h-12 items-center" to={`/dashboard?week=${week}`}>Start a vote or view results</Link>
        <p className="text-sm text-gray-600">Planning solo? Open your library and explicitly add a recipe to this week.</p>
      </section>
      <form className="card space-y-3" onSubmit={async e => { e.preventDefault(); if (await save(() => planningApi.addEntry(week, { kind: 'takeout', title: takeout }))) setTakeout(''); }}><h2 className="text-xl font-bold">Plan a takeout night</h2>
        <label className="block">What sounds good?<input className="input mt-1" maxLength={200} value={takeout} onChange={e => setTakeout(e.target.value)} placeholder="Pizza, Thai, or decide later" required disabled={busy}/></label>
        <button className="btn btn-secondary" disabled={busy || !takeout.trim()}>Add takeout night</button>
      </form>
    </>}
    <Link className="underline inline-block" to={`/dashboard?week=${week}`}>Open library & votes</Link>
  </main>;
}
