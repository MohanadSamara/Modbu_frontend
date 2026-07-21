// ============================================================================
// DatakomLivePanel.jsx — read-only LIVE view of the Datakom Rainbow data source.
//
// Datakom devices are read from Datakom's cloud portal (over a WebSocket the
// backend maintains in JSON-PUSH mode), not over Modbus. This panel polls the
// backend adapter's status + device list and renders live values. READ-ONLY.
//
// Drives its state off /brands/datakom/status (always 200). Only when the adapter
// reports `ready` does it fetch /brands/datakom/devices, so we never hit the 503
// "not connected yet" path.
// ============================================================================

import { useEffect, useRef, useState } from 'react';
import { datakomApi } from '../api/datakom.js';

// The backend serves a continuously-pushed cache, so polling is a cheap
// in-memory read — refresh briskly. Slightly slower than the single-device view
// since this fetches the whole device list each tick.
const POLL_MS = 3000;

function fmtTime(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  if (isNaN(d)) return '—';
  return d.toLocaleTimeString();
}

// A metric is { value:number|null, raw, unit } | null.
function fmtMetric(m) {
  if (!m) return '—';
  if (m.value != null) return `${m.value}${m.unit ? ` ${m.unit}` : ''}`;
  if (m.raw && m.raw !== 'N/A' && m.raw !== '') return `${m.raw}${m.unit ? ` ${m.unit}` : ''}`;
  return '—';
}

function Metric({ label, m }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-wide text-gray-500">{label}</span>
      <span className="text-sm font-semibold text-gray-100 tabular-nums">{fmtMetric(m)}</span>
    </div>
  );
}

function alarmCount(alarms) {
  if (!alarms) return 0;
  return ['ShutDown', 'LoadDump', 'Warning']
    .reduce((n, k) => n + (Array.isArray(alarms[k]) ? alarms[k].length : 0), 0);
}

function StatusChip({ status }) {
  let color = 'gray', label = 'Unknown';
  if (!status) { color = 'gray'; label = 'Loading…'; }
  else if (!status.enabled) { color = 'gray'; label = 'Disabled'; }
  else if (status.gaveUp) { color = 'red'; label = 'Stopped'; }
  else if (status.ready) { color = 'green'; label = 'Connected'; }
  else { color = 'amber'; label = 'Connecting…'; }

  const map = {
    green: 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/30',
    amber: 'bg-amber-500/15 text-amber-400 ring-amber-500/30',
    red:   'bg-red-500/15 text-red-400 ring-red-500/30',
    gray:  'bg-white/5 text-gray-400 ring-white/10',
  };
  const dot = { green: 'bg-emerald-400', amber: 'bg-amber-400 animate-pulse', red: 'bg-red-400', gray: 'bg-gray-500' };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ring-1 ${map[color]}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dot[color]}`} /> {label}
    </span>
  );
}

// Collapsible full list of every value the device reports (the "Devx Dump" view).
function AllValues({ values }) {
  const entries = Object.entries(values || {}).filter(([n]) => n);
  if (!entries.length) return null;
  return (
    <details className="pt-1 border-t border-white/5 group">
      <summary className="text-[11px] text-gray-500 hover:text-gray-300 cursor-pointer select-none list-none flex items-center gap-1">
        <svg className="w-3 h-3 transition-transform group-open:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        View all {entries.length} values
      </summary>
      <div className="mt-2 max-h-56 overflow-y-auto rounded-lg bg-black/20 divide-y divide-white/5">
        {entries.map(([name, v]) => (
          <div key={name} className="flex items-center justify-between gap-3 px-2.5 py-1 text-[11px]">
            <span className="text-gray-400 truncate">{name}</span>
            <span className="text-gray-200 tabular-nums shrink-0">
              {v.raw !== '' && v.raw != null ? v.raw : '—'}{v.unit ? ` ${v.unit}` : ''}
            </span>
          </div>
        ))}
      </div>
    </details>
  );
}

function DeviceCard({ d }) {
  const r = d.reading;
  const m = r?.metrics || {};
  const alarms = alarmCount(r?.alarms);
  const gps = r?.gps;
  const hasGps = gps && gps.lat != null && gps.lng != null && !(gps.lat === 0 && gps.lng === 0);
  const state = r?.identity?.gensetState;

  return (
    <div className="rounded-xl bg-[#0f1117] border border-white/5 p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-100 truncate">{d.sid || `Device ${d.did}`}</p>
          <p className="text-[11px] text-gray-500 tabular-nums truncate">
            did {d.did}{r?.identity?.siteId ? ` · ${r.identity.siteId}` : d.esn ? ` · esn ${d.esn}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {state != null && (
            <span className="px-2 py-0.5 rounded-md bg-white/5 text-gray-300 text-[11px] font-semibold">St {state}</span>
          )}
          {alarms > 0 ? (
            <span className="px-2 py-0.5 rounded-md bg-red-500/15 text-red-400 text-[11px] font-semibold ring-1 ring-red-500/30">
              {alarms} alarm{alarms > 1 ? 's' : ''}
            </span>
          ) : r ? (
            <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 text-[11px] font-semibold ring-1 ring-emerald-500/20">OK</span>
          ) : null}
        </div>
      </div>

      {r ? (
        <>
          <div className="grid grid-cols-3 gap-x-2 gap-y-3">
            <Metric label="Fuel" m={m.fuelLevel} />
            <Metric label="Battery" m={m.battery} />
            <Metric label="RPM" m={m.rpm} />
            <Metric label="Coolant" m={m.coolantTemp} />
            <Metric label="Oil Press" m={m.oilPressure} />
            <Metric label="Run Hrs" m={m.runHours} />
            <Metric label="Genset Hz" m={m.gensetFreq} />
            <Metric label="Genset kW" m={m.gensetPower} />
            <Metric label="Mains L1" m={m.mainsL1} />
          </div>

          {hasGps && (
            <a
              href={`https://www.google.com/maps?q=${gps.lat},${gps.lng}`}
              target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-[11px] text-cyan-400/80 hover:text-cyan-300"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a2 2 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              {gps.lat.toFixed(5)}, {gps.lng.toFixed(5)}
              {gps.sats != null ? ` · ${gps.sats} sat` : ''}
            </a>
          )}

          <div className="flex items-center justify-between text-[11px] text-gray-600">
            <span>{Object.keys(r.values || {}).length} values</span>
            <span>updated {fmtTime(r.readAt)}</span>
          </div>

          <AllValues values={r.values} />
        </>
      ) : (
        <p className="text-xs text-gray-600">No reading yet.</p>
      )}
    </div>
  );
}

