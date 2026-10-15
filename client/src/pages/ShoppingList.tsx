import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { planningApi, type WeekPlan, type ShoppingItem } from '../api/planning';
import { selectedWeek, dateLabel } from '../lib/week';

function ItemRow({ item, busy, update, remove }: { item: ShoppingItem; busy: boolean; update: (data: Partial<Pick<ShoppingItem, 'ingredient' | 'amount' | 'state'>>) => Promise<boolean>; remove: () => void }) {
  const [editing, setEditing] = useState(false);
  const [ingredient, setIngredient] = useState(item.ingredient);
  const [amount, setAmount] = useState(item.amount);
  return <li className="py-3 border-b border-gray-200 last:border-0 space-y-2">
    <div className="flex flex-wrap gap-3 items-center justify-between"><span className={`text-lg break-words min-w-0 ${item.state !== 'needed' ? 'text-gray-500 line-through' : ''}`}>{item.amount} {item.ingredient}</span>
      <select aria-label={`Status for ${item.ingredient}`} className="input w-auto min-h-11" disabled={busy} value={item.state} onChange={e => update({ state: e.target.value as ShoppingItem['state'] })}><option value="needed">Need to buy</option><option value="have">Already have</option><option value="bought">Purchased</option></select></div>
    {editing ? <form className="space-y-2" onSubmit={async e => { e.preventDefault(); if (await update({ ingredient, amount })) setEditing(false); }}><label className="block">Amount<input className="input" aria-label={`Edit amount for ${item.ingredient}`} maxLength={100} value={amount} onChange={e => setAmount(e.target.value)} disabled={busy}/></label><label className="block">Item<input className="input" aria-label={`Edit item ${item.ingredient}`} maxLength={300} value={ingredient} onChange={e => setIngredient(e.target.value)} disabled={busy} required/></label><div className="flex gap-3"><button className="btn btn-primary" disabled={busy}>Save item</button><button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setEditing(false)}>Cancel</button></div></form>
      : <div className="flex gap-5"><button className="underline py-1" disabled={busy} aria-label={`Edit ${item.ingredient}`} onClick={() => { setIngredient(item.ingredient); setAmount(item.amount); setEditing(true); }}>Edit</button><button className="underline py-1 text-red-700" disabled={busy} aria-label={`Remove ${item.ingredient}`} onClick={remove}>Remove</button></div>}
  </li>;
}
export function ShoppingList() {
  const [params] = useSearchParams();
  const week = selectedWeek(params.get('week'));
  const [plan, setPlan] = useState<WeekPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ingredient, setIngredient] = useState('');
  const [amount, setAmount] = useState('');
  const [reload, setReload] = useState(0);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    planningApi.getWeek(week).then(value => { if (active) setPlan(value); }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [week, reload]);
  async function save(action: () => Promise<WeekPlan>): Promise<boolean> {
    setBusy(true); setError(''); setCopied(false);
    try { setPlan(await action()); return true; } catch (e) { setError(e instanceof Error ? e.message : 'Could not save. Try again.'); return false; } finally { setBusy(false); }
  }
  const groups = new Map<string, { title: string; items: ShoppingItem[] }>();
  for (const item of plan?.shopping ?? []) {
    const key = item.entryId ?? 'extras';
    if (!groups.has(key)) groups.set(key, { title: item.sourceTitle ?? 'Extra items', items: [] });
    groups.get(key)!.items.push(item);
  }
  const needed = (plan?.shopping ?? []).filter(item => item.state === 'needed');
  const copyText = needed.map(item => `${item.amount} ${item.ingredient}`.trim()).join('\n');
  return <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">
    <div className="flex flex-wrap gap-3 items-center justify-between"><h1 className="text-3xl font-bold">Shopping list</h1><Link className="btn btn-secondary" to={`/week?week=${week}`}>Week plan</Link></div>
    <p className="text-gray-600">Week of {dateLabel(week)} · {needed.length} left to buy</p><p>Mark what you already have before shopping. Amounts stay exactly as written in each recipe.</p>
    {error && <div role="alert" className="card text-red-700">{error} <button className="underline" disabled={busy} onClick={() => setReload(value => value + 1)}>Retry loading</button></div>}
    {loading ? <p role="status">Loading your shopping list…</p> : plan && <>
      {plan.shopping.length === 0 && <p className="card">Add recipes to your week to create a shopping list, or add extra items below.</p>}
      {[...groups.entries()].map(([key, group]) => <section className="card" key={key}><h2 className="text-xl font-bold">{group.title}</h2><ul>{group.items.map(item => <ItemRow key={item.id} item={item} busy={busy} update={data => save(() => planningApi.updateItem(week, item.id, data))} remove={() => save(() => planningApi.removeItem(week, item.id))}/>)}</ul></section>)}
      <form className="card space-y-3" onSubmit={async e => { e.preventDefault(); if (await save(() => planningApi.addItem(week, { ingredient, amount }))) { setIngredient(''); setAmount(''); } }}><h2 className="text-xl font-bold">Add an extra item</h2><label className="block">Item<input className="input mt-1" maxLength={300} required value={ingredient} onChange={e => setIngredient(e.target.value)} disabled={busy}/></label><label className="block">Amount (optional)<input className="input mt-1" maxLength={100} value={amount} onChange={e => setAmount(e.target.value)} disabled={busy}/></label><button className="btn btn-primary" disabled={busy || !ingredient.trim()}>Add extra item</button></form>
      <section className="card space-y-3"><h2 className="text-xl font-bold">Take your list with you</h2><p>Only items still needed are included.</p><textarea className="input min-h-32" aria-label="List to copy" value={copyText} readOnly/><button className="btn btn-secondary" disabled={!needed.length} onClick={async () => { try { await navigator.clipboard.writeText(copyText); setCopied(true); } catch { setError('Select and copy the list above. Clipboard access is unavailable.'); } }}>{copied ? 'Copied!' : 'Copy shopping list'}</button></section>
    </>}
  </main>;
}
