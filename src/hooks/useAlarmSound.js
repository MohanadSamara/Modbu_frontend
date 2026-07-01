/**
 * useAlarmSound
 *
 * Synthesised alarm tones via the Web Audio API — no audio files needed.
 *
 * CRITICAL – industrial klaxon: alternating 2-tone wail (800 Hz ↔ 1040 Hz)
 *            with a saw-wave oscillator + distortion, 5-note burst, repeats every 1.2 s
 *
 * WARNING  – urgent pulsing triple-beep (660 Hz square wave), repeats every 2.5 s
 *
 * RATE     – descending two-tone "drain" swoop (sine + triangle), evokes
 *            something flowing out fast. Repeats every 3 s.
 */

import { useRef, useState, useCallback, useEffect } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// Helper: add a WaveShaperNode for hard clipping / distortion
// ─────────────────────────────────────────────────────────────────────────────
function makeDistortion(ctx, amount = 200) {
  const ws   = ctx.createWaveShaper();
  const n    = 256;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = ((Math.PI + amount) * x) / (Math.PI + amount * Math.abs(x));
  }
  ws.curve  = curve;
  ws.oversample = '4x';
  return ws;
}

// ─────────────────────────────────────────────────────────────────────────────
// CRITICAL klaxon – industrial two-tone wail
//   Five notes that alternate 800 Hz ↔ 1040 Hz with a sawtooth wave, all
//   layered with a low-frequency rumble (120 Hz) and heavy distortion.
//   Total duration ≈ 0.9 s, then silence before the next repeat.
// ─────────────────────────────────────────────────────────────────────────────
function playCritical(ctx) {
  const now  = ctx.currentTime;
  const dist = makeDistortion(ctx, 300);
  const masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(0.0, now);
  masterGain.gain.linearRampToValueAtTime(0.9, now + 0.02); // sharp attack
  masterGain.gain.setValueAtTime(0.9, now + 0.85);
  masterGain.gain.linearRampToValueAtTime(0.0, now + 0.95); // short tail
  dist.connect(masterGain);
  masterGain.connect(ctx.destination);

  // Alternating klaxon tones
  const notes = [
    { freq: 800,  start: 0.00, dur: 0.16 },
    { freq: 1040, start: 0.17, dur: 0.16 },
    { freq: 800,  start: 0.34, dur: 0.16 },
    { freq: 1040, start: 0.51, dur: 0.16 },
    { freq: 800,  start: 0.68, dur: 0.16 },
  ];

  notes.forEach(({ freq, start, dur }) => {
    // Primary saw oscillator
    const osc = ctx.createOscillator();
    osc.type  = 'sawtooth';
    osc.frequency.setValueAtTime(freq, now + start);
    // Slight downward pitch bend for urgency
    osc.frequency.linearRampToValueAtTime(freq * 0.97, now + start + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.55, now + start);
    g.gain.linearRampToValueAtTime(0.0, now + start + dur + 0.01);
    osc.connect(g);
    g.connect(dist);
    osc.start(now + start);
    osc.stop(now + start + dur + 0.02);

    // Octave sub-tone for body
    const sub = ctx.createOscillator();
    sub.type  = 'square';
    sub.frequency.setValueAtTime(freq / 2, now + start);
    const sg = ctx.createGain();
    sg.gain.setValueAtTime(0.25, now + start);
    sg.gain.linearRampToValueAtTime(0.0, now + start + dur + 0.01);
    sub.connect(sg);
    sg.connect(dist);
    sub.start(now + start);
    sub.stop(now + start + dur + 0.02);
  });

  // Low rumble throughout (adds physical danger feel)
  const rumble = ctx.createOscillator();
  rumble.type  = 'square';
  rumble.frequency.setValueAtTime(120, now);
  const rg = ctx.createGain();
  rg.gain.setValueAtTime(0.18, now);
  rg.gain.linearRampToValueAtTime(0.0, now + 0.9);
  rumble.connect(rg);
  rg.connect(masterGain);
  rumble.start(now);
  rumble.stop(now + 0.95);
}

