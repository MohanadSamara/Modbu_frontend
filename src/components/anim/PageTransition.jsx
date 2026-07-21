// ============================================================================
// PageTransition — animates route changes (silk page recipe). Wraps <Outlet/>
// in Layout so every page glides in instead of popping.
// ============================================================================
import { motion, AnimatePresence } from 'framer-motion';
import { useLocation } from 'react-router-dom';
import { page } from '../../lib/motion.js';

export default function PageTransition({ children }) {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div key={location.pathname} {...page}>
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
