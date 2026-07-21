// ============================================================================
// useToast() / useConfirm() — convenience hooks to consume FeedbackContext.
//
// Lives in its own file so FeedbackContext.jsx can keep React-Refresh "only
// component exports" rule happy (same pattern as useAuth.js).
// ============================================================================

import { useContext } from 'react';
import { FeedbackContext } from './FeedbackContext.jsx';

export function useToast() {
  const ctx = useContext(FeedbackContext);
  if (!ctx) throw new Error('useToast() must be used inside <FeedbackProvider>');
  return ctx.toast;
}

export function useConfirm() {
  const ctx = useContext(FeedbackContext);
  if (!ctx) throw new Error('useConfirm() must be used inside <FeedbackProvider>');
  return ctx.confirm;
}
