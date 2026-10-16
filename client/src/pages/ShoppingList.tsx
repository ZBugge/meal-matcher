import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { planningApi, type WeekPlan, type ShoppingItem } from '../api/planning';
import { aisles, itemAisle, shoppingGroups, type ShoppingGroup } from '../lib/shopping';
import { selectedWeek, dateLabel } from '../lib/week';
import { ModalSheet } from '../components/ModalSheet';

type ItemUpdate = Partial<Pick<ShoppingItem, 'ingredient' | 'amount' | 'state' | 'aisle'>>;
function ItemRow({ item, busy, update, remove }: { item: ShoppingItem; busy: boolean; update: (data: ItemUpdate) => Promise<boolean>; remove: () => void }) {
  const [editing, setEditing] = useState(false);
  const [ingredient, setIngredient] = useState(item.ingredient);
  const [amount, setAmount] = useState(item.amount);
  const [aisle, setAisle] = useState(itemAisle(item));
  return <li className="py-4 border-b border-stone-200 last:border-0 space-y-3">
    <p className="text-sm font-semibold text-muted">{item.sourceTitle ?? 'Extra items'}</p>
    <p className="break-words">{item.amount} {item.ingredient}</p>
    <label className="block space-y-2"><span className="text-sm">Shopping status</span><select aria-label={`Status for ${item.ingredient}`} className="input" disabled={busy} value={item.state} onChange={e => update({ state: e.target.value as ShoppingItem['state'] })}><option value="needed">Need to buy</option><option value="have">Already have</option><option value="bought">Purchased</option></select></label>
    {editing ? <form className="space-y-3" onSubmit={async e => { e.preventDefault(); if (await update({ ingredient, amount, aisle })) setEditing(false); }}><label className="block space-y-2"><span>Amount</span><input className="input" aria-label={`Edit amount for ${item.ingredient}`} maxLength={100} value={amount} onChange={e => setAmount(e.target.value)} disabled={busy}/></label><label className="block space-y-2"><span>Item</span><input className="input" aria-label={`Edit item ${item.ingredient}`} maxLength={300} value={ingredient} onChange={e => setIngredient(e.target.value)} disabled={busy} required/></label><label className="block space-y-2"><span>Aisle</span><select className="input" aria-label={`Aisle for ${item.ingredient}`} value={aisle} onChange={e => setAisle(e.target.value)} disabled={busy}>{aisles.map(value => <option key={value}>{value}</option>)}</select></label><div className="flex flex-wrap gap-3"><button className="btn btn-primary" disabled={busy}>Save item</button><button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setEditing(false)}>Cancel edit</button></div></form>
      : <div className="flex flex-wrap gap-3"><button className="btn btn-secondary" disabled={busy} aria-label={`Edit ${item.ingredient}`} onClick={() => { setIngredient(item.ingredient); setAmount(item.amount); setAisle(itemAisle(item)); setEditing(true); }}>Edit</button><button className="btn text-red-700" disabled={busy} aria-label={`Remove ${item.ingredient}`} onClick={remove}>Remove</button></div>}
  </li>;
}
export function ShoppingList() {
  const [params] = useSearchParams();
  const week = selectedWeek(params.get('week'));
  return <ShoppingListContent key={week} week={week} />;
}

