import { useEffect, useRef, useState } from 'react';
import { notionApi, NotionConnectionStatus } from '../api/client';

export default function NotionConnection({ onRefreshed }: { onRefreshed: () => Promise<void> }) {
  const [status, setStatus] = useState<NotionConnectionStatus | null>(null);
  const [editing, setEditing] = useState(false);
  const [token, setToken] = useState('');
  const [source, setSource] = useState('');
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let current = true;
    notionApi.status().then(value => { if (current) { setStatus(value); setSource(value.sourceUrl ?? ''); } })
      .catch(err => { if (current) setError(err instanceof Error ? err.message : 'Could not read your Notion connection.'); });
    return () => { current = false; };
  }, []);

  async function run(action: 'connect' | 'refresh' | 'disconnect') {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError(''); setMessage('');
    try {
      if (action === 'disconnect') {
        setStatus(await notionApi.disconnect());
        setEditing(false); setToken('');
        setMessage('Disconnected. Your saved recipe copies are still available.');
      } else {
        const result = action === 'connect' ? await notionApi.connect(token.trim(), source.trim()) : await notionApi.refresh();
        setToken(''); setEditing(false); setStatus(result); setSource(result.sourceUrl ?? '');
        setMessage(`${result.added} added · ${result.updated} updated · ${result.removed} removed`);
        await onRefreshed();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not refresh Notion recipes. Your saved recipes are unchanged.');
    } finally { locked.current = false; setBusy(false); }
  }

  const showForm = editing || status?.connected === false;
  return <section aria-label="Notion connection" className="card mb-5 space-y-4">
    <div className="flex flex-wrap gap-3 items-start justify-between">
      <div><h2 className="text-lg font-semibold">Your Notion recipes</h2>
        <p className="text-sm text-muted mt-1">Edit recipes in Notion, then refresh here.</p>
        {status?.lastRefreshedAt && <p className="text-sm text-muted mt-1">Last refreshed {new Date(status.lastRefreshedAt).toLocaleString()}</p>}
      </div>
      {status?.connected && <button type="button" className="btn btn-primary" disabled={busy} onClick={() => run('refresh')}>{busy ? 'Working…' : 'Refresh'}</button>}
    </div>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-800 whitespace-pre-line break-words">{error}</p>}
    {!status && !error && <p role="status">Checking your connection…</p>}
    {!status && error && <button type="button" className="btn btn-secondary" onClick={() => { setError(''); notionApi.status().then(setStatus).catch(err => setError(err.message)); }}>Retry connection</button>}
    {message && <p role="status" className="text-sm text-primary-700">{message}</p>}
    {showForm && <form onSubmit={event => { event.preventDefault(); void run('connect'); }}>
      <fieldset disabled={busy} className="space-y-4 min-w-0">
        <p className="text-sm text-muted">Create a Notion connection with Read content access and share your recipe collection with it. <a href="https://developers.notion.com/guides/get-started/internal-connections" target="_blank" rel="noreferrer" className="underline text-primary-700">Setup guide</a></p>
        <label className="block font-medium text-sm">Recipe database link<input required type="text" className="input mt-1" value={source} onChange={event => setSource(event.target.value)} placeholder="Paste the Recipes database link" autoComplete="off" /></label>
        <label className="block font-medium text-sm">Notion connection token<input required type="password" className="input mt-1" value={token} onChange={event => setToken(event.target.value)} autoComplete="new-password" spellCheck={false} /></label>
        <div className="flex flex-wrap gap-3"><button className="btn btn-primary" type="submit">{busy ? 'Connecting…' : 'Connect and refresh'}</button>{status?.connected && <button className="btn btn-secondary" type="button" onClick={() => { setEditing(false); setToken(''); setSource(status.sourceUrl ?? ''); }}>Cancel</button>}</div>
      </fieldset>
    </form>}
    {status?.connected && !editing && <div className="flex flex-wrap gap-4 text-sm"><button type="button" className="underline min-h-12" disabled={busy} onClick={() => setEditing(true)}>Connection settings</button><button type="button" className="underline min-h-12" disabled={busy} onClick={() => run('disconnect')}>Disconnect</button></div>}
  </section>;
}
