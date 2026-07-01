// ============================================================================
// AuditLog — recent authentication events (login OK/fail, logout,
// password change, account lock/unlock, registrations).
//
// Backed by /api/audit (requires audit.read permission).
// ============================================================================

import { useEffect, useState, useCallback } from 'react';
import { auditApi } from '../api/auth';

const EVENT_STYLE = {
  LOGIN_OK:        { color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/30', label: 'Login' },
  LOGIN_FAIL:      { color: 'text-amber-400',   bg: 'bg-amber-500/10 border-amber-500/30',     label: 'Login failed' },
  LOGOUT:          { color: 'text-gray-400',    bg: 'bg-gray-500/10 border-gray-500/30',       label: 'Logout' },
  PASSWORD_CHANGE: { color: 'text-blue-400',    bg: 'bg-blue-500/10 border-blue-500/30',       label: 'Password change' },
  LOCKED:          { color: 'text-red-400',     bg: 'bg-red-500/10 border-red-500/30',         label: 'Locked' },
  UNLOCKED:        { color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/30', label: 'Unlocked' },
  REGISTERED:      { color: 'text-indigo-400',  bg: 'bg-indigo-500/10 border-indigo-500/30',   label: 'Registered' },
};

export default function AuditLog() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('ALL');
  const [limit, setLimit] = useState(100);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await auditApi.list({ limit });
      setEvents(data || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => { load(); }, [load]);

  const filtered = filter === 'ALL'
    ? events
    : events.filter((ev) => ev.eventType === filter);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-white text-xl font-semibold">Audit Log</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            Authentication events from across the system.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="px-3 py-2 bg-[#13151c] border border-white/10 rounded-lg text-white text-xs focus:outline-none focus:border-blue-500"
          >
            <option value="ALL">All events</option>
            {Object.keys(EVENT_STYLE).map((k) => (
              <option key={k} value={k}>{EVENT_STYLE[k].label}</option>
            ))}
          </select>
          <select
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="px-3 py-2 bg-[#13151c] border border-white/10 rounded-lg text-white text-xs focus:outline-none focus:border-blue-500"
          >
            <option value={50}>Last 50</option>
            <option value={100}>Last 100</option>
            <option value={250}>Last 250</option>
            <option value={500}>Last 500</option>
            <option value={1000}>Last 1000</option>
          </select>
          <button
            onClick={load}
            className="p-2 bg-[#13151c] border border-white/10 rounded-lg text-gray-400 hover:text-white"
            title="Refresh"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>

      {error && (
        <div className="px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm">
          {error}
        </div>
      )}

      <div className="bg-[#13151c] border border-white/5 rounded-2xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-400">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-white/[0.02] text-gray-500 text-xs uppercase tracking-wider">
                <tr>
                  <th className="text-left px-5 py-3 font-medium">When</th>
                  <th className="text-left px-5 py-3 font-medium">Event</th>
                  <th className="text-left px-5 py-3 font-medium">User</th>
                  <th className="text-left px-5 py-3 font-medium">IP</th>
                  <th className="text-left px-5 py-3 font-medium">Detail</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filtered.length === 0 && (
                  <tr><td colSpan={5} className="text-center py-8 text-gray-500">No events.</td></tr>
                )}
                {filtered.map((ev) => {
                  const style = EVENT_STYLE[ev.eventType] || { color: 'text-gray-300', bg: 'bg-white/5 border-white/10', label: ev.eventType };
                  return (
                    <tr key={ev.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-5 py-3 text-gray-400 text-xs whitespace-nowrap">
                        {ev.time ? new Date(ev.time).toLocaleString() : '—'}
                      </td>
                      <td className="px-5 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[11px] font-medium ${style.bg} ${style.color}`}>
                          {style.label}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-gray-300">
                        {ev.usernameTry || (ev.userId ? `#${ev.userId}` : '—')}
                      </td>
                      <td className="px-5 py-3 text-gray-500 text-xs font-mono">
                        {ev.ip || '—'}
                      </td>
                      <td className="px-5 py-3 text-gray-400 text-xs truncate max-w-md" title={ev.detail || ''}>
                        {ev.detail || (ev.userAgent ? ev.userAgent.slice(0, 60) + (ev.userAgent.length > 60 ? '…' : '') : '—')}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
