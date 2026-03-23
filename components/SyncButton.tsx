'use client';

import { useState } from 'react';

export function SyncButton() {
  const [status, setStatus] = useState<string>('');
  const [pending, setPending] = useState(false);

  async function runSync() {
    setPending(true);
    setStatus('Syncing…');
    try {
      const response = await fetch('/api/sync', { method: 'POST' });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Sync failed');
      }
      const lines = (data.summary.results as Array<{ source: string; status: string; inserted: number; updated: number; scanned: number }>)
        .map((result) => `${result.source}: ${result.status} (${result.inserted} new, ${result.updated} updated, ${result.scanned} scanned)`)
        .join(' | ');
      setStatus(lines || 'Sync completed.');
      window.location.reload();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Sync failed');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="actions">
      <button onClick={runSync} disabled={pending}>{pending ? 'Syncing…' : 'Sync Daily Sources'}</button>
      {status ? <span className="small">{status}</span> : null}
    </div>
  );
}
