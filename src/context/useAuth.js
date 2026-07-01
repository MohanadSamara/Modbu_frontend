// ============================================================================
// useAuth() — convenience hook to consume AuthContext.
//
// Lives in its own file so AuthContext.jsx can keep React-Refresh "only
// component exports" rule happy.
// ============================================================================

import { useContext } from 'react';
import { AuthContext } from './AuthContext.jsx';

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth() must be used inside <AuthProvider>');
  return ctx;
}
