import { useEffect, useMemo, useState } from 'react';
import { modbusApi } from '../api/modbus.js';

// Backend device rows use Oracle uppercase keys; normalize the fields we show.
function normalizeDevice(d) {
  return {
    id: d.id ?? d.ID,
    name: d.name ?? d.NAME ?? 'Unnamed device',
    ip: d.ip ?? d.IP ?? null,
    port: d.port ?? d.PORT ?? null,
    status: (d.status ?? d.STATUS ?? 'offline').toString().toLowerCase(),
    last_seen: d.last_seen ?? d.LAST_SEEN ?? null,
    location_id: d.location_id ?? d.LOCATION_ID ?? null,
    brand_id: d.brand_id ?? d.BRAND_ID ?? null,
    brand_name: d.brand_name ?? d.BRAND_NAME ?? null,
  };
}

function formatLastSeen(ts) {
  if (!ts || ts === 'Never') return 'Never';
  const d = new Date(ts);
  if (isNaN(d)) return 'Never';
  // Show the full local date and time, e.g. "Jul 6, 2026, 3:20:24 PM".
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

// Map a device status to a coloured label. The backend only stores
// online/offline/shutdown; anything else falls back to "offline".
function statusMeta(status) {
  switch (status) {
    case 'online':
      return { label: 'Online', dot: 'bg-emerald-400', text: 'text-emerald-300' };
    case 'shutdown':
      return { label: 'Shutdown', dot: 'bg-red-400', text: 'text-red-300' };
    default:
      return { label: 'Offline', dot: 'bg-gray-500', text: 'text-gray-400' };
  }
}

const FILTERS = [
  { key: 'all', label: 'All status' },
  { key: 'online', label: 'Online' },
  { key: 'offline', label: 'Offline' },
  { key: 'shutdown', label: 'Shutdown' },
];

// Animate a number from 0 → target with an easeOutCubic curve. Uses rAF so
// setState only fires inside the frame callback (never synchronously in the
// effect body). Re-runs whenever `target` changes (e.g. when devices load).
function useCountUp(target, duration = 700) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    let raf;
    const start = performance.now();
    const tick = (now) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(target * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
}

export default function DeviceConnections() {
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  // Bumped by the refresh button to re-run the fetch effect.
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    modbusApi
      .getDevices()
      .then((rows) => {
        if (cancelled) return;
        setDevices((rows ?? []).map(normalizeDevice));
        setError('');
      })
      .catch((err) => { if (!cancelled) setError(err.message || 'Failed to load devices'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [reloadKey]);

  // Auto-poll every 10 s to keep status fresh without a manual refresh.
  useEffect(() => {
    const id = setInterval(() => {
      modbusApi.getDevices()
        .then((rows) => setDevices((rows ?? []).map(normalizeDevice)))
        .catch(() => {});
    }, 10_000);
    return () => clearInterval(id);
  }, []);

  const load = () => {
    setLoading(true);
    setError('');
    setReloadKey((k) => k + 1);
  };

  const online = devices.filter((d) => d.status === 'online').length;
  const total = devices.length;
  const offline = total - online;
  const uptime = total ? Math.round((online / total) * 100) : 0;

  // Animated (count-up) versions for the header stats.
  const animTotal = Math.round(useCountUp(total));
  const animOnline = Math.round(useCountUp(online));
  const animOffline = Math.round(useCountUp(offline));
  const animUptime = useCountUp(uptime);

  // Filter + search. Status filter treats anything non-online/shutdown as offline.
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return devices.filter((d) => {
      const matchesFilter =
        filter === 'all' ||
        (filter === 'offline'
          ? d.status !== 'online' && d.status !== 'shutdown'
          : d.status === filter);
      if (!matchesFilter) return false;
      if (!q) return true;
      return (
        d.name.toLowerCase().includes(q) ||
        String(d.id ?? '').toLowerCase().includes(q) ||
        (d.ip ?? '').toLowerCase().includes(q)
      );
    });
  }, [devices, search, filter]);

  const exportCsv = () => {
    const header = ['Status', 'Device Name', 'ID', 'IP Address', 'Connection'];
    const rows = visible.map((d) => [
      statusMeta(d.status).label,
      d.name,
      d.id ?? '',
      d.ip ? `${d.ip}${d.port ? `:${d.port}` : ''}` : '',
      d.ip ? 'Direct' : '',
    ]);
    const csv = [header, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'device-connections.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4 animate-fade-in">
      {/* ── Header bar ── */}
      <div className="rounded-2xl bg-[#1a1d27] border border-white/5 px-6 py-4 flex flex-wrap items-center gap-x-6 gap-y-3 animate-slide-up">
        <div className="flex items-center gap-3">
          <span className="w-9 h-9 rounded-xl bg-cyan-500/15 text-cyan-400 flex items-center justify-center">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
            </svg>
          </span>
          <h1 className="text-base font-bold uppercase tracking-wide text-gray-100">Device Connections</h1>
        </div>

        <div className="flex items-center gap-4 text-xs font-semibold uppercase tracking-wide">
          <span className="flex items-center gap-1.5 text-gray-400">
            <span className="w-2 h-2 rounded-full bg-gray-500" /> Total: <span className="text-gray-200 tabular-nums">{animTotal}</span>
          </span>
          <span className="flex items-center gap-1.5 text-gray-400">
            <span className="w-2 h-2 rounded-full bg-emerald-400" /> Online: <span className="text-gray-200 tabular-nums">{animOnline}</span>
          </span>
          <span className="flex items-center gap-1.5 text-gray-400">
            <span className="w-2 h-2 rounded-full bg-gray-500" /> Offline: <span className="text-gray-200 tabular-nums">{animOffline}</span>
          </span>
        </div>

        <div className="ml-auto inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-sm font-semibold">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 17l6-6 4 4 8-8" />
          </svg>
          <span className="tabular-nums">{animUptime.toFixed(1)}</span>% Uptime
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center gap-3 animate-slide-up delay-100">
        <button
          onClick={load}
          title="Refresh"
          className="w-10 h-10 rounded-xl bg-[#1a1d27] border border-white/5 text-gray-400 hover:text-white hover:bg-white/5 flex items-center justify-center transition-colors"
        >
          <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
        <button
          onClick={exportCsv}
          title="Export CSV"
          className="w-10 h-10 rounded-xl bg-[#1a1d27] border border-white/5 text-gray-400 hover:text-white hover:bg-white/5 flex items-center justify-center transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
          </svg>
        </button>

        <div className="h-6 w-px bg-white/10" />

        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="px-4 py-2.5 rounded-xl bg-[#1a1d27] border border-white/5 text-sm text-gray-300 focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
        >
          {FILTERS.map((f) => (
            <option key={f.key} value={f.key} className="bg-[#1a1d27]">{f.label}</option>
          ))}
        </select>

        <div className="relative flex-1 min-w-[200px]">
          <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, ID, IP…"
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#1a1d27] border border-white/5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
          />
        </div>

        <span className="px-3 py-2 rounded-lg bg-[#1a1d27] border border-white/5 text-xs font-semibold text-gray-400 tabular-nums">
          {visible.length}/{total}
        </span>
      </div>

      {/* ── Table ── */}
      <div className="rounded-2xl bg-[#1a1d27] border border-white/5 overflow-hidden animate-slide-up delay-200">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/5">
                {['Status', 'Device Name', 'Brand', 'IP Address', 'Connection', 'Last Seen'].map((h) => (
                  <th key={h} className="px-6 py-4 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-widest">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {error ? (
                <tr><td colSpan={6} className="px-6 py-10 text-center text-sm text-red-400">{error}</td></tr>
              ) : loading ? (
                <tr><td colSpan={6} className="px-6 py-10 text-center text-sm text-gray-500">Loading devices…</td></tr>
              ) : visible.length === 0 ? (
                <tr><td colSpan={6} className="px-6 py-10 text-center text-sm text-gray-500">No devices match your filters</td></tr>
              ) : (
                visible.map((d, i) => {
                  const meta = statusMeta(d.status);
                  return (
                    <tr
                      key={d.id ?? d.name}
                      className="border-b border-white/5 last:border-0 hover:bg-white/[0.02] transition-colors animate-fade-in"
                      style={{ animationDelay: `${Math.min(i * 40, 400)}ms` }}
                    >
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide ${meta.text}`}>
                          <span className={`w-2 h-2 rounded-full ${meta.dot}`} />
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm font-semibold text-gray-100">{d.name}</td>
                      <td className="px-6 py-4">
                        {d.brand_name ? (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-cyan-500/10 text-cyan-300 text-xs font-semibold">
                            {d.brand_name}
                          </span>
                        ) : (
                          <span className="text-sm text-gray-600">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-400 tabular-nums">
                        {d.ip ? `${d.ip}${d.port ? `:${d.port}` : ''}` : '—'}
                      </td>
                      <td className="px-6 py-4">
                        {d.ip ? (
                          <span className="px-2.5 py-1 rounded-md bg-white/5 text-[11px] font-semibold uppercase tracking-wide text-gray-300">
                            Direct
                          </span>
                        ) : (
                          <span className="text-sm text-gray-500">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">{formatLastSeen(d.last_seen)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
