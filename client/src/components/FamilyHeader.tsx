import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { ModalSheet } from './ModalSheet';

export function FamilyHeader() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const week = new URLSearchParams(location.search).get('week');
  return <header className="border-b border-stone-200"><div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-3"><Link to={week ? `/week?week=${encodeURIComponent(week)}` : '/week'} className="inline-flex min-h-12 items-center font-semibold text-lg">MealMatch<span aria-hidden="true" className="text-primary-600 ml-1">✳</span></Link><button className="btn btn-secondary" onClick={() => setOpen(true)}>Account</button></div>
    {open && <ModalSheet title="Household & account" onClose={() => setOpen(false)} busy={busy}><p className="text-muted">Signed in as {user?.email}</p><p>Use the same household login on your other devices.</p><Link className="menu-action" to={week ? `/quick?week=${encodeURIComponent(week)}` : '/quick'} onClick={() => setOpen(false)}>Start an account-free vote <span aria-hidden="true">→</span></Link>{error && <p role="alert" className="text-red-700">{error}</p>}<button className="btn btn-secondary w-full" disabled={busy} onClick={async () => { setBusy(true); setError(''); try { await logout(); } catch (e) { setError(e instanceof Error ? e.message : 'Could not sign out. Try again.'); } finally { setBusy(false); } }}>Sign out</button></ModalSheet>}
  </header>;
}
