import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { planningApi, type WeekPlan, type PlanEntry, type DinnerStaple } from '../api/planning';
import { mealsApi, type Meal } from '../api/client';
import { currentWeekStart, selectedWeek, shiftWeek, weekDates, dateLabel } from '../lib/week';

export function WeekPlan() {
  const [params] = useSearchParams();
  const week = selectedWeek(params.get('week'));
  return <WeekPlanContent key={week} week={week} />;
}

function RemoveDinnerDialog({ entry, busy, error, cancel, remove }: { entry: PlanEntry; busy: boolean; error: string; cancel: () => void; remove: (keep: boolean) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  useEffect(() => {
    const element = dialog.current!;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    element.showModal();
    cancelButton.current?.focus({ preventScroll: true });
    document.body.style.overflow = 'hidden';
    return () => {
      element.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);
  return <dialog ref={dialog} aria-labelledby={titleId} aria-modal="true" className="fixed inset-0 m-auto max-w-lg rounded-2xl p-5 backdrop:bg-black/50" style={{ width: 'calc(100% - 2rem)', maxHeight: 'calc(100dvh - 2rem)', overflowY: 'auto' }} onCancel={event => { event.preventDefault(); if (!busy) cancel(); }}>
    <div className="space-y-4"><h2 id={titleId} className="text-xl font-bold">Remove {entry.title}?</h2><p>Unpurchased groceries from this dinner will be removed unless you keep them. Purchased groceries always stay as standalone items.</p>
      {error && <p role="alert" className="text-red-700">{error}</p>}
      <div className="flex flex-col gap-3"><button className="btn btn-secondary min-h-12" disabled={busy} onClick={() => remove(true)}>Keep groceries</button><button className="btn btn-primary min-h-12" disabled={busy} onClick={() => remove(false)}>Remove dinner and unpurchased groceries</button><button ref={cancelButton} className="btn btn-secondary min-h-12" disabled={busy} onClick={cancel}>Cancel removal</button></div>
    </div>
  </dialog>;
}

function WeekPlanContent({ week }: { week: string }) {
  const [, setParams] = useSearchParams();
  const [plan, setPlan] = useState<WeekPlan | null>(null);
  const [picker, setPicker] = useState(false);
  const [library, setLibrary] = useState<Meal[]>([]);
  const [pickerSlot, setPickerSlot] = useState('');
  const [search, setSearch] = useState('');
  const [addDate, setAddDate] = useState('');
  const [staples, setStaples] = useState<DinnerStaple[]>([]);
  const [stapleTitle, setStapleTitle] = useState('');
  const [editStaple, setEditStaple] = useState<string | undefined>();
  const [removing, setRemoving] = useState<PlanEntry | null>(null);
  const [repeating, setRepeating] = useState(false);
  const [repeatIds, setRepeatIds] = useState<string[]>([]);
  const [targetWeek, setTargetWeek] = useState(shiftWeek(week, 1));
  const [repeatNotice, setRepeatNotice] = useState('');
  const now = new Date();
  const today = weekDates(currentWeekStart(now))[(now.getDay() + 6) % 7];
  const current = week === currentWeekStart(now);
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
  useEffect(() => {
    let active = true;
    planningApi.staples(week).then(value => { if (active) setStaples(value); }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [week, reload]);
  useEffect(() => {
    if (!picker) return;
    let active = true;
    mealsApi.list('meal').then(value => { if (active) setLibrary(value); }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [picker]);
  const save = useCallback(async (action: () => Promise<WeekPlan>) => {
    setBusy(true); setError('');
    try { setPlan(await action()); return true; } catch (e) { setError(e instanceof Error ? e.message : 'Could not save. Try again.'); return false; }
    finally { setBusy(false); }
  }, []);
  function openPicker(date: string, query = '') { setPickerSlot(''); setAddDate(date); setSearch(query); setPicker(true); }
  async function changeStaple(action: () => Promise<unknown>) {
    setBusy(true); setError('');
    try { await action(); setStaples(await planningApi.staples(week)); return true; }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not save staple.'); return false; }
    finally { setBusy(false); }
  }
  function renderEntry(entry: PlanEntry) {
    return <article className="card space-y-3" key={entry.id}>
      <div className="flex gap-3 items-start justify-between"><div><p className="text-sm text-gray-500">{entry.kind === 'takeout' ? 'Takeout night' : 'Home cooking'}</p><h3 className="text-xl font-semibold">{entry.title}</h3></div><button className="text-red-700 underline py-2" disabled={busy} aria-label={`Remove ${entry.title}`} onClick={() => setRemoving(entry)}>Remove</button></div>
      <div className="flex flex-wrap gap-3 items-center"><label className="flex-1 min-w-40">Night<select className="input mt-1" aria-label={`Night for ${entry.title}`} value={entry.date ?? ''} disabled={busy} onChange={e => save(() => planningApi.updateEntry(week, entry.id, { date: e.target.value || null }))}><option value="">Flexible / undecided</option>{weekDates(week).map(date => <option key={date} value={date}>{dateLabel(date)}</option>)}</select></label>
      {entry.kind === 'home' && entry.mealId && <Link className="btn btn-primary mt-5" to={`/cook/${entry.mealId}?week=${week}`}>Cook recipe</Link>}
      {current && !entry.date && <button className="btn btn-secondary" disabled={busy} onClick={() => save(() => planningApi.updateEntry(week, entry.id, { date: today }))}>Make {entry.title} tonight</button>}</div>
    </article>;
  }
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
      {current && <section className="card space-y-3" aria-label="Tonight"><h2 className="text-2xl font-bold">Tonight</h2>
        {plan.entries.filter(entry => entry.date === today).map(renderEntry)}
        {!plan.entries.some(entry => entry.date === today) && <><p>Nothing scheduled tonight. Choose a flexible meal below or add a recipe.</p><button className="btn btn-primary" disabled={busy} onClick={() => openPicker(today)}>Add meal for tonight</button></>}
      </section>}
      <section className="space-y-3" aria-label="Planned meals"><div className="flex justify-between items-center gap-3"><h2 className="text-xl font-bold">On the menu</h2><button className="btn btn-primary" disabled={busy} onClick={() => openPicker('')}>Add meal</button></div>
        {!plan.entries.length && <p>No meals agreed yet. Add a favorite or choose together.</p>}
        {weekDates(week).map(date => <section className="rounded-xl border border-gray-200 p-3 space-y-3" key={date} aria-label={dateLabel(date)}><h3 className="font-bold">{dateLabel(date)}</h3>
          {current && date === today ? <p className="text-sm text-gray-500">See Tonight above.</p> : plan.entries.filter(entry => entry.date === date).map(renderEntry)}
          {!plan.entries.some(entry => entry.date === date) && <button className="underline py-2" disabled={busy} onClick={() => openPicker(date)}>Leave open or add meal</button>}
        </section>)}
        <section className="space-y-3" aria-label="Flexible meals"><h3 className="font-bold">Flexible meals</h3>{plan.entries.filter(entry => !entry.date).map(renderEntry)}{!plan.entries.some(entry => !entry.date) && <p className="text-gray-500">Room for a change of plans.</p>}</section>
      </section>
      {picker && <section role="dialog" aria-label="Add meal" className="card space-y-3"><h2 className="text-xl font-bold">Choose a saved recipe</h2>{pickerSlot && <p>Choose this week's recipe for {pickerSlot}.</p>}<label className="block">Search recipes<input autoFocus className="input" value={search} onChange={e => setSearch(e.target.value)}/></label>
        <label className="block">Add meal on<select className="input" value={addDate} onChange={e => setAddDate(e.target.value)}><option value="">Flexible / undecided</option>{weekDates(week).map(date => <option key={date} value={date}>{dateLabel(date)}</option>)}</select></label>
        <ul className="max-h-64 overflow-auto space-y-2">{library.filter(meal => meal.title.toLowerCase().includes(search.toLowerCase())).map(meal => <li key={meal.id}><button className="btn btn-secondary w-full text-left" disabled={busy} onClick={async () => { if (await save(() => planningApi.addEntry(week, { mealId: meal.id, date: addDate || null }))) setPicker(false); }}>Add {meal.title}</button></li>)}</ul>
        {!library.length ? <p>Save recipes in your library first.</p> : !library.some(meal => meal.title.toLowerCase().includes(search.toLowerCase())) && <p>No recipes match. Try a different search.</p>}<button className="btn btn-secondary" onClick={() => setPicker(false)} disabled={busy}>Close picker</button>
      </section>}
      {removing && <RemoveDinnerDialog entry={removing} busy={busy} error={error} cancel={() => setRemoving(null)} remove={async keep => { if (await save(() => planningApi.removeEntry(week, removing.id, keep))) setRemoving(null); }} />}
      <details className="card space-y-3"><summary className="text-xl font-bold cursor-pointer">Weekly dinner staples</summary><p>Reusable dinner ideas. Choose an actual recipe each week; groceries are added only after your choice.</p>
        {staples.map(staple => <div key={staple.id} className="border-b py-2 space-y-2"><h3 className="font-semibold">{staple.title}</h3><div className="flex flex-wrap gap-3"><button className="btn btn-secondary" disabled={busy} onClick={() => { openPicker(''); setPickerSlot(staple.title); }}>Choose recipe for {staple.title}</button><button className="underline" disabled={busy} onClick={() => { setStapleTitle(staple.title); setEditStaple(staple.id); }}>Edit {staple.title}</button><button className="underline text-red-700" disabled={busy} onClick={() => changeStaple(() => planningApi.removeStaple(week, staple.id))}>Remove staple {staple.title}</button></div></div>)}
        {!staples.length && <div className="space-y-2"><p>Starter ideas: save either dinner slot or name your own.</p><div className="flex flex-wrap gap-3"><button className="btn btn-secondary" disabled={busy} onClick={() => setStapleTitle('Salmon night')}>Use salmon starter</button><button className="btn btn-secondary" disabled={busy} onClick={() => setStapleTitle('Asian tofu night')}>Use tofu starter</button></div></div>}
        <form className="space-y-2" onSubmit={async e => { e.preventDefault(); if (await changeStaple(() => planningApi.saveStaple(week, stapleTitle, editStaple))) { setStapleTitle(''); setEditStaple(undefined); } }}><label className="block">Dinner staple name<input className="input" maxLength={100} value={stapleTitle} onChange={e => setStapleTitle(e.target.value)} required disabled={busy}/></label><button className="btn btn-secondary" disabled={busy || !stapleTitle.trim()}>{editStaple ? 'Save staple' : 'Add dinner staple'}</button>{editStaple && <button type="button" className="underline ml-3" onClick={() => { setEditStaple(undefined); setStapleTitle(''); }}>Cancel edit</button>}</form>
      </details>
      <details className="card space-y-3"><summary className="text-xl font-bold cursor-pointer">Repeat a week</summary><p>Copy selected dinners into another week. Existing plans stay, dates shift by weekday, and groceries start needed.</p><button className="btn btn-secondary" disabled={busy || !plan.entries.length} onClick={() => { setRepeating(!repeating); setRepeatIds(plan.entries.map(entry => entry.id)); setTargetWeek(shiftWeek(week, 1)); setRepeatNotice(''); }}>Choose meals to repeat</button>
        {repeating && <form className="space-y-3" onSubmit={async e => { e.preventDefault(); setBusy(true); setError(''); try { await planningApi.repeat(week, targetWeek, repeatIds); setRepeating(false); setRepeatNotice(targetWeek); } catch (e) { setError(e instanceof Error ? e.message : 'Could not repeat meals.'); } finally { setBusy(false); } }}>
          {plan.entries.map(entry => <label className="flex gap-3 py-2" key={entry.id}><input type="checkbox" checked={repeatIds.includes(entry.id)} disabled={busy} onChange={e => setRepeatIds(ids => e.target.checked ? [...ids, entry.id] : ids.filter(id => id !== entry.id))}/>{entry.title} / {entry.date ? dateLabel(entry.date) : 'Flexible'}</label>)}
          <label className="block">Target Monday<input className="input" type="date" value={targetWeek} disabled={busy} onChange={e => setTargetWeek(e.target.value)} required/></label><button className="btn btn-primary" disabled={busy || !repeatIds.length}>Repeat selected meals</button>
        </form>}{repeatNotice && <p role="status">Meals repeated. <Link className="underline" to={`/week?week=${repeatNotice}`}>View repeated week</Link></p>}
      </details>
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
