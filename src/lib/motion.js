// ============================================================================
// motion.js — styleseed motion seeds adapted for this app (JS version).
//
// Two seeds cover the whole product so every animation feels related:
//   silk   — smooth, composed. Page/card entrances, dashboards. (Stripe/Linear)
//   spring — bouncy, alive.   Buttons, success states, interactive bits. (Arc)
//
// Usage (framer-motion):
//   <motion.div {...silk.entrance}>…</motion.div>
//   <motion.button {...spring.hover} {...spring.press}>Save</motion.button>
//
// Every recipe honours prefers-reduced-motion via <MotionConfig reducedMotion
// ="user"> set once in App.jsx — framer-motion then strips transforms itself.
// ============================================================================

export const silk = {
  entrance: {
    initial: { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0, transition: { ease: [0.32, 0.72, 0, 1], duration: 0.45 } },
  },
  exit: {
    exit: { opacity: 0, y: -6, transition: { ease: [0.4, 0, 1, 1], duration: 0.3 } },
  },
  hover: {
    whileHover: { y: -2, transition: { ease: [0.32, 0.72, 0, 1], duration: 0.25 } },
  },
  press: {
    whileTap: { scale: 0.98, transition: { ease: [0.4, 0, 0.2, 1], duration: 0.15 } },
  },
};

export const spring = {
  entrance: {
    initial: { opacity: 0, y: 16, scale: 0.96 },
    animate: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 300, damping: 18, mass: 1 } },
  },
  hover: {
    whileHover: { scale: 1.03, y: -2, transition: { type: 'spring', stiffness: 300, damping: 20 } },
  },
  press: {
    whileTap: { scale: 0.96, transition: { type: 'spring', stiffness: 500, damping: 30 } },
  },
};

// Stagger recipes for grids/lists: parent orchestrates, children use `item`.
export const stagger = {
  container: {
    initial: 'hidden',
    animate: 'show',
    variants: { hidden: {}, show: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } } },
  },
  item: {
    variants: {
      hidden: { opacity: 0, y: 14 },
      show: { opacity: 1, y: 0, transition: { ease: [0.32, 0.72, 0, 1], duration: 0.4 } },
    },
  },
};

// Route-change transition (used by <PageTransition> around <Outlet/>).
export const page = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0, transition: { ease: [0.32, 0.72, 0, 1], duration: 0.35 } },
  exit: { opacity: 0, y: -6, transition: { ease: [0.4, 0, 1, 1], duration: 0.2 } },
};
