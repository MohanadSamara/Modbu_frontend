import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { modbusApi } from '../api/modbus.js';
import { brandsApi } from '../api/brands.js';
import { datakomApi } from '../api/datakom.js';
import { useAuth } from '../context/useAuth.js';
import { useToast, useConfirm } from '../context/useFeedback.js';
import { SkeletonTableRows } from '../components/Skeleton.jsx';
import Editable from '../components/pageedit/Editable.jsx';

// Fetch Datakom status + device list then overlay live status onto any device
// that has a datakom_did link. Returns the merged list.
async function mergeDatakomStatus(rows) {
  try {
    const st = await datakomApi.status();
    if (!st?.ready) return rows; // adapter not connected — keep stored status
    const datakomDevices = await datakomApi.devices();
    const byDid = new Map((Array.isArray(datakomDevices) ? datakomDevices : []).map((d) => [d.did, d]));
    return rows.map((r) => {
      if (!r.datakom_did) return r;
      const dd = byDid.get(r.datakom_did);
      const isOnline = dd?.reading?.readAt != null;
      return { ...r, status: isOnline ? 'online' : 'offline' };
    });
  } catch {
    return rows; // Datakom unreachable — keep stored status
  }
}

// Backend device rows use Oracle uppercase keys; normalize the fields we show.
function normalizeDevice(d) {
  const num = (v) => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
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
    latitude: num(d.latitude ?? d.LATITUDE),
    longitude: num(d.longitude ?? d.LONGITUDE),
    datakom_did: num(d.datakom_did ?? d.DATAKOM_DID),
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
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const canWrite = hasPermission('device.write');

  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  // Bumped by the refresh button to re-run the fetch effect.
  const [reloadKey, setReloadKey] = useState(0);

  // Brand options for the edit form.
  const [brands, setBrands] = useState([]);
  useEffect(() => {
    let alive = true;
    brandsApi.list()
      .then((rows) => { if (alive) setBrands(Array.isArray(rows) ? rows : []); })
      .catch(() => { if (alive) setBrands([]); });
    return () => { alive = false; };
  }, []);

  // Inline edit modal state: the device being edited (or null) + the form.
  const [editDevice, setEditDevice] = useState(null);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  // Open the Projects page focused on this device. The Projects tree restores
  // a selection from the device's STABLE backend id in localStorage.
  const openInProjects = (d) => {
    if (d.id == null) return;
    localStorage.setItem('projects-sel-device-bid', String(d.id));
    localStorage.removeItem('projects-sel-location-bid');
    localStorage.removeItem('projects-sel-project-bid');
    navigate('/projects');
  };

  const beginEdit = (d) => {
    setEditDevice(d);
    setForm({
      name: d.name ?? '',
      ip: d.ip ?? '',
      port: d.port ?? '',
      status: d.status ?? 'offline',
      brand_id: d.brand_id ?? '',
      latitude: d.latitude ?? '',
      longitude: d.longitude ?? '',
    });
  };
  const closeEdit = () => { setEditDevice(null); setForm(null); };
  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const saveEdit = async (e) => {
    e?.preventDefault?.();
    if (!form.name.trim()) { toast.error('Device name is required'); return; }
    setSaving(true);
    try {
      await modbusApi.updateDevice(editDevice.id, {
        name: form.name.trim(),
        ip: form.ip.trim(),
        port: form.port === '' ? undefined : Number(form.port),
        status: form.status,
        brand_id: form.brand_id === '' ? null : Number(form.brand_id),
        latitude: form.latitude === '' ? '' : Number(form.latitude),
        longitude: form.longitude === '' ? '' : Number(form.longitude),
      });
      toast.success('Device updated');
      closeEdit();
      setReloadKey((k) => k + 1);
    } catch (err) {
      toast.error(err.message || 'Update failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (d) => {
    const ok = await confirm({
      title: 'Delete device',
      message: `Delete "${d.name}"? This removes the device and its readings/actions. This cannot be undone.`,
      danger: true,
    });
    if (!ok) return;
    try {
      await modbusApi.deleteDevice(d.id);
      toast.success('Device deleted');
      setDevices((prev) => prev.filter((x) => x.id !== d.id));
    } catch (err) {
      toast.error(err.message || 'Delete failed');
    }
  };

  useEffect(() => {
    let cancelled = false;
    modbusApi
      .getDevices()
      .then(async (rows) => {
        if (cancelled) return;
        const normalized = (rows ?? []).map(normalizeDevice);
        const merged = await mergeDatakomStatus(normalized);
        if (!cancelled) { setDevices(merged); setError(''); }
      })
      .catch((err) => { if (!cancelled) setError(err.message || 'Failed to load devices'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [reloadKey]);

  // Auto-poll every 10 s to keep status fresh without a manual refresh.
  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const rows = await modbusApi.getDevices();
        const normalized = (rows ?? []).map(normalizeDevice);
        const merged = await mergeDatakomStatus(normalized);
        setDevices(merged);
      } catch { /* ignore transient errors */ }
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
      d.datakom_did ? `Datakom Rainbow (did ${d.datakom_did})` : d.ip ? 'Direct' : '',
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
          <Editable id="connections.title" as="h1" className="text-base font-bold uppercase tracking-wide text-gray-100">Device Connections</Editable>
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
                <th className="px-6 py-4 text-right text-[11px] font-semibold text-gray-500 uppercase tracking-widest">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {error ? (
                <tr><td colSpan={7} className="px-6 py-10 text-center text-sm text-red-400">{error}</td></tr>
              ) : loading ? (
                <SkeletonTableRows rows={5} cols={7} />
              ) : visible.length === 0 ? (
                <tr><td colSpan={7} className="px-6 py-10 text-center text-sm text-gray-500">No devices match your filters</td></tr>
              ) : (
                visible.map((d, i) => {
                  const meta = statusMeta(d.status);
                  const open = () => openInProjects(d);
                  return (
                    <tr
                      key={d.id ?? d.name}
                      onClick={open}
                      onKeyDown={(e) => { if (e.key === 'Enter') open(); }}
                      tabIndex={0}
                      role="button"
                      title="Open in Projects"
                      className="border-b border-white/5 last:border-0 hover:bg-white/[0.03] focus:bg-white/[0.03] focus:outline-none cursor-pointer transition-colors animate-fade-in"
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
                        {d.datakom_did ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-orange-500/10 border border-orange-500/20 text-[11px] font-semibold uppercase tracking-wide text-orange-300">
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
                            </svg>
                            Datakom Rainbow
                          </span>
                        ) : d.ip ? (
                          <span className="px-2.5 py-1 rounded-md bg-white/5 text-[11px] font-semibold uppercase tracking-wide text-gray-300">
                            Direct
                          </span>
                        ) : (
                          <span className="text-sm text-gray-500">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">{formatLastSeen(d.last_seen)}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-1.5">
                          {canWrite && (
                            <>
                              <button
                                onClick={(e) => { e.stopPropagation(); beginEdit(d); }}
                                title="Edit device"
                                className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-gray-300 hover:text-white transition-colors"
                              >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleDelete(d); }}
                                title="Delete device"
                                className="w-8 h-8 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/25 flex items-center justify-center text-red-300 transition-colors"
                              >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </>
                          )}
                          <svg className="w-4 h-4 text-gray-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Edit device modal (stays on this page) ── */}
      {editDevice && form && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Edit device">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={saving ? undefined : closeEdit} />
          <form onSubmit={saveEdit} className="animate-scale-in relative w-full max-w-lg rounded-2xl bg-[#13151c] border border-white/10 shadow-2xl p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-semibold text-white">Edit device #{editDevice.id}</h3>
              <button type="button" onClick={closeEdit} className="p-1 rounded text-gray-500 hover:text-gray-200" aria-label="Close">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="flex flex-col gap-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-widest text-gray-500">Name</span>
                <input value={form.name} onChange={(e) => setField('name', e.target.value)}
                  className="px-3 py-2.5 rounded-xl bg-[#0f1219] border border-white/10 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/30" />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-widest text-gray-500">Status</span>
                <select value={form.status} onChange={(e) => setField('status', e.target.value)}
                  className="px-3 py-2.5 rounded-xl bg-[#0f1219] border border-white/10 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/30">
                  <option value="online">Online</option>
                  <option value="offline">Offline</option>
                  <option value="shutdown">Shutdown</option>
                </select>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-widest text-gray-500">IP Address</span>
                <input value={form.ip} onChange={(e) => setField('ip', e.target.value)} placeholder="192.168.1.20"
                  className="px-3 py-2.5 rounded-xl bg-[#0f1219] border border-white/10 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/30" />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-widest text-gray-500">Port</span>
                <input type="number" value={form.port} onChange={(e) => setField('port', e.target.value)} placeholder="502"
                  className="px-3 py-2.5 rounded-xl bg-[#0f1219] border border-white/10 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/30" />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-widest text-gray-500">Brand</span>
                <select value={form.brand_id} onChange={(e) => setField('brand_id', e.target.value)}
                  className="px-3 py-2.5 rounded-xl bg-[#0f1219] border border-white/10 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/30">
                  <option value="">— None —</option>
                  {brands.map((b) => (
                    <option key={b.id ?? b.ID} value={b.id ?? b.ID}>{b.name ?? b.NAME}</option>
                  ))}
                </select>
              </label>
              <div className="hidden sm:block" />
              <label className="flex flex-col gap-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-widest text-gray-500">Latitude</span>
                <input type="number" step="any" value={form.latitude} onChange={(e) => setField('latitude', e.target.value)} placeholder="31.5"
                  className="px-3 py-2.5 rounded-xl bg-[#0f1219] border border-white/10 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/30" />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-widest text-gray-500">Longitude</span>
                <input type="number" step="any" value={form.longitude} onChange={(e) => setField('longitude', e.target.value)} placeholder="34.75"
                  className="px-3 py-2.5 rounded-xl bg-[#0f1219] border border-white/10 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/30" />
              </label>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={closeEdit} disabled={saving}
                className="px-5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-sm font-semibold text-gray-300 transition-colors">
                Cancel
              </button>
              <button type="submit" disabled={saving}
                className="px-5 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-sm font-semibold transition-colors">
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