export default function DatakomLivePanel() {
  const [status, setStatus] = useState(null);
  const [devices, setDevices] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const timerRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    async function tick() {
      try {
        const st = await datakomApi.status();
        if (cancelled) return;
        setStatus(st);
        setError('');
        if (st?.ready) {
          try {
            const list = await datakomApi.devices();
            if (!cancelled) setDevices(Array.isArray(list) ? list : []);
          } catch { /* transient — keep last devices */ }
        } else if (!cancelled) {
          setDevices([]);
        }
      } catch (e) {
        if (!cancelled) setError(e.message || 'Failed to reach Datakom adapter');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    tick();
    timerRef.current = setInterval(tick, POLL_MS);
    return () => { cancelled = true; clearInterval(timerRef.current); };
  }, []);

  if (status && !status.enabled) {
    return (
      <div className="rounded-2xl bg-[#1a1d27] border border-white/5 px-6 py-5">
        <div className="flex items-center gap-3">
          <DatakomIcon />
          <div>
            <h2 className="text-sm font-bold text-gray-100">Datakom Rainbow — Live Data Source</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Disabled. Set <code className="text-gray-400">DK_ENABLED=1</code> (plus <code className="text-gray-400">DK_USER</code>/<code className="text-gray-400">DK_PASS</code>) on the backend to activate.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-[#1a1d27] border border-white/5 overflow-hidden">
      <div className="px-6 py-4 flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-white/5">
        <div className="flex items-center gap-3">
          <DatakomIcon />
          <div>
            <h2 className="text-sm font-bold text-gray-100">Datakom Rainbow — Live Data Source</h2>
            <p className="text-xs text-gray-500 mt-0.5">Live values streamed from Datakom's cloud portal (not Modbus).</p>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-4">
          <StatusChip status={status} />
          <span className="text-xs text-gray-500">
            <span className="text-gray-300 tabular-nums font-semibold">{status?.deviceCount ?? 0}</span> devices
            <span className="mx-1.5 text-gray-700">·</span>
            <span className="text-gray-300 tabular-nums font-semibold">{status?.nodes ?? 0}</span> nodes
          </span>
        </div>
      </div>

      {status?.gaveUp && (
        <div className="px-6 py-3 bg-red-500/5 border-b border-red-500/10 text-xs text-red-300">
          The adapter stopped after repeated connection resets. Port 464 is IP-allowlisted by Datakom —
          if this host's public IP isn't whitelisted the socket is reset before login. Confirm the IP is
          whitelisted, then restart the backend.
          {status.lastError ? <span className="text-red-400/70"> (last error: {status.lastError})</span> : null}
        </div>
      )}

      <div className="p-4">
        {error ? (
          <p className="px-2 py-8 text-center text-sm text-red-400">{error}</p>
        ) : loading ? (
          <p className="px-2 py-8 text-center text-sm text-gray-500">Loading…</p>
        ) : !status?.ready ? (
          <p className="px-2 py-8 text-center text-sm text-gray-500">
            {status?.gaveUp ? 'Not connected.' : 'Connecting to Datakom…'}
          </p>
        ) : devices.length === 0 ? (
          <p className="px-2 py-8 text-center text-sm text-gray-500">Connected, but no devices reported yet.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {devices.map((d) => <DeviceCard key={d.did} d={d} />)}
          </div>
        )}
      </div>
    </div>
  );
}

function DatakomIcon() {
  return (
    <span className="w-9 h-9 rounded-xl bg-orange-500/15 text-orange-400 flex items-center justify-center shrink-0">
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    </span>
  );
}
