import { useState, useEffect, useRef } from 'react';
import { useSettings } from '../context/SettingsContext.jsx';
import { defaultSettings } from '../api/settings.js';
import { modbusApi } from '../api/modbus.js';
import { useAlarmSound } from '../hooks/useAlarmSound.js';
import { useAuth } from '../context/useAuth.js';

// ── Colour based on % level vs configured thresholds ──────────────────────
function fuelColor(level, lowThreshold, criticalThreshold) {
  if (level <= criticalThreshold)
    return { stroke: '#ef4444', text: 'text-red-400',     label: 'Critical', labelClass: 'text-red-400 bg-red-500/10' };
  if (level <= lowThreshold)
    return { stroke: '#f59e0b', text: 'text-amber-400',   label: 'Low',      labelClass: 'text-amber-400 bg-amber-500/10' };
  return   { stroke: '#10b981', text: 'text-emerald-400', label: 'Good',     labelClass: 'text-emerald-400 bg-emerald-500/10' };
}

// ── Convert raw % to display value + unit label ────────────────────────────
function computeDisplay(fuelPct, showAsPercentage, unit, capacityLiters) {
  if (showAsPercentage) {
    return { value: fuelPct.toFixed(1), unit: '%', subLabel: '% full' };
  }
  const amount = (fuelPct / 100) * capacityLiters;
  if (unit === 'gallons') {
    const gal = amount * 0.264172;
    return {
      value:    gal >= 100 ? gal.toFixed(0) : gal.toFixed(1),
      unit:     'gal',
      subLabel: `of ${(capacityLiters * 0.264172).toFixed(0)} gal`,
    };
  }
  return {
    value:    amount >= 100 ? amount.toFixed(0) : amount.toFixed(1),
    unit:     'L',
    subLabel: `of ${capacityLiters} L`,
  };
}

