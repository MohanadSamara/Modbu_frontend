import { useState, useEffect, useCallback } from 'react';
import modbusApi from '../api/modbus.js';
import { SkeletonList } from '../components/Skeleton.jsx';
import Editable from '../components/pageedit/Editable.jsx';

const TYPE_META = {
  START: { label: 'START', bg: 'bg-emerald-500/15', text: 'text-emerald-400', dot: 'bg-emerald-400' },
  STOP:  { label: 'STOP',  bg: 'bg-red-500/15',     text: 'text-red-400',     dot: 'bg-red-400' },
};

const AUTO_REFRESH_MS = 15_000;

function TypeBadge({ type }) {
  const meta = TYPE_META[type] ?? { label: type, bg: 'bg-blue-500/15', text: 'text-blue-400', dot: 'bg-blue-400' };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold ${meta.bg} ${meta.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  );
}

function formatTime(raw) {
  if (!raw) return '—';
  try {
    return new Date(raw).toLocaleString(undefined, {
      dateStyle: 'short',
      timeStyle: 'medium',
    });
  } catch {
    return String(raw);
  }
}

// "just now", "4m ago", "3h ago", "2d ago" — quick scanning for ops users;
// the exact timestamp stays right above it.
function timeAgo(raw) {
  if (!raw) return '';
  const t = new Date(raw).getTime();
  if (!Number.isFinite(t)) return '';
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function Events() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('ALL');
  const [query, setQuery] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);

  // `background` reloads (initial mount + auto-refresh) keep the table on
  // screen instead of flashing the spinner and blanking the rows. The first
  // load relies on the initial `loading: true` state.
  const loadEvents = useCallback(async (background = false) => {
    try {
      if (!background) setLoading(true);
      const data = await modbusApi.getDeviceActions();
      setEvents(Array.isArray(data) ? data.slice(0, 100) : []);
      setError('');
    } catch (err) {
      setError(err?.message || 'Failed to load events');
      if (!background) setEvents([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadEvents(true); }, [loadEvents]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(() => loadEvents(true), AUTO_REFRESH_MS);
    return () => clearInterval(id);
  }, [autoRefresh, loadEvents]);

  const TYPES = ['ALL', ...Array.from(new Set(events.map((e) => e.type).filter(Boolean)))];
  const q = query.trim().toLowerCase();
  const visible = events.filter((e) => {
    if (filter !== 'ALL' && e.type !== filter) return false;
    if (!q) return true;
    return [e.device, e.type, e.id].some((v) => String(v ?? '').toLowerCase().includes(q));
  });

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <Editable id="events.title" as="h1" className="text-2xl font-bold text-white tracking-tight">Events & Logs</Editable>
          <p className="text-sm text-gray-400 mt-1">
            {loading ? 'Loading…' : `${visible.length} event${visible.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Live auto-refresh toggle */}
          <button
            onClick={() => setAutoRefresh((v) => !v)}
            aria-pressed={autoRefresh}
            title={autoRefresh ? 'Auto-refresh on (every 15 s)' : 'Auto-refresh off'}
            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border transition-colors
              ${autoRefresh
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10 hover:text-gray-200'
              }`}
          >
            <span className={`w-2 h-2 rounded-full ${autoRefresh ? 'bg-emerald-400 animate-pulse' : 'bg-gray-600'}`} />
            Live
          </button>
          <button
            onClick={() => loadEvents()}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-500 disabled:opacity-50 transition-colors shadow"
          >
            <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div role="alert" className="flex items-center gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {error}
        </div>
      )}

      {/* Search + filter pills */}
      {!loading && events.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="relative sm:max-w-xs w-full">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none"
                 fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search device or action…"
              aria-label="Search events"
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-[#1a1d27] border border-white/10 text-sm text-gray-200
                         placeholder-gray-600 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/30
                         transition-colors"
            />
          </div>
          {TYPES.length > 1 && (
            <div className="flex flex-wrap gap-2">
              {TYPES.map((t) => (
                <button
                  key={t}
                  onClick={() => setFilter(t)}
                  aria-pressed={filter === t}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors
                    ${filter === t
                      ? 'bg-blue-600 text-white shadow'
                      : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-gray-200'
                    }`}
                >
                  {t}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Table card */}
      <div className="rounded-2xl bg-[#1a1d27] border border-white/5 overflow-hidden">
        {loading ? (
          <SkeletonList rows={8} height="h-9" />
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center px-6">
            <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <p className="text-gray-300 font-semibold">No events found</p>
            <p className="text-gray-500 text-sm mt-1">
              {q
                ? `Nothing matches "${query}". Try a different search.`
                : filter !== 'ALL'
                  ? `No "${filter}" events. Try a different filter.`
                  : 'Connect a device and perform actions to see logs here.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px]">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="px-6 py-4 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-widest">
                    #
                  </th>
                  <th className="px-6 py-4 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-widest">
                    Time
                  </th>
                  <th className="px-6 py-4 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-widest">
                    Device
                  </th>
                  <th className="px-6 py-4 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-widest">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {visible.map((event, idx) => (
                  <tr
                    key={event.id ?? idx}
                    className="hover:bg-white/3 transition-colors group"
                  >
                    <td className="px-6 py-4 text-xs text-gray-600 font-mono">
                      {event.id ?? idx + 1}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="block text-sm text-gray-300 font-mono tabular">
                        {formatTime(event.time ?? event.timestamp)}
                      </span>
                      <span className="block text-[11px] text-gray-600 mt-0.5">
                        {timeAgo(event.time ?? event.timestamp)}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0">
                          <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                          </svg>
                        </div>
                        <span className="text-sm text-gray-200 font-medium">
                          {event.device ?? '—'}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <TypeBadge type={event.type} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Footer count */}
      {!loading && visible.length > 0 && (
        <p className="text-xs text-gray-600 text-center">
          Showing {visible.length} of {events.length} events
          {autoRefresh && ' · refreshing every 15 s'}
        </p>
      )}
    </div>
  );
}
