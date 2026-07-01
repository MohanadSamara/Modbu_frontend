// ============================================================================
// AuthContext — current user, login/logout actions, permission checks.
//
// Token lifecycle:
//   • on mount: if a refresh token is present in localStorage, call /auth/me
//     (which triggers http.js to swap it for a fresh access token).
//   • login: store both tokens, fetch /me to populate user + permissions.
//   • logout: revoke server-side session, clear local tokens, drop user.
// ============================================================================

import { createContext, useEffect, useState, useCallback, useMemo } from 'react';
import { authApi } from '../api/auth';
import {
  setAccessToken,
  setRefreshToken,
  getRefreshToken,
  clearTokens,
  setAuthFailedHandler,
} from '../api/http';

// eslint-disable-next-line react-refresh/only-export-components
export const AuthContext = createContext(null);

// Does a permission row satisfy the requested scope?
//   projectId == null → context-free check: any scope counts (used for nav
//                        links / route gates where no project is in context).
//   projectId set      → global grant OR a grant for exactly that project.
function permScopeMatches(p, projectId) {
  if (projectId == null) return true;
  return p.projectId == null || p.projectId === projectId;
}

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);   // { id, username, email, fullName, roles, permissions }
  const [loading, setLoading] = useState(true);   // true while checking saved refresh token on first mount
  const [error, setError]     = useState(null);

  // ── Helpers ────────────────────────────────────────────────────────────
  const _hydrateFromMe = useCallback(async () => {
    const profile = await authApi.me();
    setUser(profile);
    return profile;
  }, []);

  // ── Login / logout ─────────────────────────────────────────────────────
  const login = useCallback(async (loginValue, password) => {
    setError(null);
    const data = await authApi.login(loginValue, password);
    setAccessToken(data.accessToken);
    setRefreshToken(data.refreshToken);
    await _hydrateFromMe();
    return data.user;
  }, [_hydrateFromMe]);

  const logout = useCallback(async () => {
    const refresh = getRefreshToken();
    try {
      if (refresh) await authApi.logout(refresh);
    } catch { /* ignore — we'll clear locally regardless */ }
    clearTokens();
    setUser(null);
  }, []);

  const logoutAll = useCallback(async () => {
    try { await authApi.logoutAll(); } catch { /* ignore */ }
    clearTokens();
    setUser(null);
  }, []);

  // Called by http.js when refresh fails (refresh token expired / revoked).
  // We just drop the user so the route guard kicks in.
  useEffect(() => {
    setAuthFailedHandler(() => {
      clearTokens();
      setUser(null);
    });
return () => setAuthFailedHandler(null);
  }, []);

  // ── First-mount hydration ──────────────────────────────────────────────────
  useEffect(() => {
    const refresh = getRefreshToken();
    if (!refresh) {
      setLoading(false);
      return;
    }
    _hydrateFromMe()
      .catch(() => { clearTokens(); setUser(null); })
      .finally(() => setLoading(false));
  }, [_hydrateFromMe]);

  // ── Permission helper ──────────────────────────────────────────────────
  // Two modes, chosen by whether the caller passes a specific project:
  //   • projectId given  → project-aware: a global grant (projectId null) OR a
  //     grant matching that project passes. Mirrors the backend rule.
  //   • projectId omitted → context-free (nav links, route gates, "can this
  //     user do X anywhere?"): a grant in ANY scope passes — global, or scoped
  //     to any project/location/device. The precise per-scope enforcement is
  //     done by the backend; here we only decide whether to reveal the UI.
  const hasPermission = useCallback((key, projectId = null) => {
    if (!user?.permissions) return false;
    return user.permissions.some((p) => p.key === key && permScopeMatches(p, projectId));
  }, [user]);

  // Like hasPermission but passes if the user holds ANY of `keys`. Used where
  // either a granular key or a legacy bundled key is acceptable — e.g. START
  // is allowed by either 'device.start' or the legacy 'device.control'.
  const hasAnyPermission = useCallback((keys, projectId = null) => {
    if (!user?.permissions) return false;
    const list = Array.isArray(keys) ? keys : [keys];
    return user.permissions.some((p) => list.includes(p.key) && permScopeMatches(p, projectId));
  }, [user]);

  const hasRole = useCallback((roleKey) => {
    if (!user?.roles) return false;
    return user.roles.some((r) => r.key === roleKey);
  }, [user]);

  const refreshProfile = useCallback(() => _hydrateFromMe(), [_hydrateFromMe]);

  const value = useMemo(() => ({
    user,
    loading,
    error,
    login,
    logout,
    logoutAll,
    hasPermission,
    hasAnyPermission,
    hasRole,
    refreshProfile,
    isAuthenticated: !!user,
  }), [user, loading, error, login, logout, logoutAll, hasPermission, hasAnyPermission, hasRole, refreshProfile]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// `useAuth()` lives in ./useAuth.js so this file stays component-only
// (keeps the React-Refresh / Fast-Refresh rule happy).