// ─────────────────────────────────────────────────────────────────────────────
// WARNING pulse – urgent triple-beep
//   Three short square-wave beeps at 660 Hz with a fast attack/decay,
//   slightly rising pitch on each beep for tension.
// ─────────────────────────────────────────────────────────────────────────────
function playWarning(ctx) {
  const now = ctx.currentTime;
  const masterGain = ctx.createGain();
  masterGain.connect(ctx.destination);

  const beeps = [
    { freq: 660, start: 0.00, dur: 0.10 },
    { freq: 700, start: 0.15, dur: 0.10 },
    { freq: 740, start: 0.30, dur: 0.14 },
  ];

  beeps.forEach(({ freq, start, dur }) => {
    const osc = ctx.createOscillator();
    osc.type  = 'square';
    osc.frequency.setValueAtTime(freq, now + start);

    const g = ctx.createGain();
    // Hard attack, exponential decay
    g.gain.setValueAtTime(0.0,  now + start);
    g.gain.linearRampToValueAtTime(0.55, now + start + 0.008);
    g.gain.exponentialRampToValueAtTime(0.001, now + start + dur);

    osc.connect(g);
    g.connect(masterGain);
    osc.start(now + start);
    osc.stop(now + start + dur + 0.01);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// RATE alert – descending "drain" swoop
//   Two overlapping tones (sine + triangle) sweeping from ~880 Hz down to
//   ~330 Hz, then a short dip-and-bleep tail. The downward glide is the key
//   audible signature: tells the operator "something is draining fast" and is
//   clearly distinct from the rising triple-beep used for low-tank warnings.
// ─────────────────────────────────────────────────────────────────────────────
function playRate(ctx) {
  const now = ctx.currentTime;
  const masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(0.0, now);
  masterGain.gain.linearRampToValueAtTime(0.55, now + 0.03);
  masterGain.gain.setValueAtTime(0.55, now + 0.55);
  masterGain.gain.linearRampToValueAtTime(0.0, now + 0.70);
  masterGain.connect(ctx.destination);

  // Primary descending tone – sine, smooth glide
  const oscA = ctx.createOscillator();
  oscA.type = 'sine';
  oscA.frequency.setValueAtTime(880, now);
  oscA.frequency.exponentialRampToValueAtTime(330, now + 0.55);
  const gA = ctx.createGain();
  gA.gain.setValueAtTime(0.6, now);
  gA.gain.linearRampToValueAtTime(0.0, now + 0.62);
  oscA.connect(gA);
  gA.connect(masterGain);
  oscA.start(now);
  oscA.stop(now + 0.65);

  // Secondary descending tone – triangle, a fifth above, gives "swoop" body
  const oscB = ctx.createOscillator();
  oscB.type = 'triangle';
  oscB.frequency.setValueAtTime(1320, now);
  oscB.frequency.exponentialRampToValueAtTime(495, now + 0.55);
  const gB = ctx.createGain();
  gB.gain.setValueAtTime(0.25, now);
  gB.gain.linearRampToValueAtTime(0.0, now + 0.62);
  oscB.connect(gB);
  gB.connect(masterGain);
  oscB.start(now);
  oscB.stop(now + 0.65);

  // Short tail bleep – gives the burst a clear ending so consecutive
  // repetitions don't blur together.
  const tail = ctx.createOscillator();
  tail.type = 'sine';
  tail.frequency.setValueAtTime(440, now + 0.62);
  const tg = ctx.createGain();
  tg.gain.setValueAtTime(0.0,  now + 0.62);
  tg.gain.linearRampToValueAtTime(0.45, now + 0.63);
  tg.gain.exponentialRampToValueAtTime(0.001, now + 0.78);
  tail.connect(tg);
  tg.connect(masterGain);
  tail.start(now + 0.62);
  tail.stop(now + 0.80);
}

// ─────────────────────────────────────────────────────────────────────────────
const BURST_FN  = { critical: playCritical, warning: playWarning, rate: playRate };
const REPEAT_MS = { critical: 1200,          warning: 2500,        rate: 3000 };

export function useAlarmSound() {
  const ctxRef    = useRef(null);
  // Map of type → setInterval id. Lets multiple alarm types loop concurrently
  // (e.g. low-tank warning + high-consumption rate at the same time).
  const intervalsRef = useRef({});
  const [muted, setMuted] = useState(false);
  const mutedRef  = useRef(false);

  useEffect(() => { mutedRef.current = muted; }, [muted]);

  const getCtx = useCallback(() => {
    if (!ctxRef.current) {
      ctxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (ctxRef.current.state === 'suspended') {
      ctxRef.current.resume().catch(() => {});
    }
    return ctxRef.current;
  }, []);

  // Stop a single alarm type, or every type when called with no args.
  const stop = useCallback((type) => {
    const intervals = intervalsRef.current;
    if (type === undefined) {
      Object.values(intervals).forEach(clearInterval);
      intervalsRef.current = {};
      return;
    }
    if (intervals[type]) {
      clearInterval(intervals[type]);
      delete intervals[type];
    }
  }, []);

  // Start a loop for the given type. If already running, this is a no-op so
  // the burst cadence isn't restarted on every render.
  const trigger = useCallback((type) => {
    if (!BURST_FN[type]) return;
    if (intervalsRef.current[type]) return;          // already looping

    const fire = () => {
      if (mutedRef.current) return;
      try {
        BURST_FN[type](getCtx());
      } catch (_) { /* AudioContext not supported */ }
    };

    fire();
    intervalsRef.current[type] = setInterval(fire, REPEAT_MS[type]);
  }, [getCtx]);

  // Stop everything except the supplied type list (handy for "set this to be
  // the only active alarms" semantics from a single useEffect).
  const setActive = useCallback((types) => {
    const want = new Set(types);
    // stop anything no longer wanted
    Object.keys(intervalsRef.current).forEach((t) => {
      if (!want.has(t)) {
        clearInterval(intervalsRef.current[t]);
        delete intervalsRef.current[t];
      }
    });
    // start anything missing
    want.forEach((t) => trigger(t));
  }, [trigger]);

  useEffect(() => () => stop(), [stop]);

  return { trigger, stop, setActive, muted, setMuted };
}
