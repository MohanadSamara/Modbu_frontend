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
  // Mirrors the backend rule: a user has permission `key` for project `pid`
  // if any of their permission rows match key AND (projectId is null OR === pid).
  const hasPermission = useCallback((key, projectId = null) => {
    if (!user?.permissions) return false;
    return user.permissions.some(
      (p) => p.key === key && (p.projectId == null || p.projectId === projectId)
    );
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
    hasRole,
    refreshProfile,
    isAuthenticated: !!user,
  }), [user, loading, error, login, logout, logoutAll, hasPermission, hasRole, refreshProfile]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// `useAuth()` lives in ./useAuth.js so this file stays component-only
// (keeps the React-Refresh / Fast-Refresh rule happy).
