import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { planningApi, type WeekPlan as Plan, type PlanEntry, type DinnerStaple } from '../api/planning';
import { mealsApi, type Meal } from '../api/client';
import { currentWeekStart, selectedWeek, shiftWeek, weekDates, dateLabel } from '../lib/week';
import { ModalSheet } from '../components/ModalSheet';

export function WeekPlan() {
  const [params] = useSearchParams();
  const week = selectedWeek(params.get('week'));
  return <WeekPlanContent key={week} week={week} />;
}

type Sheet = 'add' | 'recipe' | 'takeout' | 'tools' | 'staples' | 'repeat' | null;

function WeekPlanContent({ week }: { week: string }) {
  const [, setParams] = useSearchParams();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [library, setLibrary] = useState<Meal[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryError, setLibraryError] = useState('');
  const [libraryReload, setLibraryReload] = useState(0);
  const [pickerSlot, setPickerSlot] = useState('');
  const [search, setSearch] = useState('');
  const [addDate, setAddDate] = useState('');
  const [staples, setStaples] = useState<DinnerStaple[]>([]);
  const [stapleTitle, setStapleTitle] = useState('');
  const [editStaple, setEditStaple] = useState<string | undefined>();
  const [detail, setDetail] = useState<PlanEntry | null>(null);
  const [detailDate, setDetailDate] = useState('');
  const [removing, setRemoving] = useState(false);
  const [repeatIds, setRepeatIds] = useState<string[]>([]);
  const [targetWeek, setTargetWeek] = useState(shiftWeek(week, 1));
  const [repeatNotice, setRepeatNotice] = useState('');
  const [takeout, setTakeout] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [reload, setReload] = useState(0);
  const now = new Date();
  const today = weekDates(currentWeekStart(now))[(now.getDay() + 6) % 7];
  const current = week === currentWeekStart(now);
  const dates = weekDates(week);
  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    planningApi.getWeek(week).then(value => { if (active) setPlan(value); }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [week, reload]);
  useEffect(() => {
    let active = true;
    planningApi.staples(week).then(value => { if (active) setStaples(value); }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [week, reload]);
  useEffect(() => {
    if (sheet !== 'recipe') return;
    let active = true;
    setLibraryLoading(true); setLibraryError('');
    mealsApi.list('meal').then(value => { if (active) setLibrary(value); }).catch(e => { if (active) setLibraryError(e.message); }).finally(() => { if (active) setLibraryLoading(false); });
    return () => { active = false; };
  }, [sheet, libraryReload]);
  const save = useCallback(async (action: () => Promise<Plan>, message: string) => {
    setBusy(true); setError(''); setNotice('');
    try { setPlan(await action()); setNotice(message); return true; }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not save. Try again.'); return false; }
    finally { setBusy(false); }
  }, []);
  function openAdd(date: string) { setAddDate(date); setSearch(''); setPickerSlot(''); setError(''); setSheet('add'); }
  function openDetail(entry: PlanEntry) { setDetail(entry); setDetailDate(entry.date ?? ''); setError(''); }
  async function changeStaple(action: () => Promise<unknown>) {
    setBusy(true); setError('');
    try { await action(); setStaples(await planningApi.staples(week)); return true; }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not save dinner idea.'); return false; }
    finally { setBusy(false); }
  }
  const dateField = (value: string, onChange: (value: string) => void, label: string) => <label className="block space-y-2"><span className="font-medium">{label}</span><select className="input" value={value} disabled={busy} onChange={e => onChange(e.target.value)}><option value="">Flexible / undecided</option>{dates.map(date => <option key={date} value={date}>{dateLabel(date)}</option>)}</select></label>;
  const entryButton = (entry: PlanEntry, tonight = false) => <button key={entry.id} className={`w-full text-left min-h-12 flex items-center justify-between gap-3 py-3 ${tonight ? '' : 'border-b border-stone-200'}`} onClick={() => openDetail(entry)} disabled={busy}><span className="min-w-0"><span className={`block ${tonight ? 'dinner-title text-3xl' : 'font-semibold'}`}>{entry.title}</span><span className="block text-sm text-muted mt-1">{entry.kind === 'takeout' ? 'Takeout night' : 'Home cooking'}</span></span><span aria-hidden="true" className="text-primary-600 text-xl">→</span></button>;
  const matches = library.filter(meal => meal.title.toLowerCase().includes(search.toLowerCase()));
  const errorMessage = error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-800">{error}</p>;
  const closeSheet = () => { setSheet(null); setError(''); };
  const sheetTitle = { add: 'Add dinner', recipe: 'Choose a saved recipe', takeout: 'Plan a takeout night', tools: 'Week tools', staples: 'Usual dinner ideas', repeat: 'Repeat a week' };
  return <main className="family-page">
    <div className="flex items-start justify-between gap-3"><div><p className="eyebrow">Your family kitchen</p><h1 className="page-title mt-1">Week plan</h1></div><button className="btn btn-secondary" onClick={() => { setError(''); setSheet('tools'); }} disabled={busy}>Week tools</button></div>
    <nav className="flex items-center justify-between gap-2 border-y border-stone-200 py-3" aria-label="Choose week"><button className="icon-button" aria-label="Previous week" disabled={busy} onClick={() => setParams({ week: shiftWeek(week, -1) })}>‹</button><div className="text-center"><span className="block text-xs text-muted">{current ? 'This week' : 'Selected week'}</span><span className="font-semibold">{dateLabel(week)} – {new Date(`${dates[6]}T12:00:00`).getDate()}</span></div><button className="icon-button" aria-label="Next week" disabled={busy} onClick={() => setParams({ week: shiftWeek(week, 1) })}>›</button></nav>
    {!sheet && !detail && error && <div>{errorMessage}<button className="btn btn-secondary mt-2" onClick={() => setReload(value => value + 1)} disabled={busy}>Retry loading</button></div>}
    {notice && <p role="status" className="text-primary-700">{notice}</p>}
    {loading ? <p role="status">Loading your week…</p> : plan && <>
      {current && <section className="tonight rounded-3xl bg-primary-600 text-white p-5" aria-label="Tonight"><p className="eyebrow">{dateLabel(today)}</p><h2 className="text-lg font-semibold mt-1">Tonight</h2>{plan.entries.filter(entry => entry.date === today).map(entry => entryButton(entry, true))}{!plan.entries.some(entry => entry.date === today) && <><p className="dinner-title text-2xl my-3">A little room for inspiration.</p><p className="text-muted mb-4">Choose a flexible meal below or add a dinner.</p><button className="btn btn-primary" disabled={busy} onClick={() => openAdd(today)}>Add meal for tonight</button></>}</section>}
      <section aria-label="Choose together"><Link className="menu-action" to={`/dashboard?week=${week}`}><span><span className="block">Choose together</span><span className="block font-normal text-sm text-muted mt-1">Start a vote or view results</span></span><span aria-hidden="true">→</span></Link></section><section aria-label="Planned meals"><div className="flex items-center justify-between gap-3 mb-3"><h2 className="text-xl font-semibold">On the menu</h2><button className="btn btn-primary" disabled={busy} onClick={() => openAdd('')}>Add dinner</button></div>
        {!plan.entries.length && <p className="text-muted py-3">No meals agreed yet. Add a favorite or choose together.</p>}
        {dates.map(date => <section key={date} className="flex gap-3 py-3 border-t border-stone-200" aria-label={dateLabel(date)}><div className="w-14 shrink-0 pt-3"><h3 className="text-xs uppercase font-semibold text-muted">{new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short' })}</h3><span className="text-xl">{new Date(`${date}T12:00:00`).getDate()}</span></div><div className="flex-1 min-w-0">{plan.entries.filter(entry => entry.date === date).map(entry => entryButton(entry))}{!plan.entries.some(entry => entry.date === date) && <button className="text-muted min-h-12 w-full text-left" disabled={busy} onClick={() => openAdd(date)}>Open night <span className="float-right" aria-hidden="true">+</span></button>}{plan.entries.some(entry => entry.date === date) && <button className="text-sm text-primary-700 min-h-11 px-1" aria-label={`Add another dinner on ${dateLabel(date)}`} disabled={busy} onClick={() => openAdd(date)}>+ Add another</button>}</div></section>)}
        <section aria-label="Flexible meals" className="border-t border-stone-200 pt-4"><h3 className="font-semibold">Flexible meals</h3><p className="text-sm text-muted mb-2">Good ideas without a fixed night.</p>{plan.entries.filter(entry => !entry.date).map(entry => entryButton(entry))}{!plan.entries.some(entry => !entry.date) && <p className="text-muted py-3">Room for a change of plans.</p>}</section>
      </section>
      <p className="text-sm text-muted">Usual dinner ideas and Repeat a week are in Week tools.</p>
      <Link className="btn btn-secondary w-full" to={`/shopping?week=${week}`}>Open shopping list</Link>
    </>}
    {sheet && <ModalSheet title={sheetTitle[sheet]} busy={busy} onClose={closeSheet}>{errorMessage}
      {sheet === 'add' && <><p className="text-muted">{addDate ? `For ${dateLabel(addDate)}. You can change the night before adding.` : 'Pick a night or leave dinner flexible.'}</p><button className="menu-action" onClick={() => setSheet('recipe')}>Saved recipe <span aria-hidden="true">→</span></button><button className="menu-action" onClick={() => setSheet('takeout')}>Takeout night <span aria-hidden="true">→</span></button><Link className="menu-action" to={`/dashboard?week=${week}`}>Choose together <span aria-hidden="true">→</span></Link></>}
      {sheet === 'recipe' && <>{pickerSlot && <p>Choose this week's recipe for {pickerSlot}.</p>}<label className="block space-y-2"><span>Search recipes</span><input className="input" value={search} onChange={e => setSearch(e.target.value)} placeholder="Find a saved recipe" /></label>{dateField(addDate, setAddDate, 'Add meal on')}<p className="text-sm text-muted">Adding a recipe adds its ingredient snapshot to this week's shopping.</p>{libraryLoading ? <p role="status">Loading saved recipes…</p> : libraryError ? <div role="alert"><p>{libraryError}</p><button className="btn btn-secondary" onClick={() => setLibraryReload(value => value + 1)}>Retry recipes</button></div> : <><ul>{matches.map(meal => <li key={meal.id}><button className="menu-action" disabled={busy} onClick={async () => { if (await save(() => planningApi.addEntry(week, { mealId: meal.id, date: addDate || null }), `${meal.title} added to your week.`)) setSheet(null); }}><span>{meal.title}</span><span aria-hidden="true">+</span></button></li>)}</ul>{!library.length ? <p>Save recipes in your <Link className="underline inline-flex min-h-11 items-center" to={`/recipes?week=${week}`}>recipe library</Link> first.</p> : !matches.length && <p>No recipes match. Try a different search.</p>}</>}<button className="btn btn-secondary" onClick={() => setSheet('add')} disabled={busy}>Back to Add dinner</button></>}
      {sheet === 'takeout' && <form className="space-y-4" onSubmit={async e => { e.preventDefault(); if (await save(() => planningApi.addEntry(week, { kind: 'takeout', title: takeout, date: addDate || null }), 'Takeout night added.')) { setTakeout(''); setSheet(null); } }}><label className="block space-y-2"><span>What sounds good?</span><input className="input" value={takeout} maxLength={200} required disabled={busy} onChange={e => setTakeout(e.target.value)} placeholder="Pizza, Thai, or decide later" /></label>{dateField(addDate, setAddDate, 'Dinner on')}<button className="btn btn-primary w-full" disabled={busy || !takeout.trim()}>Add takeout night</button><button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setSheet('add')}>Back to Add dinner</button></form>}
      {sheet === 'tools' && <><button className="menu-action" disabled={busy} onClick={() => setSheet('staples')}><span>Usual dinner ideas<span className="block text-sm text-muted font-normal">Your weekly dinner staples</span></span><span aria-hidden="true">→</span></button><button className="menu-action" disabled={busy || !plan?.entries.length} onClick={() => { setRepeatIds(plan!.entries.map(entry => entry.id)); setTargetWeek(shiftWeek(week, 1)); setRepeatNotice(''); setSheet('repeat'); }}>Repeat a week <span aria-hidden="true">→</span></button><Link className="menu-action" to={`/dashboard?week=${week}`}>Previous votes & results <span aria-hidden="true">→</span></Link></>}
      {sheet === 'staples' && <><p className="text-muted">Reusable dinner ideas. Choose an actual recipe each week; groceries are added only after your choice.</p>{staples.map(staple => <div key={staple.id} className="border-b border-stone-200 py-3 space-y-2"><h3 className="font-semibold">{staple.title}</h3><button className="btn btn-secondary w-full" disabled={busy} onClick={() => { setAddDate(''); setSearch(''); setPickerSlot(staple.title); setSheet('recipe'); }}>Choose recipe for {staple.title}</button><div className="flex gap-3"><button className="btn btn-secondary" disabled={busy} onClick={() => { setStapleTitle(staple.title); setEditStaple(staple.id); }}>Edit {staple.title}</button><button className="btn text-red-700" disabled={busy} onClick={() => changeStaple(() => planningApi.removeStaple(week, staple.id))}>Remove staple {staple.title}</button></div></div>)}{!staples.length && <div className="space-y-3"><p>Start with a familiar idea or name your own.</p><button className="btn btn-secondary mr-2" disabled={busy} onClick={() => setStapleTitle('Salmon night')}>Use salmon starter</button><button className="btn btn-secondary" disabled={busy} onClick={() => setStapleTitle('Asian tofu night')}>Use tofu starter</button></div>}<form className="space-y-3" onSubmit={async e => { e.preventDefault(); if (await changeStaple(() => planningApi.saveStaple(week, stapleTitle, editStaple))) { setStapleTitle(''); setEditStaple(undefined); } }}><label className="block space-y-2"><span>Dinner staple name</span><input className="input" value={stapleTitle} maxLength={100} required disabled={busy} onChange={e => setStapleTitle(e.target.value)} /></label><button className="btn btn-primary" disabled={busy || !stapleTitle.trim()}>{editStaple ? 'Save staple' : 'Add dinner staple'}</button>{editStaple && <button className="btn btn-secondary ml-2" type="button" disabled={busy} onClick={() => { setEditStaple(undefined); setStapleTitle(''); }}>Cancel edit</button>}</form><button className="btn btn-secondary" disabled={busy} onClick={() => setSheet('tools')}>Back to Week tools</button></>}
      {sheet === 'repeat' && <><p className="text-muted">Copy selected dinners from {dateLabel(week)}. Existing target dinners stay, dates shift by weekday, and groceries start needed. Standalone extras are not copied.</p><form className="space-y-4" onSubmit={async e => { e.preventDefault(); setBusy(true); setError(''); try { await planningApi.repeat(week, targetWeek, repeatIds); setRepeatNotice(targetWeek); if (targetWeek === week) setReload(value => value + 1); } catch (e) { setError(e instanceof Error ? e.message : 'Could not repeat meals.'); } finally { setBusy(false); } }}>
        {plan?.entries.map(entry => <label className="flex min-h-12 items-center gap-3 py-2" key={entry.id}><input type="checkbox" checked={repeatIds.includes(entry.id)} disabled={busy || !!repeatNotice} onChange={e => setRepeatIds(ids => e.target.checked ? [...ids, entry.id] : ids.filter(id => id !== entry.id))} /><span>{entry.title}<span className="block text-sm text-muted">{entry.date ? dateLabel(entry.date) : 'Flexible'}</span></span></label>)}<label className="block space-y-2"><span>Target Monday</span><input className="input" type="date" value={targetWeek} disabled={busy || !!repeatNotice} required onChange={e => setTargetWeek(e.target.value)} /></label><button className="btn btn-primary w-full" disabled={busy || !repeatIds.length || !!repeatNotice}>Repeat selected meals</button></form>{repeatNotice && <p role="status">Meals repeated. <Link className="underline inline-flex min-h-11 items-center" to={`/week?week=${repeatNotice}`}>View repeated week</Link></p>}<button className="btn btn-secondary" disabled={busy} onClick={() => setSheet('tools')}>Back to Week tools</button></>}
    </ModalSheet>}
    {detail && <ModalSheet title={detail.title} busy={busy} onClose={() => { setDetail(null); setError(''); }}><p className="eyebrow">{detail.kind === 'takeout' ? 'Takeout night' : 'Home cooking'}</p>{!removing && errorMessage}{detail.kind === 'home' && detail.mealId && <Link className="btn btn-primary w-full" to={`/cook/${detail.mealId}?week=${week}`}>Cook recipe</Link>}<form className="space-y-4" onSubmit={async e => { e.preventDefault(); if (await save(() => planningApi.updateEntry(week, detail.id, { date: detailDate || null }), 'Dinner night saved.')) setDetail(null); }}>{dateField(detailDate, setDetailDate, `Night for ${detail.title}`)}<button className="btn btn-secondary w-full" disabled={busy}>Save night</button></form>{current && !detail.date && <button className="btn btn-secondary w-full" disabled={busy} onClick={async () => { if (await save(() => planningApi.updateEntry(week, detail.id, { date: today }), 'Dinner planned for tonight.')) setDetail(null); }}>Make {detail.title} tonight</button>}<button className="btn text-red-700 w-full" disabled={busy} onClick={() => { setError(''); setRemoving(true); }}>Remove {detail.title}</button></ModalSheet>}
    {detail && removing && <ModalSheet title={`Remove ${detail.title}?`} busy={busy} onClose={() => { setRemoving(false); setError(''); }}><p>Purchased groceries always stay as standalone items. Choose what happens to this dinner's other groceries.</p>{errorMessage}<button className="btn btn-secondary w-full" disabled={busy} onClick={async () => { if (await save(() => planningApi.removeEntry(week, detail.id, true), 'Dinner removed; groceries kept.')) { setRemoving(false); setDetail(null); } }}>Remove dinner · keep groceries</button><button className="btn btn-danger w-full" disabled={busy} onClick={async () => { if (await save(() => planningApi.removeEntry(week, detail.id, false), 'Dinner and unpurchased groceries removed.')) { setRemoving(false); setDetail(null); } }}>Remove dinner and unpurchased groceries</button><button className="btn btn-secondary w-full" disabled={busy} onClick={() => { setRemoving(false); setError(''); }}>Cancel removal</button></ModalSheet>}
  </main>;
}
