'use client';

import { useState } from 'react';

type SyncButtonProps = {
  label?: string;
  pendingLabel?: string;
  compact?: boolean;
};

export function SyncButton({ label = 'Sync Daily Sources', pendingLabel = 'Syncing…', compact = false }: SyncButtonProps) {
  const [status, setStatus] = useState<string>('');
  const [pending, setPending] = useState(false);

  async function runSync() {
    setPending(true);
    setStatus(pendingLabel);
    try {
      const response = await fetch('/api/sync', { method: 'POST' });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Sync failed');
      }
      const lines = (data.summary.results as Array<{ source: string; status: string; inserted: number; updated: number; scanned: number }>)
        .map((result) => `${result.source}: ${result.status} (${result.inserted} new, ${result.updated} updated, ${result.scanned} scanned)`)
        .join(' | ');
      setStatus(compact ? 'Sync completed.' : lines || 'Sync completed.');
      window.location.reload();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Sync failed');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={`actions${compact ? ' actionsCompact' : ''}`}>
      <button onClick={runSync} disabled={pending}>{pending ? pendingLabel : label}</button>
      {status ? <span className="small">{status}</span> : null}
    </div>
  );
}
