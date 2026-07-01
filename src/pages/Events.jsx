import { useState, useEffect } from 'react';
import modbusApi from '../api/modbus.js';

const TYPE_META = {
  START: { label: 'START', bg: 'bg-emerald-500/15', text: 'text-emerald-400', dot: 'bg-emerald-400' },
  STOP:  { label: 'STOP',  bg: 'bg-red-500/15',     text: 'text-red-400',     dot: 'bg-red-400' },
};

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

export default function Events() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('ALL');

  useEffect(() => { loadEvents(); }, []);

  const loadEvents = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await modbusApi.getDeviceActions();
      setEvents(Array.isArray(data) ? data.slice(0, 100) : []);
    } catch (err) {
      setError(err?.message || 'Failed to load events');
      setEvents([]);
    } finally {
      setLoading(false);
    }
  };

  const TYPES = ['ALL', ...Array.from(new Set(events.map((e) => e.type).filter(Boolean)))];
  const visible = filter === 'ALL' ? events : events.filter((e) => e.type === filter);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Events & Logs</h1>
          <p className="text-sm text-gray-400 mt-1">
            {loading ? 'Loading…' : `${visible.length} event${visible.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <button
          onClick={loadEvents}
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

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {error}
        </div>
      )}

      {/* Filter pills */}
      {!loading && TYPES.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {TYPES.map((t) => (
            <button
              key={t}
              onClick={() => setFilter(t)}
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

      {/* Table card */}
      <div className="rounded-2xl bg-[#1a1d27] border border-white/5 overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="w-10 h-10 rounded-full border-2 border-blue-500/30 border-t-blue-500 animate-spin" />
            <p className="text-gray-500 text-sm">Loading events…</p>
          </div>
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
              {filter !== 'ALL' ? `No "${filter}" events. Try a different filter.` : 'Connect a device and perform actions to see logs here.'}
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
                    <td className="px-6 py-4 text-sm text-gray-300 font-mono whitespace-nowrap">
                      {formatTime(event.time ?? event.timestamp)}
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
        </p>
      )}
    </div>
  );
}
