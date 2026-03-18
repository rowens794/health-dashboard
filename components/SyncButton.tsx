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
      setStatus(`Imported ${data.summary.inserted} new / updated ${data.summary.updated} from ${data.summary.scanned} RENPHO rows.`);
      window.location.reload();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Sync failed');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="actions">
      <button onClick={runSync} disabled={pending}>{pending ? 'Syncing…' : 'Sync RENPHO now'}</button>
      {status ? <span className="small">{status}</span> : null}
    </div>
  );
}
