import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ResponsiveContainer, RadialBarChart, RadialBar, PolarAngleAxis, ReferenceLine,
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import { modbusApi } from '../api/modbus.js';
import { datakomApi } from '../api/datakom.js';
import { useTelemetry } from '../hooks/useTelemetry.js';
import { useSettings } from '../context/SettingsContext.jsx';
import { defaultSettings } from '../api/settings.js';
import { useAuth } from '../context/useAuth.js';
import { useAlarmSound, getAlarmMuted, setAlarmMuted, subscribeAlarmMuted } from '../hooks/useAlarmSound.js';
import Editable from '../components/pageedit/Editable.jsx';
import AnimatedNumber from '../components/anim/AnimatedNumber.jsx';
import { StaggerGrid, StaggerItem } from '../components/anim/Stagger.jsx';

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
  // NB: Number(null) is 0, so bail out on null/empty before coercing —
  // otherwise every unlinked device gets datakomDid 0 and is treated as Datakom.
  const num = (v) => {
    if (v == null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  return {
    id: d.id ?? d.ID,
    name: d.name ?? d.NAME ?? 'Unnamed device',
    status: (d.status ?? d.STATUS ?? 'offline').toString().toLowerCase(),
    datakomDid: num(d.datakom_did ?? d.DATAKOM_DID),
    ip: (d.ip ?? d.IP) || null,
    port: num(d.port ?? d.PORT) ?? 502,
    locationId: num(d.location_id ?? d.LOCATION_ID),
  };
}

// Collapse device rows that point at the same physical connection into one:
// two rows linked to the same Datakom did, or two rows with the same IP:port,
// are the same device and must render a single card. When rows collide, keep
// the most useful one — online first, then one assigned to a location, then
// the most recently added (highest id).
function dedupeByConnection(list) {
  const keyOf = (d) =>
    d.datakomDid != null ? `dk:${d.datakomDid}`
    : d.ip ? `ip:${d.ip}:${d.port}`
    : `id:${d.id}`;
  const score = (d) => (d.status === 'online' ? 4 : 0) + (d.locationId != null ? 2 : 0);
  const best = new Map();
  const idsByKey = new Map();
  for (const d of list) {
    const k = keyOf(d);
    if (d.id != null) idsByKey.set(k, [...(idsByKey.get(k) ?? []), d.id]);
    const cur = best.get(k);
    if (!cur || score(d) > score(cur) || (score(d) === score(cur) && (d.id ?? 0) > (cur.id ?? 0))) {
      best.set(k, d);
    }
  }
  // altIds: every device id sharing this connection — live WS frames may arrive
  // under a hidden duplicate's id, and the surviving card must still pick them up.
  return [...best.entries()].map(([k, d]) => ({ ...d, altIds: idsByKey.get(k) ?? [] }));
}

// Fetch the fuel % for a single Datakom device. Returns a number or null.
async function fetchDatakomFuel(did) {
  try {
    const d = await datakomApi.device(did);
    const fm = d?.reading?.metrics?.fuelLevel;
    if (!fm || fm.value == null) return null;
    if (fm.unit != null && !/%/.test(String(fm.unit))) return null;
    return fm.value;
  } catch {
    return null;
  }
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
function DeviceGauge({ device, low, critical, reducedMotion, canMute, isMuted, onToggleMute }) {
  const has = typeof device.fuel === 'number';
  const c = has
    ? fuelColor(device.fuel, low, critical)
    : { bar: '#374151', label: 'No reading', chip: 'bg-white/5 text-gray-500', text: 'text-gray-500' };
  const data = [{ name: device.name, value: has ? device.fuel : 0 }];
  // Per-device mute toggle, always available on the card (this browser only) —
  // a muted device keeps its visual alarm but is dropped from the alarm tone.
  // Shown for every device with an id, IP (Modbus) or Live (Datakom Rainbow).
  const showMute = canMute && device.id != null;
  return (
    <div className="card relative p-4 flex flex-col items-center">
      {showMute && (
        <button
          onClick={() => onToggleMute(device.id)}
          title={isMuted ? 'Unmute this device' : 'Mute this device'}
          aria-label={isMuted ? 'Unmute this device' : 'Mute this device'}
          aria-pressed={isMuted}
          className={`absolute top-2 right-2 z-10 inline-flex items-center justify-center w-7 h-7 rounded-lg transition-colors ${
            isMuted
              ? 'bg-amber-500/15 text-amber-400 hover:bg-amber-500/25'
              : 'bg-white/5 text-gray-400 hover:bg-white/10'
          }`}
        >
          {isMuted ? (
            <svg aria-hidden="true" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l4-4m0 4l-4-4" />
            </svg>
          ) : (
            <svg aria-hidden="true" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M15.536 8.464a5 5 0 010 7.072M12 6v12m0 0l-4-4H4a1 1 0 01-1-1V11a1 1 0 011-1h4l4-4z" />
            </svg>
          )}
        </button>
      )}
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
              <AnimatedNumber value={device.fuel} decimals={0} /><span className="text-sm">%</span>
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
  const alertsEnabled = settings?.FUEL_ALERTS_ENABLED ?? defaultSettings.FUEL_ALERTS_ENABLED;
  const reducedMotion = usePrefersReducedMotion();

  // ── Bulk alarm controls ─────────────────────────────────────────────────
  // "Mute all" silences every alarm-sound instance via the shared flag;
  // "Accept all" acknowledges every active alarm and snoozes each device so all
  // users stop hearing it, mirroring the single Accept on the Alarms page.
  const { hasPermission } = useAuth();
  const canReadAlarms = hasPermission('alarm.read');
  // The per-device mute is a local, this-browser-only sound preference — weaker
  // than the header "Mute all" (which silences every alarm and needs only
  // alarm.read). So it's gated the same way: anyone who can see alarms can mute a
  // single device, IP (Modbus) or Live (Datakom Rainbow) alike. It is NOT gated
  // behind the alarm.mute *action* element, which would be stricter than muting
  // everything and would hide it for both device types.
  const [activeAlarms, setActiveAlarms] = useState([]);
  const [alarmsMuted, setAlarmsMuted] = useState(getAlarmMuted());
  useEffect(() => subscribeAlarmMuted(setAlarmsMuted), []);
  const [acceptingAll, setAcceptingAll] = useState(false);

  // Per-device mute (this browser only): a muted device is excluded from the
  // sound tone below, but keeps showing its visual alarm. Personal preference,
  // so it's local + persisted — distinct from "Accept" which snoozes for everyone.
  const [mutedDevices, setMutedDevices] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('modbus.fuelMutedDevices') || '[]');
      return new Set(Array.isArray(saved) ? saved : []);
    } catch { return new Set(); }
  });
  const toggleDeviceMute = useCallback((id) => {
    setMutedDevices((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      try { localStorage.setItem('modbus.fuelMutedDevices', JSON.stringify([...next])); } catch { /* ignore */ }
      return next;
    });
  }, []);
  // Per-device "Accept" in-flight ids, so each row's button can show progress.
  const [acceptingDevices, setAcceptingDevices] = useState(() => new Set());

  // Shared per-device snooze for Datakom devices (deviceId → ms). Datakom cloud
  // devices don't flow through the backend alarm engine, so their fuel tones are
  // derived client-side (see below); this mirrors the shared snooze so an Accept
  // — here, on the Alarms page, or by another user — silences them too.
  const [datakomSnooze, setDatakomSnooze] = useState({});

  // The alarm tone is driven by the combined-tone effect further below, once
  // both the backend Modbus alarms and the client-side Datakom fuel alarms are
  // known. The hook honours the shared mute flag internally, so muting silences
  // this without extra work.
  const { setActive: setActiveAlarmSound, playOnce: playTestAlarm } = useAlarmSound();

  // rows: [{ id, name, status, fuel: number|null }] — the device list, seeded
  // from REST. Live fuel values arrive over the WebSocket (see mergedRows).
  const [rows, setRows] = useState([]);
  const [trend, setTrend] = useState([]); // [{ t, time, avg }]
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const cancelledRef = useRef(false);

  // Live telemetry stream — the server pushes a fresh frame per device, so we
  // no longer poll /modbus/fuel on a timer while the socket is open.
  const { frames, status: liveStatus } = useTelemetry();

  // Seed the device list + a first fuel read each, so values show immediately
  // (before the first WS frame) and offline devices still render. Runs once per
  // manual refresh — not on an interval.
  useEffect(() => {
    cancelledRef.current = false;
    (async () => {
      try {
        const devs = await modbusApi.getDevices();
        const list = dedupeByConnection((devs ?? []).map(normalizeDevice));
        const results = await Promise.all(
          list.map((dev) => {
            if (dev.datakomDid != null) {
              // Datakom-linked device: read fuel from the Datakom cloud.
              return fetchDatakomFuel(dev.datakomDid).then((fuel) => ({ ...dev, fuel }));
            }
            return modbusApi
              .getFuel({ deviceId: dev.id })
              .then((r) => ({ ...dev, fuel: typeof r?.fuel === 'number' ? r.fuel : null }))
              .catch(() => ({ ...dev, fuel: null }));
          })
        );
        if (cancelledRef.current) return;
        setRows(results);
        setError('');
      } catch (err) {
        if (!cancelledRef.current) setError(err.message || 'Failed to load devices');
      } finally {
        if (!cancelledRef.current) setLoading(false);
      }
    })();
    return () => { cancelledRef.current = true; };
  }, [reloadKey]);

  // Fallback poll for Modbus devices: only while the live socket is NOT open.
  useEffect(() => {
    if (liveStatus === 'open') return;
    let cancelled = false;
    const fetchAll = () => {
      modbusApi
        .getDevices()
        .then((devs) =>
          Promise.all(
            dedupeByConnection((devs ?? []).map(normalizeDevice)).map((dev) => {
              if (dev.datakomDid != null) {
                // Datakom devices are handled by their own poll below.
                return Promise.resolve(null);
              }
              return modbusApi
                .getFuel({ deviceId: dev.id })
                .then((r) => ({ ...dev, fuel: typeof r?.fuel === 'number' ? r.fuel : null }))
                .catch(() => ({ ...dev, fuel: null }));
            })
          )
        )
        .then((results) => {
          if (cancelled) return;
          const modbusResults = results.filter(Boolean);
          if (modbusResults.length) {
            setRows((prev) => prev.map((r) => {
              const updated = modbusResults.find((x) => x.id === r.id);
              return updated ?? r;
            }));
          }
        })
        .catch(() => {});
    };
    const id = setInterval(fetchAll, POLL_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, [liveStatus]);

  // Dedicated poll for Datakom-linked devices — runs regardless of WS state
  // since Datakom data is cloud-sourced and never comes through the Modbus WS.
  useEffect(() => {
    let cancelled = false;
    const pollDatakom = () => {
      setRows((prev) => {
        const datakomDevs = prev.filter((r) => r.datakomDid != null);
        if (!datakomDevs.length) return prev;
        Promise.all(
          datakomDevs.map((dev) =>
            fetchDatakomFuel(dev.datakomDid).then((fuel) => ({ id: dev.id, fuel }))
          )
        ).then((updates) => {
          if (cancelled) return;
          setRows((curr) => curr.map((r) => {
            const u = updates.find((x) => x.id === r.id);
            return u ? { ...r, fuel: u.fuel } : r;
          }));
        }).catch(() => {});
        return prev; // no synchronous change
      });
    };
    const id = setInterval(pollDatakom, POLL_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const refresh = () => { setLoading(true); setReloadKey((k) => k + 1); };

  // Poll active alarms so the bulk controls know how many are outstanding.
  useEffect(() => {
    if (!canReadAlarms) return;
    let cancelled = false;
    const fetchAlarms = () => {
      modbusApi
        .getAlarms(500)
        .then((r) => { if (!cancelled) setActiveAlarms(Array.isArray(r) ? r : []); })
        .catch(() => {}); // ignore blips — don't hide the controls on a network hiccup
    };
    fetchAlarms();
    const id = setInterval(fetchAlarms, POLL_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, [canReadAlarms, reloadKey]);

  // ── Datakom fuel alarms (client-side) ────────────────────────────────────
  // The backend alarm engine only evaluates Modbus devices, so Datakom Rainbow
  // cloud devices never appear in `activeAlarms` and their gauges would stay
  // silent even at Critical/Low. Derive their fuel alarms here from the same
  // thresholds the gauges use, and poll the shared snooze so an accept silences
  // them across pages/users.

  // Stable key of Datakom device ids so the snooze poll doesn't restart on every
  // fuel tick (rows change identity constantly as live values arrive).
  const datakomIdKey = rows
    .filter((r) => r.datakomDid != null && r.id != null)
    .map((r) => r.id)
    .join(',');

  useEffect(() => {
    if (!canReadAlarms) return;
    const ids = datakomIdKey ? datakomIdKey.split(',').map(Number) : [];
    if (!ids.length) return;
    let cancelled = false;
    const fetchSnoozes = () => {
      Promise.all(
        ids.map((id) =>
          modbusApi
            .getDeviceSnooze(id)
            .then((res) => [id, res?.snoozeUntilMs || 0])
            .catch(() => [id, 0])
        )
      ).then((pairs) => {
        if (cancelled) return;
        const now = Date.now();
        const next = {};
        for (const [id, ms] of pairs) if (ms && now < ms) next[id] = ms;
        setDatakomSnooze(next);
      });
    };
    fetchSnoozes();
    const id = setInterval(fetchSnoozes, POLL_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, [canReadAlarms, datakomIdKey, reloadKey]);

  // Synthetic alarm rows for Datakom devices whose fuel has crossed a threshold
  // (and that aren't snoozed). Shaped like backend alarms so the tone logic and
  // Accept-all flow treat them uniformly. Datakom devices don't receive WS
  // frames, so their live fuel already lives on `rows`.
  const datakomAlarms = useMemo(() => {
    if (!canReadAlarms || !alertsEnabled) return [];
    const out = [];
    for (const r of rows) {
      if (r.datakomDid == null || r.id == null) continue;
      if (typeof r.fuel !== 'number' || r.fuel <= 0) continue;
      // Presence in the snooze map means an unexpired snooze — the poll only
      // stores future timestamps and refreshes every POLL_MS, dropping expired
      // ones, so we don't need to re-check the clock during render.
      if (datakomSnooze[r.id]) continue;
      if (r.fuel <= critical)  out.push({ id: `dk-${r.id}`, deviceId: r.id, type: 'ALARM_CRITICAL_FUEL', synthetic: true });
      else if (r.fuel <= low)  out.push({ id: `dk-${r.id}`, deviceId: r.id, type: 'ALARM_LOW_FUEL',      synthetic: true });
    }
    return out;
  }, [rows, canReadAlarms, alertsEnabled, low, critical, datakomSnooze]);

  // Combine backend Modbus alarms + client-side Datakom alarms into the single
  // highest-priority tone (avoids overlapping klaxons). Derived as a primitive so
  // the sound effect only re-runs when the winning tone actually changes.
  const topTone = useMemo(() => {
    const tones = new Set();
    const add = (type) => {
      if (type === 'ALARM_CRITICAL_FUEL')         tones.add('critical');
      else if (type === 'ALARM_HIGH_CONSUMPTION') tones.add('rate');
      else                                        tones.add('warning'); // ALARM_LOW_FUEL / other
    };
    // A per-device mute keeps that device visually alarming but drops it from the
    // tone, so the winning tone is computed only over non-muted devices.
    for (const a of activeAlarms)  if (!mutedDevices.has(a.deviceId)) add(a.type);
    for (const a of datakomAlarms) if (!mutedDevices.has(a.deviceId)) add(a.type);
    return ['critical', 'warning', 'rate'].find((t) => tones.has(t)) || null;
  }, [activeAlarms, datakomAlarms, mutedDevices]);

  useEffect(() => {
    setActiveAlarmSound(topTone ? [topTone] : []);
  }, [topTone, setActiveAlarmSound]);

  // Total outstanding alarms across both sources — drives the Accept-all control.
  const activeAlarmCount = activeAlarms.length + datakomAlarms.length;

  // Per-device alarm severity (deviceId → 'critical' | 'warning'), combining
  // backend Modbus alarms and client-side Datakom alarms. Drives which rows get
  // the inline Mute/Accept controls.
  const alarmByDevice = useMemo(() => {
    const m = new Map();
    const bump = (id, sev) => {
      if (id == null) return;
      if (sev === 'critical' || !m.has(id)) m.set(id, sev);
    };
    for (const a of [...activeAlarms, ...datakomAlarms]) {
      bump(a.deviceId, a.type === 'ALARM_CRITICAL_FUEL' ? 'critical' : 'warning');
    }
    return m;
  }, [activeAlarms, datakomAlarms]);

  // Accept a single device: acknowledge its backend alarms (if any) and snooze it
  // for everyone during the cooldown — the single-device form of "Accept all".
  const handleAcceptDevice = useCallback(async (deviceId) => {
    if (deviceId == null || acceptingDevices.has(deviceId)) return;
    setAcceptingDevices((prev) => new Set(prev).add(deviceId));
    try {
      const ackIds = activeAlarms.filter((a) => a.deviceId === deviceId).map((a) => a.id);
      await Promise.all(ackIds.map((id) => modbusApi.acknowledgeAlarm(id).catch(() => {})));
      const cooldownMin =
        Number(settings?.ALARM_COOLDOWN_MINUTES ?? defaultSettings.ALARM_COOLDOWN_MINUTES) || 60;
      const until = Date.now() + cooldownMin * 60_000;
      await modbusApi.setDeviceSnooze(deviceId, until).catch(() => {});
      // Stop the sound now if this was the only/most-severe alarming device.
      window.dispatchEvent(new CustomEvent('alarm-accepted'));
      setActiveAlarms((prev) => prev.filter((a) => a.deviceId !== deviceId));
      setDatakomSnooze((prev) => ({ ...prev, [deviceId]: until }));
    } finally {
      setAcceptingDevices((prev) => { const next = new Set(prev); next.delete(deviceId); return next; });
    }
  }, [acceptingDevices, activeAlarms, settings]);

  const handleAcceptAll = async () => {
    if (acceptingAll || activeAlarmCount === 0) return;
    setAcceptingAll(true);
    try {
      const list = activeAlarms;
      // Acknowledge every backend (Modbus) alarm. Datakom alarms are synthetic —
      // there's no action row to acknowledge, so a shared snooze is all they need.
      await Promise.all(list.map((a) => modbusApi.acknowledgeAlarm(a.id).catch(() => {})));
      // Snooze each affected device so all users stop hearing it during cooldown.
      const cooldownMin =
        Number(settings?.ALARM_COOLDOWN_MINUTES ?? defaultSettings.ALARM_COOLDOWN_MINUTES) || 60;
      const until = Date.now() + cooldownMin * 60_000;
      const deviceIds = [...new Set(
        [...list, ...datakomAlarms].map((a) => a.deviceId).filter((id) => id != null)
      )];
      await Promise.all(deviceIds.map((id) => modbusApi.setDeviceSnooze(id, until).catch(() => {})));
      // Stop any alarm sound currently playing, and clear optimistically.
      window.dispatchEvent(new CustomEvent('alarm-accepted'));
      setActiveAlarms([]);
      // Optimistically snooze the Datakom tones locally so they stop instantly,
      // before the next snooze poll confirms it.
      setDatakomSnooze((prev) => {
        const next = { ...prev };
        for (const a of datakomAlarms) next[a.deviceId] = until;
        return next;
      });
    } finally {
      setAcceptingAll(false);
    }
  };

  // Live view: overlay each device's latest WS frame on top of the REST-seeded
  // row, so fuel values update the instant the server pushes them.
  const mergedRows = rows.map((r) => {
    // A frame may arrive under the id of a hidden duplicate row (same
    // connection, different DB row) — accept it for this card too.
    const ids = r.altIds?.length ? r.altIds : [r.id];
    const fid = ids.find((id) => frames[id]);
    const f = fid != null ? frames[fid] : null;
    if (!f) return r;
    return { ...r, fuel: typeof f.fuel === 'number' ? f.fuel : null };
  });

  const withFuel = mergedRows.filter((r) => typeof r.fuel === 'number');
  const avg = withFuel.length ? withFuel.reduce((s, r) => s + r.fuel, 0) / withFuel.length : null;
  const lowCount = withFuel.filter((r) => r.fuel <= low).length;

  // Show gauges sorted lowest-first so at-risk devices surface at the top.
  const gaugeRows = [...mergedRows].sort((a, b) => {
    const av = typeof a.fuel === 'number' ? a.fuel : Infinity;
    const bv = typeof b.fuel === 'number' ? b.fuel : Infinity;
    return av - bv;
  });

  // Sample the fleet average into the trend series on a fixed cadence, decoupled
  // from how the values arrive (live WS or fallback poll). Reads the freshest
  // merged rows via a ref so the interval never needs to re-subscribe.
  const mergedRef = useRef([]);
  useEffect(() => { mergedRef.current = mergedRows; });
  useEffect(() => {
    const id = setInterval(() => {
      const reporting = mergedRef.current.filter((r) => typeof r.fuel === 'number');
      if (!reporting.length) return;
      const a = reporting.reduce((s, r) => s + r.fuel, 0) / reporting.length;
      const now = new Date();
      setTrend((prev) => [
        ...prev,
        { t: now.getTime(), time: now.toLocaleTimeString(), avg: Number(a.toFixed(1)) },
      ].slice(-TREND_MAX));
    }, POLL_MS);
    return () => clearInterval(id);
  }, []);

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
            <Editable id="fuel.title" as="h1" className="text-xl font-bold text-gray-100">Fuel Levels</Editable>
            <p className="text-xs text-gray-500">
              {withFuel.length} of {rows.length} device{rows.length === 1 ? '' : 's'} reporting
              {avg != null && <> · avg <span className="text-gray-300"><AnimatedNumber value={avg} decimals={1} suffix="%" /></span></>}
              {lowCount > 0 && <> · <span className="text-amber-400">{lowCount} low</span></>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Bulk alarm controls — always visible; Accept all is disabled when
              there are no active alarms to accept. */}
          {canReadAlarms && (
            <>
              <button
                onClick={() => playTestAlarm('warning')}
                title="Play a test alarm tone to check your speakers/volume"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold bg-[#1a1d27] border border-white/5 text-gray-300 hover:bg-white/5 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M15.536 8.464a5 5 0 010 7.072M18.364 5.636a9 9 0 010 12.728M12 6v12l-4-4H4a1 1 0 01-1-1V11a1 1 0 011-1h4l4-4z" />
                </svg>
                Test
              </button>
              <button
                onClick={() => setAlarmMuted(!getAlarmMuted())}
                title={alarmsMuted ? 'Unmute all alarm sounds' : 'Mute all alarm sounds'}
                className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
                  alarmsMuted
                    ? 'bg-[#1a1d27] border border-white/5 text-gray-400 hover:bg-white/5'
                    : 'bg-amber-500/15 border border-amber-500/30 text-amber-300 hover:bg-amber-500/25'
                }`}
              >
                {alarmsMuted ? (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l4-4m0 4l-4-4" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M15.536 8.464a5 5 0 010 7.072M12 6v12m0 0l-4-4H4a1 1 0 01-1-1V11a1 1 0 011-1h4l4-4z" />
                  </svg>
                )}
                {alarmsMuted ? 'Muted' : 'Mute all'}
              </button>
              <button
                onClick={handleAcceptAll}
                disabled={acceptingAll || activeAlarmCount === 0}
                title={activeAlarmCount === 0 ? 'No active alarms to accept' : 'Accept all active alarms'}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                {acceptingAll
                  ? 'Accepting…'
                  : activeAlarmCount > 0 ? `Accept all (${activeAlarmCount})` : 'Accept all'}
              </button>
            </>
          )}
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
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4" aria-hidden="true">
            {Array.from({ length: 5 }).map((_, i) => <div key={i} className="skeleton h-44 rounded-2xl" />)}
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl bg-[#1a1d27] border border-white/5 py-16 text-center text-sm text-gray-500">No devices found</div>
        ) : (
          <StaggerGrid className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {/* StaggerItem's layout animation makes cards glide to their new
                spot when live values resort the grid (lowest fuel first). */}
            {gaugeRows.map((r, i) => (
              <StaggerItem key={r.id ?? i}>
                <DeviceGauge
                  device={r}
                  low={low}
                  critical={critical}
                  reducedMotion={reducedMotion}
                  canMute={canReadAlarms}
                  isMuted={mutedDevices.has(r.id)}
                  onToggleMute={toggleDeviceMute}
                />
              </StaggerItem>
            ))}
          </StaggerGrid>
        )}
      </div>

      {/* ── Live fleet-average trend (area chart) ── */}
      <div className="card p-6 animate-slide-up delay-200">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-100">Fleet Average Trend</h2>
          <span className="flex items-center gap-1.5 text-xs text-gray-500">
            {liveStatus === 'open' ? (
              <><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> live</>
            ) : (
              <><span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" /> reconnecting…</>
            )}
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
      <div className="card p-6 animate-slide-up delay-300">
        <h2 className="text-lg font-semibold text-gray-100 mb-4">All Devices</h2>
        {rows.length === 0 && !loading ? (
          <div className="py-8 text-center text-sm text-gray-500">No devices found</div>
        ) : (
          <div className="space-y-4">
            {mergedRows.map((r, i) => {
              const has = typeof r.fuel === 'number';
              const c = has ? fuelColor(r.fuel, low, critical) : null;
              // Inline Mute/Accept appear only while this device is alarming.
              const rowAlarm = alarmByDevice.get(r.id);
              const isDevMuted = mutedDevices.has(r.id);
              const isAccepting = acceptingDevices.has(r.id);
              return (
                <div key={r.id ?? i}>
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm font-medium text-gray-200 truncate">{r.name}</span>
                      <span className="text-xs text-gray-600">Device {r.id ?? '—'}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {has ? (
                        <>
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wide ${c.chip}`}>{c.label}</span>
                          <span className={`text-sm font-bold tabular-nums ${c.text}`}>{r.fuel.toFixed(1)}%</span>
                        </>
                      ) : (
                        <span className="text-xs text-gray-600">Offline / no reading</span>
                      )}
                      {canReadAlarms && rowAlarm && (
                        <div className="flex items-center gap-1.5 ml-1 pl-2 border-l border-white/10">
                          <button
                            onClick={() => toggleDeviceMute(r.id)}
                            title={isDevMuted ? 'Unmute this device' : 'Mute this device'}
                            aria-label={isDevMuted ? 'Unmute this device' : 'Mute this device'}
                            aria-pressed={isDevMuted}
                            className={`inline-flex items-center justify-center w-7 h-7 rounded-lg transition-colors ${
                              isDevMuted
                                ? 'bg-white/5 text-gray-400 hover:bg-white/10'
                                : 'bg-amber-500/15 text-amber-400 hover:bg-amber-500/25'
                            }`}
                          >
                            {isDevMuted ? (
                              <svg aria-hidden="true" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                  d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l4-4m0 4l-4-4" />
                              </svg>
                            ) : (
                              <svg aria-hidden="true" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                  d="M15.536 8.464a5 5 0 010 7.072M12 6v12m0 0l-4-4H4a1 1 0 01-1-1V11a1 1 0 011-1h4l4-4z" />
                              </svg>
                            )}
                          </button>
                          <button
                            onClick={() => handleAcceptDevice(r.id)}
                            disabled={isAccepting}
                            title="Accept this device's alarm (snoozes it for everyone)"
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          >
                            <svg aria-hidden="true" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            {isAccepting ? 'Accepting…' : 'Accept'}
                          </button>
                        </div>
                      )}
                    </div>
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
      <div className="card p-6 animate-slide-up delay-300">
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
