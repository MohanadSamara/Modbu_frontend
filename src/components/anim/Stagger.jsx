// ============================================================================
// Stagger — grid/list entrance choreography (Magic UI AnimatedList pattern).
//
//   <StaggerGrid className="grid …">
//     {items.map((x) => <StaggerItem key={x.id}>…</StaggerItem>)}
//   </StaggerGrid>
//
// Children cascade in with the styleseed silk easing. Layout animations keep
// reordering smooth (e.g. Fuel gauges resorting lowest-first as values move).
// ============================================================================
import { motion } from 'framer-motion';
import { stagger } from '../../lib/motion.js';

export function StaggerGrid({ className = '', children, ...rest }) {
  return (
    <motion.div className={className} {...stagger.container} {...rest}>
      {children}
    </motion.div>
  );
}

export function StaggerItem({ className = '', children, layoutId, ...rest }) {
  return (
    <motion.div className={className} {...stagger.item} layout layoutId={layoutId} {...rest}>
      {children}
    </motion.div>
  );
}