function ShoppingListContent({ week }: { week: string }) {
  const [plan, setPlan] = useState<WeekPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ingredient, setIngredient] = useState('');
  const [amount, setAmount] = useState('');
  const [reload, setReload] = useState(0);
  const [checking, setChecking] = useState<Record<string, boolean>>({});
  const [pantry, setPantry] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [sheet, setSheet] = useState<'extra' | 'copy' | null>(null);
  const [detail, setDetail] = useState<{ ingredient: string; ids: string[] } | null>(null);
  const [notice, setNotice] = useState('');
  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    planningApi.getWeek(week).then(value => { if (active) setPlan(value); }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [week, reload]);
  async function save(action: () => Promise<WeekPlan>, message = ''): Promise<boolean> {
    setBusy(true); setError(''); setCopied(false); setNotice('');
    try { setPlan(await action()); setNotice(message); return true; }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not save. Try again.'); return false; }
    finally { setBusy(false); }
  }
  const groups = shoppingGroups(plan?.shopping ?? []);
  const needed = groups.filter(group => group.state === 'needed');
  const completed = groups.filter(group => group.state !== 'needed');
  const copyText = needed.map(group => `${group.amount} ${group.ingredient}`.trim() + (group.items.length > 1 ? '\n' + group.items.map(item => `  ${item.sourceTitle ?? 'Extra items'}: ${item.amount} ${item.ingredient}`.trimEnd()).join('\n') : '')).join('\n');
  const detailItems = plan?.shopping.filter(item => detail?.ids.includes(item.id)) ?? [];
  const errorMessage = error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-800">{error}</p>;
  function openSheet(value: 'extra' | 'copy') { setError(''); setCopied(false); setSheet(value); }
  function renderGroup(group: ShoppingGroup) {
    const ids = group.items.map(item => item.id);
    const checked = ids.every(id => selected.includes(id));
    const manyAmounts = group.items.length > 1 && group.amount.length > 52 && group.amount.includes(' + ');
    const amountLabel = manyAmounts ? `${group.items.length} ${group.items.some(item => item.sourceTitle) ? 'recipe' : 'item'} amounts` : group.amount;
    return <li className="flex items-center gap-2 border-b border-stone-200 last:border-0 py-2" key={group.key}>
      <label className={`flex flex-1 min-w-0 gap-3 items-center min-h-12 py-2 ${pantry && group.state !== 'needed' ? 'opacity-60' : 'cursor-pointer'}`}>
        {pantry && group.state === 'needed' ? <input type="checkbox" aria-label={`Already have ${group.ingredient}`} checked={checked} disabled={busy} onChange={e => setSelected(current => e.target.checked ? [...new Set([...current, ...ids])] : current.filter(id => !ids.includes(id)))}/> :
          <input type="checkbox" aria-label={`${group.state === 'have' ? 'Already have' : 'Purchased'} ${group.ingredient}`} checked={checking[group.key] ?? group.state !== 'needed'} disabled={busy || pantry} onChange={async e => { const value = e.target.checked; setChecking(current => ({ ...current, [group.key]: value })); await save(() => planningApi.bulkItems(week, ids, value ? 'bought' : 'needed')); setChecking(current => { const next = { ...current }; delete next[group.key]; return next; }); }}/>}
        <span className="min-w-0 flex-1"><span className={`block font-semibold break-words ${group.state !== 'needed' ? 'text-muted' : ''}`}>{group.ingredient}</span>{amountLabel && <span className="block text-sm text-muted break-words">{amountLabel}</span>}{group.state !== 'needed' && <span className="block text-xs text-muted mt-1">{group.state === 'have' ? 'Already have · at home' : 'Purchased · bought'}</span>}</span>
      </label>
      <button className="min-h-12 min-w-12 px-2 text-sm text-primary-700 rounded-lg hover:bg-primary-50" aria-label={`Details & edit ${group.ingredient}`} disabled={busy || pantry} onClick={() => { setError(''); setDetail({ ingredient: group.ingredient, ids }); }}>Details</button>
    </li>;
  }
  return <main className={`family-page ${pantry ? 'pb-36' : ''}`}>
    <div className="flex items-start justify-between gap-3"><div><p className="eyebrow">Your family kitchen</p><h1 className="page-title mt-1">Shopping list</h1></div><button className="btn btn-primary" disabled={busy || pantry || loading || !plan} onClick={() => openSheet('extra')}>Add item</button></div>
    <div><p className="font-semibold">Week of {dateLabel(week)}</p><p className="text-muted text-sm mt-1">{needed.length} {needed.length === 1 ? 'line' : 'lines'} left to buy</p></div>
    {!sheet && !detail && !pantry && errorMessage}
    {!plan && !loading && error && <button className="btn btn-secondary" onClick={() => setReload(value => value + 1)}>Retry loading</button>}
    {!sheet && !detail && notice && <p role="status" className="text-primary-700">{notice}</p>}
    {loading ? <p role="status">Loading your shopping list…</p> : plan && <>
      {pantry ? <section className="rounded-2xl bg-primary-50 border border-primary-200 p-4" aria-label="Pantry review"><h2 className="font-semibold text-xl">Pantry review</h2><p className="text-muted mt-2">Select ingredients you already have at home. Apply your choices below; nothing changes until then.</p></section> : <div className="flex flex-wrap gap-3 border-y border-stone-200 py-3"><button className="btn btn-secondary" disabled={busy || !needed.length} onClick={() => { setError(''); setNotice(''); setPantry(true); setSelected([]); }}>Review pantry</button><button className="btn btn-secondary" disabled={busy || !needed.length} onClick={() => openSheet('copy')}>Copy list</button></div>}
      {!plan.shopping.length && <p className="py-4 text-muted">Add recipes to your week to create a shopping list, or add an extra item.</p>}
      {!!plan.shopping.length && !needed.length && <p className="py-4 text-primary-700">Everything is covered. Your completed items are below.</p>}
      {aisles.filter(aisle => needed.some(group => group.aisle === aisle)).map(aisle => <section key={aisle} aria-label={aisle}><h2 className="eyebrow pb-2 border-b border-stone-200">{aisle}</h2><ul>{needed.filter(group => group.aisle === aisle).map(renderGroup)}</ul></section>)}
      {!!completed.length && <details className="border-t border-stone-200 pt-3"><summary className="font-semibold cursor-pointer py-3">Completed ({completed.length}) · at home & bought</summary><ul>{completed.map(renderGroup)}</ul></details>}
      <Link className="btn btn-secondary w-full" to={`/week?week=${week}`}>Back to week plan</Link>
      {pantry && <section aria-label="Apply pantry review" className="fixed z-40 inset-x-0 border-t border-primary-200 bg-paper p-3" style={{ bottom: 'calc(5rem + env(safe-area-inset-bottom))' }}><div className="max-w-3xl mx-auto flex flex-wrap gap-3 items-center">{errorMessage}<p className="w-full text-sm font-semibold">Pantry review · {selected.length} ingredients selected</p><button className="btn btn-primary flex-1" aria-label={`Already have selected (${selected.length})`} disabled={busy || !selected.length} onClick={async () => { if (await save(() => planningApi.bulkItems(week, selected, 'have'), 'Pantry review applied.')) { setSelected([]); setPantry(false); } }}>Apply ({selected.length})</button><button className="btn btn-secondary flex-1" disabled={busy} onClick={() => { setSelected([]); setPantry(false); setError(''); }}>Cancel pantry review</button></div></section>}
    </>}
    {sheet === 'extra' && <ModalSheet title="Add an extra item" busy={busy} onClose={() => { setSheet(null); setError(''); }}><form className="space-y-4" onSubmit={async e => { e.preventDefault(); if (await save(() => planningApi.addItem(week, { ingredient, amount }), 'Extra item added.')) { setIngredient(''); setAmount(''); setSheet(null); } }}>{errorMessage}<label className="block space-y-2"><span>Item</span><input className="input" maxLength={300} required value={ingredient} onChange={e => setIngredient(e.target.value)} disabled={busy}/></label><label className="block space-y-2"><span>Amount (optional)</span><input className="input" maxLength={100} value={amount} onChange={e => setAmount(e.target.value)} disabled={busy}/></label><button className="btn btn-primary w-full" disabled={busy || !ingredient.trim()}>Add extra item</button></form></ModalSheet>}
    {sheet === 'copy' && <ModalSheet title="Copy shopping list" busy={busy} onClose={() => { setSheet(null); setError(''); }}><p className="text-muted">Only items still needed are included. Original contributions appear under combined amounts.</p>{errorMessage}<textarea className="input min-h-48" aria-label="List to copy" value={copyText} readOnly/><button className="btn btn-primary w-full" disabled={busy || !needed.length} onClick={async () => { setBusy(true); setError(''); try { await navigator.clipboard.writeText(copyText); setCopied(true); } catch { setError('Clipboard access is unavailable. Select and copy the list above.'); } finally { setBusy(false); } }}>{copied ? 'Copied!' : 'Copy shopping list'}</button>{copied && <p role="status">Shopping list copied.</p>}</ModalSheet>}
    {detail && <ModalSheet title={`${detail.ingredient} details`} busy={busy} onClose={() => { setDetail(null); setError(''); }}><p className="text-muted">Original recipe amounts stay in order below. Edit each contribution separately.</p>{errorMessage}<ul>{detailItems.map(item => <ItemRow key={item.id} item={item} busy={busy} update={data => save(() => planningApi.updateItem(week, item.id, data), 'Item saved.')} remove={async () => { if (await save(() => planningApi.removeItem(week, item.id), 'Item removed.') && detailItems.length === 1) setDetail(null); }} />)}</ul>{notice && <p role="status" className="text-primary-700">{notice}</p>}</ModalSheet>}
  </main>;
}
