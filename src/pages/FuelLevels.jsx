import { useEffect, useRef, useState } from 'react';
import {
  ResponsiveContainer, RadialBarChart, RadialBar, PolarAngleAxis, ReferenceLine,
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import { modbusApi } from '../api/modbus.js';
import { useSettings } from '../context/SettingsContext.jsx';
import { defaultSettings } from '../api/settings.js';

// Optional Power BI report to embed. Set VITE_POWERBI_URL in a .env file to the
// "Publish to web" (or secure embed) URL of your report. When empty, we show a
// setup card instead of a broken iframe.
const POWERBI_URL = import.meta.env?.VITE_POWERBI_URL || '';

// Poll interval for the live fuel readings that feed the trend chart.
const POLL_MS = 5000;
// How many trend points to keep (5s × 120 = 10 min window).
const TREND_MAX = 120;

// Colour a fuel % against the configured low/critical thresholds.
function fuelColor(pct, low, critical) {
  if (pct <= critical) return { bar: '#ef4444', text: 'text-red-400', label: 'Critical', chip: 'bg-red-500/10 text-red-400' };
  if (pct <= low) return { bar: '#f59e0b', text: 'text-amber-400', label: 'Low', chip: 'bg-amber-500/10 text-amber-400' };
  return { bar: '#10b981', text: 'text-emerald-400', label: 'Good', chip: 'bg-emerald-500/10 text-emerald-400' };
}

function normalizeDevice(d) {
  return {
    id: d.id ?? d.ID,
    name: d.name ?? d.NAME ?? 'Unnamed device',
    status: (d.status ?? d.STATUS ?? 'offline').toString().toLowerCase(),
  };
}

// Respect the OS "reduce motion" setting for chart entrance animations.
function usePrefersReducedMotion() {
  // Lazy initial value so the effect only subscribes (no synchronous setState).
  const [reduced, setReduced] = useState(
    () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  );
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const on = (e) => setReduced(e.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduced;
}

// Shared dark tooltip for both charts.
function ChartTooltip({ active, payload, label, unit = '%' }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg bg-[#0f1117] border border-white/10 px-3 py-2 shadow-xl">
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} className="text-sm font-semibold text-gray-100 tabular-nums">
          {Number(p.value).toFixed(1)}{unit}
        </p>
      ))}
    </div>
  );
}

const AXIS = { fill: '#6b7280', fontSize: 12 };
const GRID = 'rgba(255,255,255,0.06)';

// One radial gauge per device (single-KPI vs 0–100% scale).
function DeviceGauge({ device, low, critical, reducedMotion }) {
  const has = typeof device.fuel === 'number';
  const c = has
    ? fuelColor(device.fuel, low, critical)
    : { bar: '#374151', label: 'No reading', chip: 'bg-white/5 text-gray-500', text: 'text-gray-500' };
  const data = [{ name: device.name, value: has ? device.fuel : 0 }];
  return (
    <div className="rounded-2xl bg-[#1a1d27] border border-white/5 p-4 flex flex-col items-center">
      <div className="relative w-full" style={{ height: 140 }}>
        <ResponsiveContainer>
          <RadialBarChart data={data} innerRadius="72%" outerRadius="100%" startAngle={90} endAngle={-270} barSize={9}>
            <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
            <RadialBar
              background={{ fill: 'rgba(255,255,255,0.06)' }}
              dataKey="value"
              cornerRadius={9}
              fill={c.bar}
              angleAxisId={0}
              isAnimationActive={!reducedMotion}
            />
          </RadialBarChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          {has ? (
            <span className={`text-2xl font-bold tabular-nums leading-none ${c.text}`}>
              {device.fuel.toFixed(0)}<span className="text-sm">%</span>
            </span>
          ) : (
            <span className="text-[11px] text-gray-600">Offline</span>
          )}
        </div>
      </div>
      <p className="mt-2 text-sm font-medium text-gray-200 text-center truncate w-full" title={device.name}>{device.name}</p>
      <span className={`mt-1 px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wide ${c.chip}`}>{c.label}</span>
    </div>
  );
}

