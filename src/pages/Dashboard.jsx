import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/useAuth.js';
import { modbusApi } from '../api/modbus.js';
import { projectsApi } from '../api/projects.js';
import DeviceMap from '../components/DeviceMap.jsx';

// Backend returns device rows with Oracle's uppercase keys; normalize the few
// fields the dashboard needs into a stable shape.
function normalizeDevice(d) {
  const num = (v) => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  return {
    id: d.id ?? d.ID,
    name: d.name ?? d.NAME,
    ip: d.ip ?? d.IP,
    port: d.port ?? d.PORT,
    status: (d.status ?? d.STATUS ?? 'offline').toString().toLowerCase(),
    latitude: num(d.latitude ?? d.LATITUDE),
    longitude: num(d.longitude ?? d.LONGITUDE),
    altitude: num(d.altitude ?? d.ALTITUDE),
  };
}

// ── Overview card shell ───────────────────────────────────────────────────
// Every overview card shares the same header: a coloured icon tile, a title,
// and an optional action (arrow link or custom controls) on the right.
function Card({ icon, iconClass, title, action, children, className = '' }) {
  return (
    <div className={`rounded-2xl bg-[#1a1d27] border border-white/5 p-6 flex flex-col ${className}`}>
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <span className={`w-10 h-10 rounded-xl flex items-center justify-center ${iconClass}`}>
            {icon}
          </span>
          <h2 className="text-lg font-semibold text-gray-100">{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

// Round arrow button used in the top-right of most cards.
function ArrowLink({ to }) {
  return (
    <Link
      to={to}
      className="w-9 h-9 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-gray-300 hover:text-white transition-colors"
      aria-label="Open"
    >
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
    </Link>
  );
}

// ── Health donut ────────────────────────────────────────────────────────────
const HEALTH_SEGMENTS = [
  { key: 'online', label: 'Online', color: '#34d399', dot: 'bg-emerald-400' },
  { key: 'shutdown', label: 'Shutdown', color: '#f87171', dot: 'bg-red-400' },
  { key: 'offline', label: 'Offline', color: '#6b7280', dot: 'bg-gray-500' },
];

function HealthDonut({ counts, total }) {
  const R = 52;
  const C = 2 * Math.PI * R;
  // Build the coloured arcs. When there are no devices we still draw the track.
  let offset = 0;
  const arcs = total
    ? HEALTH_SEGMENTS.filter((s) => counts[s.key] > 0).map((s) => {
        const frac = counts[s.key] / total;
        const arc = {
          color: s.color,
          dash: frac * C,
          gap: C - frac * C,
          rotation: (offset / total) * 360 - 90,
        };
        offset += counts[s.key];
        return arc;
      })
    : [];
  const onlinePct = total ? Math.round((counts.online / total) * 100) : 0;

  return (
    <div className="flex items-center gap-6">
      <div className="relative flex-shrink-0">
        <svg viewBox="0 0 120 120" className="w-36 h-36">
          <circle cx="60" cy="60" r={R} fill="none" stroke="#ffffff10" strokeWidth="15" />
          {arcs.map((a, i) => (
            <circle
              key={i}
              cx="60" cy="60" r={R}
              fill="none"
              stroke={a.color}
              strokeWidth="15"
              strokeDasharray={`${a.dash} ${a.gap}`}
              transform={`rotate(${a.rotation} 60 60)`}
              style={{ transition: 'stroke-dasharray 0.6s ease' }}
            />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-bold text-white leading-none tabular-nums">{total}</span>
          <span className="text-xs text-gray-500 mt-1">devices</span>
        </div>
        <span className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1 text-[11px] font-semibold text-gray-400">
          {onlinePct}%
        </span>
      </div>

      <div className="flex flex-col gap-3 flex-1">
        {HEALTH_SEGMENTS.map((s) => (
          <div key={s.key} className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className={`w-2.5 h-2.5 rounded-full ${s.dot}`} />
              <span className="text-sm text-gray-300">{s.label}</span>
            </div>
            <span className="text-sm font-semibold text-gray-200 tabular-nums">{counts[s.key]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Old-page stat cards (values are placeholders, as before) ────────────────
const STAT_CARDS = [
  {
    key: 'projects',
    label: 'Projects',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
          d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
      </svg>
    ),
    color: 'from-blue-500 to-indigo-500',
    bg: 'bg-blue-500/10',
    text: 'text-blue-400',
    desc: 'Active projects',
  },
  {
    key: 'devices',
    label: 'Devices',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
          d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
      </svg>
    ),
    color: 'from-emerald-500 to-teal-500',
    bg: 'bg-emerald-500/10',
    text: 'text-emerald-400',
    desc: 'Connected devices',
  },
  {
    key: 'events',
    label: 'Events',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
          d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
      </svg>
    ),
    color: 'from-amber-500 to-orange-500',
    bg: 'bg-amber-500/10',
    text: 'text-amber-400',
    desc: 'Recent log entries',
  },
  {
    key: 'uptime',
    label: 'Uptime',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
          d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
    color: 'from-purple-500 to-pink-500',
    bg: 'bg-purple-500/10',
    text: 'text-purple-400',
    desc: 'Devices online',
  },
];

const QUICK_LINKS = [
  {
    to: '/projects',
    label: 'Manage Projects',
    desc: 'Create locations, add and connect Modbus devices.',
    permission: 'project.read',
    icon: (
      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6}
          d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
      </svg>
    ),
    accent: 'group-hover:text-blue-400',
    border: 'hover:border-blue-500/40',
  },
  {
    to: '/events',
    label: 'View Events',
    desc: 'Browse device action logs and Modbus events.',
    permission: 'alarm.read',
    icon: (
      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6}
          d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
      </svg>
    ),
    accent: 'group-hover:text-amber-400',
    border: 'hover:border-amber-500/40',
  },
  {
    to: '/settings',
    label: 'Configure Settings',
    desc: 'Adjust alarms, connection timeouts and display options.',
    permission: 'settings.read',
    icon: (
      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6}
          d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
    accent: 'group-hover:text-purple-400',
    border: 'hover:border-purple-500/40',
  },
];

export default function Dashboard() {
  const { hasPermission } = useAuth();
  // Only surface shortcuts the user can actually open.
  const quickLinks = QUICK_LINKS.filter((l) => !l.permission || hasPermission(l.permission));

  const canReadDevices = hasPermission('device.read');
  const canReadAlarms = hasPermission('alarm.read');
  const canReadProjects = hasPermission('project.read');

  // Load all visible devices for the overview grid and map. Gated on
  // device.read so we don't fire a 403 for users who can't see devices.
  const [devices, setDevices] = useState([]);
  const [devicesError, setDevicesError] = useState('');
  // Counts for the stat cards. null = still loading / not fetched yet.
  const [projectCount, setProjectCount] = useState(null);
  const [eventCount, setEventCount] = useState(null);

  useEffect(() => {
    if (!canReadDevices) return;
    let cancelled = false;
    modbusApi
      .getDevices()
      .then((rows) => {
        if (!cancelled) setDevices((rows ?? []).map(normalizeDevice));
      })
      .catch((err) => {
        if (!cancelled) setDevicesError(err.message || 'Failed to load devices');
      });
    return () => { cancelled = true; };
  }, [canReadDevices]);

  // Project count for the stat card (gated on project.read).
  useEffect(() => {
    if (!canReadProjects) return;
    let cancelled = false;
    projectsApi
      .list()
      .then((rows) => { if (!cancelled) setProjectCount(Array.isArray(rows) ? rows.length : 0); })
      .catch(() => { if (!cancelled) setProjectCount(null); });
    return () => { cancelled = true; };
  }, [canReadProjects]);

  // Event count for the stat card (gated on alarm.read). Uses the same
  // device-actions log the Events page reads.
  useEffect(() => {
    if (!canReadAlarms) return;
    let cancelled = false;
    modbusApi
      .getDeviceActions()
      .then((rows) => { if (!cancelled) setEventCount(Array.isArray(rows) ? rows.length : 0); })
      .catch(() => { if (!cancelled) setEventCount(null); });
    return () => { cancelled = true; };
  }, [canReadAlarms]);

  const counts = {
    online: devices.filter((d) => d.status === 'online').length,
    shutdown: devices.filter((d) => d.status === 'shutdown').length,
    // Anything not online/shutdown counts as offline.
    offline: devices.filter((d) => d.status !== 'online' && d.status !== 'shutdown').length,
  };

  const locatedCount = devices.filter(
    (d) => typeof d.latitude === 'number' && typeof d.longitude === 'number'
  ).length;

  // Resolved values for the stat cards. Show '—' when the user can't read that
  // resource, or while the fetch is still in flight / failed.
  const onlinePct = devices.length ? Math.round((counts.online / devices.length) * 100) : null;
  const statValues = {
    projects: canReadProjects ? (projectCount ?? '—') : '—',
    devices: canReadDevices ? devices.length : '—',
    events: canReadAlarms ? (eventCount ?? '—') : '—',
    uptime: canReadDevices && onlinePct != null ? `${onlinePct}%` : '—',
  };

  return (
    <div className="space-y-10 animate-fade-in">

      {/* ═══ New overview grid ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">

        {/* ── Health ── */}
        {canReadDevices && (
          <Card
            title="Health"
            iconClass="bg-emerald-500/15 text-emerald-400"
            icon={
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
              </svg>
            }
            action={<ArrowLink to="/connections" />}
          >
            {devicesError ? (
              <div className="flex-1 flex items-center justify-center text-sm text-red-400 text-center">
                {devicesError}
              </div>
            ) : (
              <HealthDonut counts={counts} total={devices.length} />
            )}
          </Card>
        )}

        {/* ── Alarms ── */}
        {canReadAlarms && (
          <Card
            title="Alarms"
            iconClass="bg-emerald-500/15 text-emerald-400"
            icon={
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
            }
            action={<ArrowLink to="/alarms" />}
          >
            <div className="flex-1 flex flex-col items-center justify-center text-center py-4">
              <div className="w-14 h-14 rounded-full bg-emerald-500/10 flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-base font-semibold text-gray-100">No Active Alarms</p>
              <p className="text-sm text-gray-500 mt-1">All systems operating normally</p>
            </div>
          </Card>
        )}

        {/* ── Run History ── */}
        {canReadAlarms && (
          <Card
            title="Run History"
            iconClass="bg-cyan-500/15 text-cyan-400"
            icon={
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                  d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            }
            action={<ArrowLink to="/events" />}
          >
            <p className="text-sm text-gray-400">Running hours (this week)</p>
            <div className="flex items-end justify-between mt-1">
              <div className="flex items-baseline gap-1.5">
                <span className="text-4xl font-bold text-white leading-none">0.0</span>
                <span className="text-lg font-semibold text-gray-400">hrs</span>
              </div>
              <div className="text-right">
                <p className="text-sm text-gray-300">0.0 hrs/day</p>
                <p className="text-xs text-gray-600">average</p>
              </div>
            </div>
            <div className="flex items-center gap-2 mt-4 text-xs text-gray-500">
              <span className="w-1.5 h-1.5 rounded-full bg-gray-600" />
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                  d="M4 7v10c0 2 1 3 3 3h10c2 0 3-1 3-3V7c0-2-1-3-3-3H7c-2 0-3 1-3 3z" />
              </svg>
              No historical data
            </div>
            <div className="flex-1 flex flex-col items-center justify-center text-center mt-2">
              <svg className="w-10 h-10 text-gray-700 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6}
                  d="M9 19v-6m4 6V9m4 10V5M5 19h14" />
              </svg>
              <p className="text-sm text-gray-500">No run history available</p>
              <p className="text-xs text-gray-600 mt-0.5">Engine RPM data will appear here</p>
            </div>
          </Card>
        )}

        {/* ── Fuel Levels ── */}
        {canReadDevices && (
          <Card
            title="Fuel Levels"
            iconClass="bg-amber-500/15 text-amber-400"
            icon={
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2c-4 4.5-6 8-6 11a6 6 0 0012 0c0-3-2-6.5-6-11z" />
              </svg>
            }
            action={
              <div className="flex items-center gap-2">
                <button
                  className="w-9 h-9 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-gray-300 hover:text-white transition-colors"
                  aria-label="Fuel info"
                  title="Info"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </button>
                <ArrowLink to="/fuel" />
              </div>
            }
          >
            <div className="flex-1 flex flex-col items-center justify-center text-center py-6">
              <svg className="w-12 h-12 text-gray-700 mb-3" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2c-4 4.5-6 8-6 11a6 6 0 0012 0c0-3-2-6.5-6-11z" opacity="0.5" />
              </svg>
              <p className="text-sm text-gray-500">No fuel data available</p>
            </div>
          </Card>
        )}

        {/* ── SCADA Dashboard ── */}
        <Card
          title="SCADA Dashboard"
          iconClass="bg-cyan-500/15 text-cyan-400"
          icon={
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M3 3h8v8H3V3zm10 0h8v8h-8V3zM3 13h8v8H3v-8zm10 0h8v8h-8v-8z" />
            </svg>
          }
          action={<ArrowLink to="/projects" />}
        >
          <div className="flex-1 flex flex-col items-center justify-center text-center rounded-xl bg-gradient-to-br from-cyan-500/5 to-blue-500/5 border border-white/5 py-8 px-4">
            <div className="w-16 h-16 rounded-2xl bg-cyan-500/15 flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 4v16m8-8H4" />
              </svg>
            </div>
            <p className="text-lg font-semibold text-gray-100">Create Your Dashboard</p>
            <p className="text-sm text-gray-500 mt-1 max-w-xs">
              Design a custom monitoring view with widgets and live data
            </p>
            <Link
              to="/projects"
              className="inline-flex items-center gap-2 mt-5 px-5 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-semibold transition-colors shadow-lg"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Get Started
            </Link>
          </div>
        </Card>

        {/* ── Device Map ── */}
        {canReadDevices && (
          <Card
            title="Device Map"
            iconClass="bg-cyan-500/15 text-cyan-400"
            icon={
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 110-5 2.5 2.5 0 010 5z" />
              </svg>
            }
            action={<ArrowLink to="/map" />}
          >
            <div className="relative flex-1 min-h-[240px] rounded-xl overflow-hidden">
              <div className="absolute top-3 left-3 z-[400] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1a1d27]/90 backdrop-blur text-xs font-semibold text-cyan-300 border border-white/10">
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 110-5 2.5 2.5 0 010 5z" />
                </svg>
                {locatedCount} device{locatedCount === 1 ? '' : 's'}
              </div>
              {/* Fill the card: override DeviceMap's fixed 420px height so the
                  embedded Leaflet map stretches to this smaller preview area. */}
              <div className="absolute inset-0 [&_.leaflet-container]:!h-full [&>div]:!h-full [&>div]:!rounded-none [&>div]:!border-0">
                <DeviceMap devices={devices} />
              </div>
            </div>
          </Card>
        )}

      </div>

      {/* ═══ Original dashboard (restored below the grid) ═══ */}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {STAT_CARDS.map((card) => (
          <div
            key={card.label}
            className="rounded-2xl bg-[#1a1d27] border border-white/5 p-5 flex flex-col gap-3 hover:border-white/10 transition-colors"
          >
            <div className={`w-11 h-11 rounded-xl ${card.bg} flex items-center justify-center ${card.text}`}>
              {card.icon}
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{statValues[card.key]}</p>
              <p className="text-sm font-medium text-gray-400">{card.label}</p>
              <p className="text-xs text-gray-600 mt-0.5">{card.desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Quick links — hidden entirely if the user can't open any of them */}
      {quickLinks.length > 0 && (
      <div>
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-widest mb-4">
          Quick Access
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {quickLinks.map(({ to, label, desc, icon, accent, border }) => (
            <Link
              key={to}
              to={to}
              className={`group rounded-2xl bg-[#1a1d27] border border-white/5 p-6 flex items-start gap-4 transition-all duration-200 hover:bg-[#1e2130] ${border}`}
            >
              <span className={`mt-0.5 text-gray-500 transition-colors ${accent}`}>
                {icon}
              </span>
              <div>
                <p className={`font-semibold text-gray-200 transition-colors ${accent}`}>
                  {label}
                </p>
                <p className="text-sm text-gray-500 mt-1 leading-relaxed">{desc}</p>
              </div>
              <svg
                className="w-4 h-4 text-gray-600 ml-auto self-center flex-shrink-0 group-hover:text-gray-400 transition-colors"
                fill="none" viewBox="0 0 24 24" stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          ))}
        </div>
      </div>
      )}

    </div>
  );
}
