import { useEffect, useRef, useState } from 'react';
import { modbusApi } from '../api/modbus.js';
import { useAuth } from '../context/useAuth.js';
import { SkeletonList } from '../components/Skeleton.jsx';
import { defaultSettings } from '../api/settings.js';

// Animate a number 0 → target (easeOutCubic). setState only fires inside the
// rAF callback, never synchronously in the effect body.
function useCountUp(target, duration = 700) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    let raf;
    const start = performance.now();
    const tick = (now) => {
      const p = Math.min(1, (now - start) / duration);
      setValue(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
}

// Human-friendly alarm label, e.g. ALARM_CRITICAL_FUEL → "Critical Fuel".
function alarmLabel(type) {
  if (!type) return 'Alarm';
  return type
    .replace(/^ALARM_/, '')
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatTime(raw) {
  if (!raw) return '—';
  try { return new Date(raw).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }); }
  catch { return String(raw); }
}

// Small round icon button (the download control on each panel header).
function IconButton({ onClick, title, children }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="w-9 h-9 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-gray-300 hover:text-white transition-colors"
    >
      {children}
    </button>
  );
}

// Green "all clear" empty state shared by both panels.
function AllClear({ text }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 text-center">
      <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center mb-4 animate-scale-in">
        <svg className="w-9 h-9 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <p className="text-sm text-gray-500">{text}</p>
    </div>
  );
}

