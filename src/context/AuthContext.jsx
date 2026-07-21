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
import { authApi, uiFeaturesApi, uiElementsApi } from '../api/auth';
import { defaultPermissionFor } from '../config/uiFeatures';
import { keysSatisfying } from '../config/uiElements';
import {
  setAccessToken,
  setRefreshToken,
  getRefreshToken,
  clearTokens,
  setAuthFailedHandler,
  refreshAccessToken,
} from '../api/http';

// The level of a permission key ('alarm.write' → 'write'). read = view only.
function levelOfKey(key) {
  const parts = String(key || '').split('.');
  return (parts[1] || '').toLowerCase();
}

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
  // Admin overrides for which permission reveals each UI feature.
  // { [featureId]: permissionKey | null }. Missing key → use catalog default.
  const [featureOverrides, setFeatureOverrides] = useState({});
  // Which permissions cover each granular UI element.
  // { [elementId]: [permissionKey, …] }. Missing element → not gated (usable).
  const [elementMap, setElementMap] = useState({});

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
  // The access token lives in memory only, so it's gone after a reload. Mint a
  // fresh one from the stored refresh token *before* calling /me — otherwise the
  // first /me fires with no token and logs an expected-but-noisy 401.
  useEffect(() => {
    const refresh = getRefreshToken();
    if (!refresh) {
      setLoading(false);
      return;
    }
    (async () => {
      const token = await refreshAccessToken();
      if (!token) throw new Error('refresh failed');
      return _hydrateFromMe();
    })()
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
  // Implications (write → read etc., see config/uiElements.js): a check for a
  // weaker key also passes when the user holds a stronger key that implies it,
  // at the same scope. The backend applies the identical expansion, so the UI
  // never shows something the API would then refuse.
  const hasPermission = useCallback((key, projectId = null) => {
    if (!user?.permissions) return false;
    const accepted = keysSatisfying(key);
    return user.permissions.some((p) => accepted.includes(p.key) && permScopeMatches(p, projectId));
  }, [user]);

  // Like hasPermission but passes if the user holds ANY of `keys`. Used where
  // either a granular key or a legacy bundled key is acceptable — e.g. START
  // is allowed by either 'device.start' or the legacy 'device.control'.
  const hasAnyPermission = useCallback((keys, projectId = null) => {
    if (!user?.permissions) return false;
    const list = Array.isArray(keys) ? keys : [keys];
    const accepted = [...new Set(list.flatMap(keysSatisfying))];
    return user.permissions.some((p) => accepted.includes(p.key) && permScopeMatches(p, projectId));
  }, [user]);

  const hasRole = useCallback((roleKey) => {
    if (!user?.roles) return false;
    return user.roles.some((r) => r.key === roleKey);
  }, [user]);

  // ── UI feature visibility ──────────────────────────────────────────────
  // Load admin overrides whenever a user is present.
  const loadFeatureOverrides = useCallback(async () => {
    try {
      const rows = await uiFeaturesApi.list(); // [{ featureId, permissionKey }]
      const map = {};
      for (const r of rows || []) map[r.featureId] = r.permissionKey ?? null;
      setFeatureOverrides(map);
    } catch {
      setFeatureOverrides({}); // fall back to catalog defaults
    }
  }, []);

  // Load which permissions cover each granular UI element.
  const loadElementMap = useCallback(async () => {
    try {
      const rows = await uiElementsApi.list(); // [{ elementId, permissionKey }]
      const map = {};
      for (const r of rows || []) {
        (map[r.elementId] ||= []).push(r.permissionKey);
      }
      setElementMap(map);
    } catch {
      setElementMap({}); // fall back to "nothing gated"
    }
  }, []);

  useEffect(() => {
    if (user) { loadFeatureOverrides(); loadElementMap(); }
    else { setFeatureOverrides({}); setElementMap({}); }
  }, [user, loadFeatureOverrides, loadElementMap]);

  // Should a UI feature be shown? Resolves the override (or catalog default) to
  // a permission requirement, then checks it. null/'' requirement → always show.
  const canFeature = useCallback((featureId, projectId = null) => {
    const eff = Object.prototype.hasOwnProperty.call(featureOverrides, featureId)
      ? featureOverrides[featureId]
      : defaultPermissionFor(featureId);
    if (eff == null || eff === '') return true;
    if (Array.isArray(eff)) return hasAnyPermission(eff, projectId);
    return hasPermission(eff, projectId);
  }, [featureOverrides, hasPermission, hasAnyPermission]);

  // Can the current user USE a granular UI element (e.g. the alarm Mute button)?
  //   • no permission covers the element → not gated, allow.
  //   • otherwise the user must hold a covering permission whose level is NOT
  //     'read' (read = view only; write/other = usable). Mirrors the rule in
  //     the Permissions editor.
  const canUseElement = useCallback((elementId, projectId = null) => {
    const coveringKeys = elementMap[elementId];
    if (!coveringKeys || coveringKeys.length === 0) return true; // not gated
    if (!user?.permissions) return false;
    return coveringKeys.some((key) =>
      levelOfKey(key) !== 'read' &&
      user.permissions.some((p) => p.key === key && permScopeMatches(p, projectId))
    );
  }, [elementMap, user]);

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
    canFeature,
    canUseElement,
    refreshFeatureOverrides: loadFeatureOverrides,
    refreshElementMap: loadElementMap,
    refreshProfile,
    isAuthenticated: !!user,
  }), [user, loading, error, login, logout, logoutAll, hasPermission, hasAnyPermission, hasRole, canFeature, canUseElement, loadFeatureOverrides, loadElementMap, refreshProfile]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// `useAuth()` lives in ./useAuth.js so this file stays component-only
// (keeps the React-Refresh / Fast-Refresh rule happy).
