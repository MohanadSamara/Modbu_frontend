// ============================================================================
// DatakomConnection.jsx — Datakom Rainbow cloud connection control page.
//
// Shows the backend adapter's live status (connected / stopped / gave-up …)
// and — for datakom.write holders — start / stop / reconnect buttons plus a
// manual "Sync now" that imports the cloud tree into editable DB rows.
// The enabled flag persists server-side (system_settings), so a stop here
// survives a backend restart.
// ============================================================================

import { useCallback, useEffect, useState } from 'react';
import { datakomApi } from '../api/datakom.js';
import { useAuth } from '../context/useAuth.js';
import { useToast } from '../context/useFeedback.js';

function fmtTime(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  if (isNaN(d)) return '—';
  return d.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

// Overall connection state → banner meta. Order matters: ready wins, then an
// explicit stop, then gave-up, then "connecting…".
function connectionMeta(st) {
  if (!st) return { label: 'Loading…', dot: 'bg-gray-500', text: 'text-gray-400' };
  if (st.ready)   return { label: 'Connected', dot: 'bg-emerald-400', text: 'text-emerald-300' };
  if (st.stopped || !st.enabled) return { label: 'Stopped', dot: 'bg-gray-500', text: 'text-gray-400' };
  if (st.gaveUp)  return { label: 'Failed (gave up)', dot: 'bg-red-400', text: 'text-red-300' };
  return { label: 'Connecting…', dot: 'bg-amber-400', text: 'text-amber-300' };
}

function StatCard({ label, value, sub }) {
  return (
    <div className="rounded-xl border border-gray-700/60 bg-gray-800/40 px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-gray-400">{label}</div>
      <div className="mt-1 text-xl font-semibold text-gray-100">{value}</div>
      {sub ? <div className="mt-0.5 text-xs text-gray-400">{sub}</div> : null}
    </div>
  );
}

export default function DatakomConnection() {
  const { hasPermission } = useAuth();
  const toast = useToast();
  const canControl = hasPermission('datakom.write');

  const [status, setStatus] = useState(null);
  const [statusError, setStatusError] = useState('');
  const [syncStatus, setSyncStatus] = useState(null);
  const [busy, setBusy] = useState(null); // 'start' | 'stop' | 'restart' | 'sync' | null

  const refresh = useCallback(async () => {
    try {
      const st = await datakomApi.status();
      setStatus(st);
      setStatusError('');
    } catch (e) {
      setStatusError(e.message || 'Failed to fetch status');
    }
    try { setSyncStatus(await datakomApi.syncStatus()); } catch { /* keep last */ }
  }, []);

  useEffect(() => {
    // First fetch in a microtask (not synchronously in the effect body), then
    // keep polling every 5 s.
    const t = setTimeout(refresh, 0);
    const id = setInterval(refresh, 5000);
    return () => { clearTimeout(t); clearInterval(id); };
  }, [refresh]);

  const runAction = async (kind, fn, okMsg) => {
    setBusy(kind);
    try {
      const r = await fn();
      if (r?.status) setStatus(r.status);
      toast.success(okMsg);
      await refresh();
    } catch (e) {
      toast.error(e.message || `${kind} failed`);
    } finally {
      setBusy(null);
    }
  };

  const meta = connectionMeta(status);
  const lastSummary = syncStatus?.lastSummary ?? null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Datakom Cloud</h1>
          <p className="mt-1 text-sm text-gray-400">
            Rainbow SCADA cloud connection — status, control and DB import.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-gray-700/60 bg-gray-800/60 px-4 py-1.5">
          <span className={`h-2.5 w-2.5 rounded-full ${meta.dot} ${status?.ready ? 'animate-pulse' : ''}`} />
          <span className={`text-sm font-medium ${meta.text}`}>{meta.label}</span>
        </div>
      </div>

      {statusError ? (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {statusError}
        </div>
      ) : null}

      {/* Gave-up explainer */}
      {status?.gaveUp && !status?.ready ? (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          The connection failed {status.failedCycles} time(s) in a row and stopped retrying.
          Datakom's port 464 is IP-allowlisted — repeated resets usually mean this server's
          public IP is not whitelisted by Datakom. Press <b>Start</b> to retry.
        </div>
      ) : null}

      {/* Control buttons */}
      {canControl ? (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => runAction('start', datakomApi.adapterStart, 'Datakom connection starting')}
            disabled={busy != null || status?.ready}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {busy === 'start' ? 'Starting…' : 'Start'}
          </button>
          <button
            onClick={() => runAction('stop', datakomApi.adapterStop, 'Datakom connection stopped')}
            disabled={busy != null || (!status?.ready && (status?.stopped || !status?.enabled))}
            className="rounded-lg bg-red-600/90 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {busy === 'stop' ? 'Stopping…' : 'Stop'}
          </button>
          <button
            onClick={() => runAction('restart', datakomApi.adapterRestart, 'Datakom reconnect requested')}
            disabled={busy != null}
            className="rounded-lg border border-gray-600 bg-gray-800 px-4 py-2 text-sm font-medium text-gray-200 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {busy === 'restart' ? 'Reconnecting…' : 'Reconnect'}
          </button>
          <button
            onClick={() => runAction('sync', datakomApi.sync, 'Datakom sync finished')}
            disabled={busy != null || !status?.ready}
            title={!status?.ready ? 'Connect first — sync needs live cloud data' : 'Import cloud tree into editable DB projects/devices'}
            className="rounded-lg border border-sky-600/60 bg-sky-600/20 px-4 py-2 text-sm font-medium text-sky-300 hover:bg-sky-600/30 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {busy === 'sync' ? 'Syncing…' : 'Sync now'}
          </button>
        </div>
      ) : (
        <p className="text-sm text-gray-500">Read-only view — datakom.write is required to control the connection.</p>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Nodes" value={status?.nodes ?? '—'} />
        <StatCard label="Devices" value={status?.deviceCount ?? '—'} />
        <StatCard label="Live readings" value={status?.readingCount ?? '—'} />
        <StatCard label="Connected at" value={status?.connectedAt ? fmtTime(status.connectedAt) : '—'} />
        <StatCard
          label="Enabled"
          value={status ? (status.enabled ? 'Yes' : 'No') : '—'}
          sub={status ? `source: ${status.enabledSource === 'runtime' ? 'saved setting' : 'environment'}` : null}
        />
      </div>

      {/* Details */}
      <div className="rounded-xl border border-gray-700/60 bg-gray-800/40 p-4">
        <h2 className="text-sm font-semibold text-gray-200">Connection details</h2>
        <dl className="mt-3 grid grid-cols-1 gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
          <div className="flex justify-between gap-4">
            <dt className="text-gray-400">Endpoint</dt>
            <dd className="truncate text-gray-200" title={status?.url}>{status?.url ?? '—'}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-gray-400">Session access</dt>
            <dd className="text-gray-200">{status?.session?.Access ?? '—'}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-gray-400">Failed attempts</dt>
            <dd className="text-gray-200">{status?.failedCycles ?? 0}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-gray-400">Last error</dt>
            <dd className="text-gray-200">{status?.lastError ?? 'None'}</dd>
          </div>
        </dl>
      </div>

      {/* Sync summary */}
      <div className="rounded-xl border border-gray-700/60 bg-gray-800/40 p-4">
        <h2 className="text-sm font-semibold text-gray-200">Cloud → DB sync</h2>
        <p className="mt-1 text-xs text-gray-400">
          Imports the cloud tree as real projects, locations and devices so everything is
          editable. Runs automatically while connected; it only <b>adds</b> new items —
          your renames, moves, added IPs and deletions are never overwritten.
        </p>
        {lastSummary ? (
          <dl className="mt-3 grid grid-cols-2 gap-x-8 gap-y-2 text-sm sm:grid-cols-4">
            <div><dt className="text-gray-400">Last run</dt><dd className="text-gray-200">{fmtTime(syncStatus?.lastRunAt)}</dd></div>
            <div><dt className="text-gray-400">New projects</dt><dd className="text-gray-200">{lastSummary.createdProjects ?? 0}</dd></div>
            <div><dt className="text-gray-400">New locations</dt><dd className="text-gray-200">{lastSummary.createdLocations ?? 0}</dd></div>
            <div><dt className="text-gray-400">New devices</dt><dd className="text-gray-200">{lastSummary.createdDevices ?? 0}</dd></div>
          </dl>
        ) : (
          <p className="mt-3 text-sm text-gray-500">
            {syncStatus?.lastError ? `Last sync error: ${syncStatus.lastError}` : 'No sync has run yet.'}
          </p>
        )}
        {lastSummary?.errors?.length ? (
          <details className="mt-3 text-xs text-amber-300/90">
            <summary className="cursor-pointer">{lastSummary.errors.length} item error(s)</summary>
            <ul className="mt-1 list-disc pl-5">
              {lastSummary.errors.slice(0, 20).map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          </details>
        ) : null}
      </div>
    </div>
  );
}