export default function FuelLevels() {
  const { settings } = useSettings();
  const low = settings?.LOW_TANK_THRESHOLD ?? defaultSettings.LOW_TANK_THRESHOLD;
  const critical = settings?.CRITICAL_TANK_THRESHOLD ?? defaultSettings.CRITICAL_TANK_THRESHOLD;
  const reducedMotion = usePrefersReducedMotion();

  // rows: [{ id, name, status, fuel: number|null }]
  const [rows, setRows] = useState([]);
  const [trend, setTrend] = useState([]); // [{ t, time, avg }]
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;

    const fetchAll = async () => {
      try {
        const devs = await modbusApi.getDevices();
        const list = (devs ?? []).map(normalizeDevice);
        const results = await Promise.all(
          list.map((dev) =>
            modbusApi
              .getFuel({ deviceId: dev.id })
              .then((r) => ({ ...dev, fuel: typeof r?.fuel === 'number' ? r.fuel : null }))
              .catch(() => ({ ...dev, fuel: null }))
          )
        );
        if (cancelledRef.current) return;
        setRows(results);
        setError('');

        // Append a fleet-average point to the live trend series.
        const reporting = results.filter((r) => typeof r.fuel === 'number');
        if (reporting.length) {
          const avg = reporting.reduce((s, r) => s + r.fuel, 0) / reporting.length;
          const now = new Date();
          setTrend((prev) => [
            ...prev,
            { t: now.getTime(), time: now.toLocaleTimeString(), avg: Number(avg.toFixed(1)) },
          ].slice(-TREND_MAX));
        }
      } catch (err) {
        if (!cancelledRef.current) setError(err.message || 'Failed to load devices');
      } finally {
        if (!cancelledRef.current) setLoading(false);
      }
    };

    fetchAll();
    const id = setInterval(fetchAll, POLL_MS);
    return () => { cancelledRef.current = true; clearInterval(id); };
  }, [reloadKey]);

  const refresh = () => { setLoading(true); setReloadKey((k) => k + 1); };

  const withFuel = rows.filter((r) => typeof r.fuel === 'number');
  const avg = withFuel.length ? withFuel.reduce((s, r) => s + r.fuel, 0) / withFuel.length : null;
  const lowCount = withFuel.filter((r) => r.fuel <= low).length;

  // Show gauges sorted lowest-first so at-risk devices surface at the top.
  const gaugeRows = [...rows].sort((a, b) => {
    const av = typeof a.fuel === 'number' ? a.fuel : Infinity;
    const bv = typeof b.fuel === 'number' ? b.fuel : Infinity;
    return av - bv;
  });

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-4 animate-slide-up">
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-xl bg-amber-500/15 text-amber-400 flex items-center justify-center">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2c-4 4.5-6 8-6 11a6 6 0 0012 0c0-3-2-6.5-6-11z" />
            </svg>
          </span>
          <div>
            <h1 className="text-xl font-bold text-gray-100">Fuel Levels</h1>
            <p className="text-xs text-gray-500">
              {withFuel.length} of {rows.length} device{rows.length === 1 ? '' : 's'} reporting
              {avg != null && <> · avg <span className="text-gray-300">{avg.toFixed(1)}%</span></>}
              {lowCount > 0 && <> · <span className="text-amber-400">{lowCount} low</span></>}
            </p>
          </div>
        </div>
        <button
          onClick={refresh}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#1a1d27] border border-white/5 text-sm text-gray-300 hover:bg-white/5 transition-colors"
        >
          <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
      </div>

      {/* ── Per-device gauges — each device gets its own chart ── */}
      <div className="animate-slide-up delay-100">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-100">Fuel by Device</h2>
          <span className="text-xs text-gray-500">Low ≤{low}% · Critical ≤{critical}%</span>
        </div>
        {error ? (
          <div className="rounded-2xl bg-[#1a1d27] border border-white/5 py-16 text-center text-sm text-red-400">{error}</div>
        ) : loading && rows.length === 0 ? (
          <div className="rounded-2xl bg-[#1a1d27] border border-white/5 py-16 text-center text-sm text-gray-500">Loading fuel levels…</div>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl bg-[#1a1d27] border border-white/5 py-16 text-center text-sm text-gray-500">No devices found</div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {gaugeRows.map((r, i) => (
              <DeviceGauge key={r.id ?? i} device={r} low={low} critical={critical} reducedMotion={reducedMotion} />
            ))}
          </div>
        )}
      </div>

      {/* ── Live fleet-average trend (area chart) ── */}
      <div className="rounded-2xl bg-[#1a1d27] border border-white/5 p-6 animate-slide-up delay-200">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-100">Fleet Average Trend</h2>
          <span className="flex items-center gap-1.5 text-xs text-gray-500">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> live · every {POLL_MS / 1000}s
          </span>
        </div>
        {trend.length < 2 ? (
          <div className="py-16 text-center text-sm text-gray-500">
            Collecting data… the trend appears after a few readings
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={trend} margin={{ top: 4, right: 12, bottom: 4, left: -8 }}>
                <defs>
                  <linearGradient id="fuelTrend" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={GRID} />
                <XAxis dataKey="time" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={40} />
                <YAxis domain={[0, 100]} tick={AXIS} tickLine={false} axisLine={false} width={36} unit="%" />
                <Tooltip content={<ChartTooltip />} />
                <ReferenceLine y={low} stroke="#f59e0b" strokeDasharray="4 4" strokeOpacity={0.5} />
                <ReferenceLine y={critical} stroke="#ef4444" strokeDasharray="4 4" strokeOpacity={0.5} />
                <Area type="monotone" dataKey="avg" stroke="#10b981" strokeWidth={2}
                  fill="url(#fuelTrend)" isAnimationActive={!reducedMotion} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          )}
      </div>

      {/* ── Per-device list (data-table alternative for accessibility) ── */}
      <div className="rounded-2xl bg-[#1a1d27] border border-white/5 p-6 animate-slide-up delay-300">
        <h2 className="text-lg font-semibold text-gray-100 mb-4">All Devices</h2>
        {rows.length === 0 && !loading ? (
          <div className="py-8 text-center text-sm text-gray-500">No devices found</div>
        ) : (
          <div className="space-y-4">
            {rows.map((r, i) => {
              const has = typeof r.fuel === 'number';
              const c = has ? fuelColor(r.fuel, low, critical) : null;
              return (
                <div key={r.id ?? i}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm font-medium text-gray-200 truncate">{r.name}</span>
                      <span className="text-xs text-gray-600">Device {r.id ?? '—'}</span>
                    </div>
                    {has ? (
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wide ${c.chip}`}>{c.label}</span>
                        <span className={`text-sm font-bold tabular-nums ${c.text}`}>{r.fuel.toFixed(1)}%</span>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-600 flex-shrink-0">Offline / no reading</span>
                    )}
                  </div>
                  <div className="h-2.5 rounded-full bg-white/5 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${has ? r.fuel : 0}%`, background: has ? c.bar : '#374151' }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Power BI analysis ── */}
      <div className="rounded-2xl bg-[#1a1d27] border border-white/5 p-6 animate-slide-up delay-300">
        <div className="flex items-center gap-3 mb-4">
          <span className="w-10 h-10 rounded-xl bg-yellow-500/15 text-yellow-400 flex items-center justify-center">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 19v-6m4 6V9m4 10V5M5 19h14" />
            </svg>
          </span>
          <h2 className="text-lg font-semibold text-gray-100">Power BI Analysis</h2>
        </div>

        {POWERBI_URL ? (
          <div className="rounded-xl overflow-hidden border border-white/5 bg-black/20">
            <iframe
              title="Power BI fuel analysis"
              src={POWERBI_URL}
              className="w-full"
              style={{ height: '540px', border: 0 }}
              allowFullScreen
            />
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-8 text-center">
            <p className="text-sm font-medium text-gray-300">No Power BI report connected yet</p>
            <p className="text-sm text-gray-500 mt-2 max-w-xl mx-auto leading-relaxed">
              Publish your fuel report in Power BI (<span className="text-gray-400">File → Embed report → Publish to web</span>,
              or a secure embed link), then set <code className="px-1.5 py-0.5 rounded bg-white/10 text-gray-300">VITE_POWERBI_URL</code> in
              a <code className="px-1.5 py-0.5 rounded bg-white/10 text-gray-300">.env</code> file to that embed URL and rebuild. The report will render here.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