// ── Mute button ────────────────────────────────────────────────────────────
function MuteButton({ muted, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      title={muted ? 'Unmute alarm sound' : 'Mute alarm sound'}
      aria-label={muted ? 'Unmute alarm sound' : 'Mute alarm sound'}
      aria-pressed={muted}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-colors
        ${muted
          ? 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-gray-200'
          : 'bg-amber-500/15 text-amber-400 hover:bg-amber-500/25'
        }`}
    >
      {muted ? (
        <>
          <svg aria-hidden="true" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
          </svg>
          Muted
        </>
      ) : (
        <>
          <svg aria-hidden="true" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M15.536 8.464a5 5 0 010 7.072M12 6v12m0 0l-4-4H4a1 1 0 01-1-1V11a1 1 0 011-1h4l4-4z" />
          </svg>
          Sound on
        </>
      )}
    </button>
  );
}

// ── Consumption rate config ────────────────────────────────────────────────
// Window over which we average drain to compute %/hr. Long enough to filter
// out noise/jitter, short enough to react in a reasonable time.
const RATE_WINDOW_MS  = 2 * 60 * 1000;   // 2 minutes
// Need at least this much spread before a rate is meaningful (avoids huge
// numbers from two samples 3 s apart).
const RATE_MIN_SPAN_MS = 30 * 1000;      // 30 seconds

// ── Reading-smoothing config ───────────────────────────────────────────────
// Two-stage filter to stop the gauge fluctuating:
//   1. median of the last few RAW reads → rejects one-off spikes (e.g. a lone
//      glitch/0 among steady values)
//   2. exponential moving average of that median → smooths small sensor jitter
// Higher alpha = snappier but noisier; lower = smoother but slower to react.
const FUEL_MEDIAN_WINDOW = 5;   // raw samples kept for the median
const FUEL_SMOOTHING_ALPHA = 0.4;

// ── Alarm priority ("power level") ──────────────────────────────────────────
// Highest first. Only the top active alarm sounds — a more severe alarm closes
// the lesser ones (e.g. Critical fuel suppresses the Consumption alarm).
const ALARM_PRIORITY = ['critical', 'warning', 'rate'];

function median(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// `fuelSource` (optional) — async () => number|null. When provided, the gauge
// reads fuel from it instead of the Modbus REST endpoint, so the SAME settings /
// alarm logic can drive a non-Modbus device (e.g. a Datakom cloud device).
// `pollMs` (optional) — refresh cadence in ms (default 3000).
export default function FuelGauge({ className = '', isConnected = false, target = {}, fuelSource = null, pollMs = 3000 }) {
  const [fuel, setFuel]       = useState(0);   // always raw %
  const [fetching, setFetching] = useState(false);
  const [error, setError]     = useState('');
  const [noReading, setNoReading] = useState(false); // connected but sensor has no usable value
  const [consumptionRate, setConsumptionRate] = useState(null); // %/hr (positive = draining), or null if not enough data
  const [snooze, setSnooze] = useState(0);     // device snooze timestamp from backend

  // Rolling buffer of {t, fuel} samples used to compute consumption rate
  const samplesRef = useRef([]);
  // Smoothing filter state: last few raw reads (for the median) + the current
  // exponentially-smoothed value that actually drives the gauge.
  const rawBufRef = useRef([]);
  const smoothRef = useRef(null);
  // Timestamp (ms) until which the alarm sound must stay silent after an accept.
  // Seeded from the backend so accepts on any page by any user are respected.
  const snoozeUntilRef = useRef(0);

  // ── Settings ──────────────────────────────────────────────────────────
  const { settings } = useSettings();

  const lowThreshold      = settings?.LOW_TANK_THRESHOLD      ?? defaultSettings.LOW_TANK_THRESHOLD;
  const criticalThreshold = settings?.CRITICAL_TANK_THRESHOLD ?? defaultSettings.CRITICAL_TANK_THRESHOLD;
  const rateThreshold     = settings?.CONSUMPTION_RATE_THRESHOLD ?? defaultSettings.CONSUMPTION_RATE_THRESHOLD;
  const alertsEnabled     = settings?.FUEL_ALERTS_ENABLED     ?? defaultSettings.FUEL_ALERTS_ENABLED;
  const capacityLiters    = settings?.TANK_CAPACITY_LITERS    ?? defaultSettings.TANK_CAPACITY_LITERS;
  const unit              = settings?.TANK_CAPACITY_UNIT      ?? defaultSettings.TANK_CAPACITY_UNIT;
  const showAsPercentage  =
    (settings?.SHOW_TANK_AS_PERCENTAGE ?? defaultSettings.SHOW_TANK_AS_PERCENTAGE) === true
    || unit === 'percentage';

  // ── Alarm sound hook ───────────────────────────────────────────────────
  const { setActive, stop: stopAlarm, muted, setMuted } = useAlarmSound();

  // Stable primitive identifying the polled device, so the effect restarts when
  // the user switches devices (not on every render of the target object).
  const targetId = target.deviceId ?? target.id ?? target.ip ?? null;

  // Fetch device snooze on mount (shared across all users)
  useEffect(() => {
    if (!targetId) return;
    modbusApi
      .getDeviceSnooze(targetId)
      .then((res) => {
        if (res?.snoozeUntilMs) {
          snoozeUntilRef.current = res.snoozeUntilMs;
          setSnooze(res.snoozeUntilMs);
        }
      })
      .catch(() => {});
  }, [targetId]);

  // Periodically refresh device snooze so multiple users respect each other's accepts
  useEffect(() => {
    if (!targetId) return;
    const poll = () => {
      modbusApi
        .getDeviceSnooze(targetId)
        .then((res) => {
          let snoozeMs = res?.snoozeUntilMs || 0;
          // If snooze has expired, clear it so alarm logic effect reruns and restarts sound
          if (snoozeMs > 0 && Date.now() >= snoozeMs) {
            snoozeMs = 0;
          }
          snoozeUntilRef.current = snoozeMs;
          setSnooze(snoozeMs);  // update state so alarm logic effect reruns
        })
        .catch(() => {});
    };
    // Fetch snooze every 1 second so multi-user accepts are seen immediately
    const id = setInterval(poll, 1000);
    return () => clearInterval(id);
  }, [targetId]);

  useEffect(() => {
    const onAccepted = () => {
      const cooldownMin =
        Number(settings?.ALARM_COOLDOWN_MINUTES ?? defaultSettings.ALARM_COOLDOWN_MINUTES) || 60;
      const until = Date.now() + cooldownMin * 60_000;
      snoozeUntilRef.current = until;
      setSnooze(until);  // update state so alarm logic effect reruns
      // Set the snooze on the backend so ALL users on this device respect it
      if (targetId) {
        modbusApi.setDeviceSnooze(targetId, until).catch(() => {});
      }
      stopAlarm();
    };
    window.addEventListener('alarm-accepted', onAccepted);
    return () => window.removeEventListener('alarm-accepted', onAccepted);
  }, [settings, stopAlarm, targetId]);

  // Whether this user may USE the Mute button — gated by the 'alarm.mute'
  // element on the Permissions page (needs a write-level permission covering
  // it). If no permission covers it, canUseElement returns true (not gated).
  const { canUseElement } = useAuth();
  const canMute = canUseElement('alarm.mute');

  // ── Poll fuel API ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!isConnected) {
      setFuel(0);
      setError('');
      setNoReading(false);
      setConsumptionRate(null);
      samplesRef.current = [];
      rawBufRef.current = [];
      smoothRef.current = null;   // reseed the filter on next connect
      stopAlarm();
      return;
    }

    const update = async () => {
      setFetching(true);
      try {
        // Fuel comes either from an injected source (e.g. Datakom cloud) or,
        // by default, the Modbus REST endpoint. modbusApi.getFuel() goes through
        // http.js so the Authorization header is injected and the access token
        // is transparently refreshed on 401 (avoids a flood of 401s).
        let raw;
        if (fuelSource) {
          const v = await fuelSource();
          raw = typeof v === 'number' && Number.isFinite(v) ? v : null;
        } else {
          const json = await modbusApi.getFuel(target);
          raw = typeof json?.fuel === 'number' ? json.fuel : null;
        }
        if (raw === null) {
          // Connected, but the device reports no usable value (e.g. the tank
          // sensor's "unavailable" sentinel). Show an explicit "No reading"
          // state rather than a stale number or a red error, and don't feed
          // the smoothing/rate buffers with a non-value.
          setError('');
          setNoReading(true);
          setConsumptionRate(null);
          samplesRef.current = [];
          return;
        }
        setError('');
        setNoReading(false);

        // Stage 1: median of recent raw reads → drop lone spikes/glitches.
        const rb = rawBufRef.current;
        rb.push(raw);
        while (rb.length > FUEL_MEDIAN_WINDOW) rb.shift();
        const med = median(rb);

        // Stage 2: exponential moving average → smooth remaining jitter.
        const prev = smoothRef.current;
        const smoothed = prev == null ? med : prev + FUEL_SMOOTHING_ALPHA * (med - prev);
        smoothRef.current = smoothed;

        // Deadband: ignore sub-0.05% wobble so the needle sits still.
        setFuel((f) => (Math.abs(f - smoothed) < 0.05 ? f : smoothed));

        // ── Update rolling sample buffer & compute consumption rate ────
        const now = Date.now();
        const buf = samplesRef.current;
        buf.push({ t: now, fuel: smoothed });
        // Drop samples older than the window
        const cutoff = now - RATE_WINDOW_MS;
        while (buf.length && buf[0].t < cutoff) buf.shift();

        if (buf.length >= 2) {
          const oldest = buf[0];
          const newest = buf[buf.length - 1];
          const spanMs = newest.t - oldest.t;
          if (spanMs >= RATE_MIN_SPAN_MS) {
            // Drain rate (positive = fuel decreasing)
            const deltaPct  = oldest.fuel - newest.fuel;
            const hours     = spanMs / 3_600_000;
            setConsumptionRate(deltaPct / hours);
          }
        }
      } catch (err) {
        // Transient read/network error — keep showing the last value rather
        // than flashing to 0. Only a real disconnect resets the gauge.
        setError(err.message || 'Network error');
      } finally {
        setFetching(false);
      }
    };

    update();
    const id = setInterval(update, pollMs);
    return () => { clearInterval(id); stopAlarm(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, targetId, fuelSource, pollMs]);

  // ── Rate-based alarm condition (only meaningful when we have a rate) ───
  // Only sound when the tank is already in the warning zone (≤ lowThreshold).
  // A high drain rate above the safe level is informational but not alarming.
  const rateAlarmActive =
    alertsEnabled &&
    isConnected &&
    !noReading &&
    fuel > 0 &&
    fuel <= lowThreshold &&
    consumptionRate != null &&
    consumptionRate >= rateThreshold;

  // ── Alarm logic ────────────────────────────────────────────────────────
  // Power level: figure out which conditions are active, then keep only the
  // single highest-priority one (ALARM_PRIORITY). A more severe alarm closes
  // the lesser — e.g. once fuel hits Critical, the Consumption alarm stops.
  useEffect(() => {
    if (!alertsEnabled || !isConnected || noReading || fuel <= 0) {
      stopAlarm();
      return;
    }

    // Fuel has recovered above the low threshold → clear any snooze so the
    // alarm fires fresh on the next drop, not silenced by the old cooldown.
    if (fuel > lowThreshold && snoozeUntilRef.current > 0) {
      snoozeUntilRef.current = 0;
      setSnooze(0);
    }

    // While inside the post-accept cooldown window, silence the alarm even if
    // the fuel/rate conditions are still true.
    if (Date.now() < snoozeUntilRef.current) {
      stopAlarm();
      return;
    }

    const conditions = [];
    if (fuel <= criticalThreshold)      conditions.push('critical');
    else if (fuel <= lowThreshold)      conditions.push('warning');
    if (rateAlarmActive)                conditions.push('rate');

    const top = ALARM_PRIORITY.find((p) => conditions.includes(p));
    setActive(top ? [top] : []);
  }, [fuel, alertsEnabled, isConnected, noReading, lowThreshold, criticalThreshold, rateAlarmActive, setActive, stopAlarm, snooze]);

  // ── Derived display values ─────────────────────────────────────────────
  const R    = 40;
  const C    = 2 * Math.PI * R;
  const dash = (fuel / 100) * C;

  const { stroke, text, label, labelClass } = fuelColor(fuel, lowThreshold, criticalThreshold);
  const display = computeDisplay(fuel, showAsPercentage, unit, capacityLiters);

  const levelAlarmActive = alertsEnabled && isConnected && !noReading && fuel > 0 && fuel <= lowThreshold;
  const alarmActive      = levelAlarmActive || rateAlarmActive;
  const isCritical       = !noReading && fuel <= criticalThreshold;

  // Format the rate for display (e.g. "↓ 2.3 %/hr"); null when not yet computed
  const rateDisplay = consumptionRate == null
    ? null
    : (() => {
        const abs = Math.abs(consumptionRate);
        const arrow = consumptionRate > 0.05 ? '↓' : consumptionRate < -0.05 ? '↑' : '·';
        return `${arrow} ${abs.toFixed(1)} %/hr`;
      })();

  const rateClass = rateAlarmActive
    ? 'text-red-300 bg-red-500/15 border-red-500/30'
    : consumptionRate != null && consumptionRate > 0
      ? 'text-amber-300 bg-amber-500/10 border-amber-500/20'
      : 'text-gray-400 bg-white/5 border-white/10';

  return (
    <div id="fuel-level" className={`scroll-mt-24 card p-6 flex flex-col gap-5 ${className}`}>

      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
              d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          <span className="text-sm font-semibold text-gray-200">Fuel Level</span>
        </div>

        <div className="flex items-center gap-2">
          {/* Consumption rate pill */}
          {isConnected && rateDisplay && (
            <span
              title={`Consumption rate (alarms above ${rateThreshold} %/hr)`}
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold tabular-nums border ${rateClass}`}
            >
              {rateDisplay}
            </span>
          )}

          {/* Mute button — only when the alarm is active AND the user is
              allowed to use it (see the 'alarm.mute' element on Permissions). */}
          {alarmActive && canMute && (
            <MuteButton muted={muted} onToggle={() => setMuted((m) => !m)} />
          )}

          {isConnected && (
            noReading ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold text-gray-400 bg-white/5">
                No reading
              </span>
            ) : (
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold ${labelClass}`}>
                {(fetching || alarmActive) && (
                  <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                )}
                {label}
              </span>
            )
          )}
        </div>
      </div>

      {/* ── SVG Gauge ── */}
      <div className="relative flex items-center justify-center">
        {/* Pulsing ring when critical */}
        {isCritical && isConnected && fuel > 0 && (
          <div className="absolute w-44 h-44 rounded-full border-2 border-red-500/30 animate-ping pointer-events-none" />
        )}

        <svg viewBox="0 0 100 100" className="w-44 h-44">
          <circle cx="50" cy="50" r={R} fill="none" stroke="#ffffff0d" strokeWidth="9" />
          <circle
            cx="50" cy="50" r={R}
            fill="none"
            stroke={isConnected && !noReading ? stroke : '#374151'}
            strokeWidth="9"
            strokeLinecap="round"
            strokeDasharray={`${noReading ? 0 : dash} ${C}`}
            strokeDashoffset="0"
            transform="rotate(-90 50 50)"
            style={{ transition: 'stroke-dasharray 1s ease, stroke 0.5s ease' }}
          />
          {isConnected && !noReading && fuel > 0 && (
            <circle
              cx="50" cy="50" r={R}
              fill="none"
              stroke={stroke}
              strokeWidth="2"
              strokeLinecap="round"
              strokeDasharray={`${dash} ${C}`}
              strokeDashoffset="0"
              transform="rotate(-90 50 50)"
              opacity="0.25"
              style={{ transition: 'stroke-dasharray 1s ease' }}
              filter="url(#gaugeBlur)"
            />
          )}
          <defs>
            <filter id="gaugeBlur"><feGaussianBlur stdDeviation="3" /></filter>
          </defs>
        </svg>

        {/* Centre label */}
        <div className="absolute inset-0 flex items-center justify-center flex-col gap-0.5">
          {!isConnected ? (
            <span className="text-sm text-gray-600">Offline</span>
          ) : noReading ? (
            <>
              <span className="text-lg font-semibold text-gray-400 leading-none">No reading</span>
              <span className="text-[11px] text-gray-600 font-medium mt-1 text-center px-4">
                Sensor unavailable
              </span>
            </>
          ) : (
            <>
              <div className="flex items-baseline gap-1">
                <span className={`text-3xl font-bold tabular-nums leading-none ${text}`}>
                  {display.value}
                </span>
                <span className={`text-sm font-semibold ${text}`}>{display.unit}</span>
              </div>
              <span className="text-[11px] text-gray-500 font-medium mt-0.5">{display.subLabel}</span>
              {!showAsPercentage && (
                <span className="text-[10px] text-gray-600 mt-0.5">{fuel.toFixed(1)}% full</span>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Fetch error ── */}
      {error && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
          <svg aria-hidden="true" className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {error}
        </div>
      )}

      {/* ── Level alarm banner ── */}
      {levelAlarmActive && (
        <div
          role="alert"
          aria-live={isCritical ? 'assertive' : 'polite'}
          className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-semibold
          ${isCritical
            ? 'bg-red-500/15 border border-red-500/30 text-red-300'
            : 'bg-amber-500/15 border border-amber-500/30 text-amber-300'
          }`}
        >
          <svg aria-hidden="true" className={`w-4 h-4 flex-shrink-0 ${isCritical ? 'animate-pulse' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
          <span className="flex-1">
            {isCritical
              ? `CRITICAL: below ${criticalThreshold}% — immediate attention needed`
              : `WARNING: below ${lowThreshold}% — refill soon`
            }
          </span>
          {/* Sound indicator */}
          {!muted && (
            <svg aria-hidden="true" className="w-3.5 h-3.5 flex-shrink-0 animate-pulse" fill="currentColor" viewBox="0 0 24 24">
              <path d="M18.364 5.636a9 9 0 010 12.728M15.536 8.464a5 5 0 010 7.072M12 6v12m0 0l-4-4H4a1 1 0 01-1-1V11a1 1 0 011-1h4l4-4z"/>
            </svg>
          )}
        </div>
      )}

      {/* ── Consumption-rate alarm banner (shown alongside level banner when both fire) ── */}
      {rateAlarmActive && (
        <div
          role="alert"
          aria-live="polite"
          className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-semibold
          bg-amber-500/15 border border-amber-500/30 text-amber-300"
        >
          <svg aria-hidden="true" className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
          </svg>
          <span className="flex-1">
            HIGH CONSUMPTION: {Math.abs(consumptionRate).toFixed(1)} %/hr (limit {rateThreshold} %/hr)
          </span>
          {!muted && (
            <svg aria-hidden="true" className="w-3.5 h-3.5 flex-shrink-0 animate-pulse" fill="currentColor" viewBox="0 0 24 24">
              <path d="M18.364 5.636a9 9 0 010 12.728M15.536 8.464a5 5 0 010 7.072M12 6v12m0 0l-4-4H4a1 1 0 01-1-1V11a1 1 0 011-1h4l4-4z"/>
            </svg>
          )}
        </div>
      )}

      {/* ── Progress bar with threshold ticks ── */}
      <div className="space-y-2">
        <div className="relative h-2 rounded-full bg-white/5 overflow-visible">
          <div
            className="h-full rounded-full transition-all duration-1000"
            style={{ width: `${isConnected && !noReading ? fuel : 0}%`, background: isConnected && !noReading ? stroke : '#374151' }}
          />
          <div
            className="absolute top-1/2 -translate-y-1/2 w-0.5 h-4 bg-red-500/70 rounded-full"
            style={{ left: `${criticalThreshold}%` }}
            title={`Critical: ${criticalThreshold}%`}
          />
          <div
            className="absolute top-1/2 -translate-y-1/2 w-0.5 h-4 bg-amber-500/70 rounded-full"
            style={{ left: `${lowThreshold}%` }}
            title={`Low: ${lowThreshold}%`}
          />
        </div>
        <div className="flex justify-between text-[10px]">
          <span className="text-red-500">Critical &lt;{criticalThreshold}%</span>
          <span className="text-amber-500">Low &lt;{lowThreshold}%</span>
          <span className="text-emerald-500">Good</span>
        </div>
      </div>

      {/* ── Capacity info row ── */}
      {isConnected && !showAsPercentage && (
        <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-white/3 border border-white/5 text-xs text-gray-500">
          <span>Tank capacity</span>
          <span className="font-medium text-gray-400">
            {unit === 'gallons'
              ? `${(capacityLiters * 0.264172).toFixed(0)} gal`
              : `${capacityLiters} L`
            }
          </span>
        </div>
      )}

      {/* ── Alerts disabled notice ── */}
      {!alertsEnabled && (
        <p className="text-[11px] text-gray-600 text-center">
          Fuel alerts are disabled in Settings
        </p>
      )}
    </div>
  );
}