export default function Alarms() {
  const { hasPermission } = useAuth();
  // Consumption rate is a per-device fuel read — only fetch it if the user can
  // both list devices and read fuel, otherwise those calls would 403.
  const canConsumption = hasPermission('device.read') && hasPermission('fuel.read');

  const [alarms, setAlarms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState(null);
  const pollRef = useRef(null);

  // Per-device consumption rate: [{ id, name, ratePerHour, error }].
  const [rates, setRates] = useState([]);
  const [ratesLoading, setRatesLoading] = useState(true);

  // ── Live polling every 15 s ────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const fetchAlarms = () => {
      modbusApi
        .getAlarms(100)
        .then((rows) => {
          if (cancelled) return;
          setAlarms(Array.isArray(rows) ? rows : []);
          setLastUpdated(new Date());
          setError('');
        })
        .catch((err) => { if (!cancelled) setError(err.message || 'Failed to load alarms'); })
        .finally(() => { if (!cancelled) setLoading(false); });
    };
    fetchAlarms();
    pollRef.current = setInterval(fetchAlarms, 15_000);
    return () => {
      cancelled = true;
      clearInterval(pollRef.current);
    };
  }, []);

  useEffect(() => {
    if (!canConsumption) return;
    let cancelled = false;
    modbusApi
      .getDevices()
      .then(async (devs) => {
        const list = (devs ?? []).map((d) => ({ id: d.id ?? d.ID, name: d.name ?? d.NAME ?? 'Device' }));
        // Fetch each device's rate independently so one failure doesn't sink the rest.
        const results = await Promise.all(
          list.map((dev) =>
            modbusApi
              .getConsumptionRate(dev.id)
              .then((r) => ({ ...dev, ratePerHour: r?.ratePerHour ?? null }))
              .catch(() => ({ ...dev, ratePerHour: null, error: true }))
          )
        );
        if (!cancelled) setRates(results);
      })
      .catch(() => { if (!cancelled) setRates([]); })
      .finally(() => { if (!cancelled) setRatesLoading(false); });
    return () => { cancelled = true; };
  }, [canConsumption]);

  const critical = alarms.filter((a) => a.severity === 'critical').length;
  const warnings = alarms.filter((a) => a.severity !== 'critical').length;
  // No maintenance/service backend yet — these stay at zero for now.
  const upcomingService = 0;
  const serviceDue = 0;

  const STATS = [
    { key: 'critical', label: 'Critical', value: critical, bg: 'bg-red-500/10', text: 'text-red-400',
      icon: 'M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z' },
    { key: 'warnings', label: 'Warnings', value: warnings, bg: 'bg-amber-500/10', text: 'text-amber-400',
      icon: 'M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4m0 4h.01' },
    { key: 'upcoming', label: 'Upcoming Service', value: upcomingService, bg: 'bg-cyan-500/10', text: 'text-cyan-400',
      icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
    { key: 'due', label: 'Service Due', value: serviceDue, bg: 'bg-emerald-500/10', text: 'text-emerald-400',
      icon: 'M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085' },
  ];

  const exportAlarms = () => {
    const header = ['Severity', 'Alarm', 'Device', 'Time'];
    const rows = alarms.map((a) => [
      a.severity,
      alarmLabel(a.type),
      a.deviceName ?? a.deviceId ?? '',
      formatTime(a.time),
    ]);
    const csv = [header, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'active-alarms.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  // Optimistically remove the alarm, call the API, restore on failure.
  const handleAccept = async (id) => {
    setAlarms((prev) => prev.filter((a) => a.id !== id));
    try {
      // Find the device for this alarm (needed to set the shared snooze)
      const alarm = alarms.find((a) => a.id === id);
      const deviceId = alarm?.deviceId;

      await modbusApi.acknowledgeAlarm(id);

      // Set the snooze on the backend so ALL users on this device stop hearing it
      if (deviceId) {
        const cooldownMin = defaultSettings.ALARM_COOLDOWN_MINUTES || 60;
        await modbusApi.setDeviceSnooze(deviceId, Date.now() + cooldownMin * 60_000).catch(() => {});
      }

      // Tell FuelGauge (if mounted) to stop the alarm sound immediately
      window.dispatchEvent(new CustomEvent('alarm-accepted'));
    } catch {
      // Restore by re-fetching
      modbusApi.getAlarms(100)
        .then((rows) => setAlarms(Array.isArray(rows) ? rows : []))
        .catch(() => {});
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ── Stat cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {STATS.map((s, i) => (
          <StatCard key={s.key} stat={s} delay={i * 60} />
        ))}
      </div>

      {/* ── Panels ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Active Alarms */}
        <div className="rounded-2xl bg-[#1a1d27] border border-white/5 p-6 animate-slide-up delay-100">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold text-gray-100">Active Alarms</h2>
              {/* Live indicator */}
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-xs font-medium text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Live
              </span>
            </div>
            <div className="flex items-center gap-2">
              {lastUpdated && (
                <span className="text-xs text-gray-600 tabular-nums hidden sm:block">
                  Updated {lastUpdated.toLocaleTimeString(undefined, { timeStyle: 'short' })}
                </span>
              )}
              <IconButton onClick={exportAlarms} title="Export alarms">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
                </svg>
              </IconButton>
            </div>
          </div>

          {error ? (
            <div className="py-14 text-center text-sm text-red-400">{error}</div>
          ) : loading ? (
            <SkeletonList rows={4} height="h-14" className="p-0 py-2" />
          ) : alarms.length === 0 ? (
            <AllClear text="All systems operating normally" />
          ) : (
            <div className="space-y-2">
              {alarms.map((a, i) => (
                <div
                  key={a.id ?? i}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl border animate-fade-in ${
                    a.severity === 'critical'
                      ? 'bg-red-500/5 border-red-500/15'
                      : 'bg-amber-500/5 border-amber-500/10'
                  }`}
                  style={{ animationDelay: `${Math.min(i * 40, 400)}ms` }}
                >
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    a.severity === 'critical' ? 'bg-red-400 animate-pulse' : 'bg-amber-400'
                  }`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-200 truncate">{alarmLabel(a.type)}</p>
                    <p className="text-xs text-gray-500">{a.deviceName ?? `Device ${a.deviceId ?? '—'}`}</p>
                  </div>
                  <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wide flex-shrink-0 ${
                    a.severity === 'critical' ? 'bg-red-500/15 text-red-400' : 'bg-amber-500/15 text-amber-400'
                  }`}>
                    {a.severity}
                  </span>
                  <span className="text-xs text-gray-500 tabular-nums flex-shrink-0">{formatTime(a.time)}</span>
                  <button
                    onClick={() => handleAccept(a.id)}
                    title="Accept alarm"
                    className="flex-shrink-0 px-2 py-0.5 rounded-lg text-[10px] font-semibold border border-white/10 bg-white/5 text-gray-400 hover:bg-emerald-500/20 hover:text-emerald-400 hover:border-emerald-500/30 transition-colors"
                  >
                    Accept
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Service Schedule — no maintenance backend yet, always "up to date". */}
        <div className="rounded-2xl bg-[#1a1d27] border border-white/5 p-6 animate-slide-up delay-200">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-100">Service Schedule</h2>
            <IconButton title="Export schedule">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
              </svg>
            </IconButton>
          </div>
          <AllClear text="All services up to date" />
        </div>
      </div>

      {/* ── Consumption Rate (per device) ── */}
      {canConsumption && (
        <div className="rounded-2xl bg-[#1a1d27] border border-white/5 p-6 animate-slide-up delay-300">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <span className="w-10 h-10 rounded-xl bg-amber-500/15 text-amber-400 flex items-center justify-center">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              </span>
              <h2 className="text-lg font-semibold text-gray-100">Consumption Rate</h2>
            </div>
            <span className="text-xs text-gray-500">last 60 min</span>
          </div>

          {ratesLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3" aria-hidden="true">
              {Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton h-20" />)}
            </div>
          ) : rates.length === 0 ? (
            <div className="py-10 text-center text-sm text-gray-500">No devices to report</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {rates.map((r, i) => {
                const has = typeof r.ratePerHour === 'number';
                const draining = has && r.ratePerHour > 0.05;
                return (
                  <div
                    key={r.id ?? i}
                    className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-white/[0.02] border border-white/5 animate-fade-in"
                    style={{ animationDelay: `${Math.min(i * 40, 400)}ms` }}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-200 truncate">{r.name}</p>
                      <p className="text-xs text-gray-600">Device {r.id ?? '—'}</p>
                    </div>
                    {has ? (
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold tabular-nums border flex-shrink-0
                        ${draining
                          ? 'text-amber-300 bg-amber-500/10 border-amber-500/20'
                          : 'text-gray-400 bg-white/5 border-white/10'}`}
                      >
                        {draining ? '↓' : '·'} {Math.abs(r.ratePerHour).toFixed(1)}/hr
                      </span>
                    ) : (
                      <span className="text-xs text-gray-600 flex-shrink-0">No data</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Stat card with a count-up value and staggered entrance.
function StatCard({ stat, delay }) {
  const animated = Math.round(useCountUp(stat.value));
  return (
    <div
      className="rounded-2xl bg-[#1a1d27] border border-white/5 p-5 flex flex-col gap-4 animate-slide-up"
      style={{ animationDelay: `${delay}ms` }}
    >
      <span className={`w-11 h-11 rounded-xl ${stat.bg} ${stat.text} flex items-center justify-center`}>
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d={stat.icon} />
        </svg>
      </span>
      <div>
        <p className="text-3xl font-bold text-white leading-none tabular-nums">{animated}</p>
        <p className="text-sm font-medium text-gray-400 mt-1.5">{stat.label}</p>
      </div>
    </div>
  );
}
