// ============================================================================
// ProtectedRoute — gate the app behind authentication.
//
// While AuthContext is still loading (validating a saved refresh token),
// render a small splash so the user doesn't see a "login" flash.
// ============================================================================

import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/useAuth.js';

export default function ProtectedRoute({ children, requiredPermission = null, requiredAnyPermission = null }) {
  const { isAuthenticated, loading, hasPermission } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0f1117]">
        <div className="flex flex-col items-center gap-3 text-gray-400">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm">Loading…</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    // Send them to /login but remember where they were trying to go
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  // Access is denied when a single required permission is missing, or when an
  // "any of" list is given and the user holds none of them.
  const missingSingle = requiredPermission && !hasPermission(requiredPermission);
  const missingAny =
    requiredAnyPermission &&
    requiredAnyPermission.length > 0 &&
    !requiredAnyPermission.some((p) => hasPermission(p));

  if (missingSingle || missingAny) {
    const deniedLabel = requiredPermission || (requiredAnyPermission || []).join(' or ');
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0f1117] p-6">
        <div className="max-w-md w-full bg-[#13151c] border border-white/10 rounded-2xl p-8 text-center">
          <div className="w-12 h-12 mx-auto rounded-xl bg-red-500/15 flex items-center justify-center mb-4">
            <svg className="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-white text-lg font-semibold mb-2">Access denied</h2>
          <p className="text-gray-400 text-sm">
            Your account doesn't have the <code className="text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded">{deniedLabel}</code> permission.
          </p>
        </div>
      </div>
    );
  }

  return children;
}
