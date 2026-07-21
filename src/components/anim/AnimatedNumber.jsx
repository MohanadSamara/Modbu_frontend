// ============================================================================
// AnimatedNumber — CountUp-style number (React Bits pattern) on framer-motion
// springs. Animates to `value` whenever it changes, so live telemetry values
// glide instead of jumping. Falls back to plain text under reduced motion.
// ============================================================================
import { useEffect, useRef } from 'react';
import { useMotionValue, useSpring, useReducedMotion } from 'framer-motion';

export default function AnimatedNumber({
  value,
  decimals = 0,
  prefix = '',
  suffix = '',
  className = '',
  duration = 0.8,
}) {
  const reduced = useReducedMotion();
  const ref = useRef(null);
  const mv = useMotionValue(value ?? 0);
  const springValue = useSpring(mv, { duration: duration * 1000, bounce: 0 });

  useEffect(() => {
    if (typeof value === 'number') mv.set(value);
  }, [value, mv]);

  useEffect(() => {
    if (reduced) return undefined;
    const unsub = springValue.on('change', (v) => {
      if (ref.current) ref.current.textContent = `${prefix}${v.toFixed(decimals)}${suffix}`;
    });
    return unsub;
  }, [springValue, decimals, prefix, suffix, reduced]);

  const staticText = `${prefix}${typeof value === 'number' ? value.toFixed(decimals) : '—'}${suffix}`;
  // Under reduced motion (or before the first spring tick) render the value
  // directly; the ref swap only happens while animating.
  return (
    <span ref={ref} className={`tabular-nums ${className}`}>
      {staticText}
    </span>
  );
}
