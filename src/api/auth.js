// ============================================================================
// auth.js — auth + user-management API client.
//
// Maps 1:1 to the backend routes in routes-auth.js and routes-users.js.
// ============================================================================

import { request } from './http';

export const authApi = {
  /** POST /api/auth/login — returns { accessToken, refreshToken, user } */
  login: (login, password) =>
    request('/auth/login', {
      method: 'POST',
      body: { login, password },
      prefix: 'Login failed',
      skipAuth: true,
      timeoutMs: 30000,
    }),

  /** POST /api/auth/refresh — used internally by http.js */
  refresh: (refreshToken) =>
    request('/auth/refresh', {
      method: 'POST',
      body: { refreshToken },
      prefix: 'Refresh failed',
      skipAuth: true,
      timeoutMs: 30000,
    }),

  /** POST /api/auth/logout — best-effort (always succeeds client-side) */
  logout: (refreshToken) =>
    request('/auth/logout', {
      method: 'POST',
      body: { refreshToken },
      prefix: 'Logout failed',
      skipAuth: true,
      timeoutMs: 30000,
    }),

  /** POST /api/auth/logout-all — needs auth, revokes every session */
  logoutAll: () =>
    request('/auth/logout-all', { method: 'POST', prefix: 'Logout-all failed', timeoutMs: 30000 }),

  /** GET /api/auth/me — current user + roles + permissions */
  me: () => request('/auth/me', { prefix: 'Failed to fetch profile', timeoutMs: 30000 }),

  /** POST /api/auth/change-password */
  changePassword: (currentPassword, newPassword) =>
    request('/auth/change-password', {
      method: 'POST',
      body: { currentPassword, newPassword },
      prefix: 'Password change failed',
      timeoutMs: 30000,
    }),
};

// ── User management (admin) ──────────────────────────────────────────────
export const usersApi = {
  list:    ()        => request('/users',           { prefix: 'Failed to fetch users', timeoutMs: 30000 }),
  get:     (id)      => request(`/users/${id}`,     { prefix: 'Failed to fetch user', timeoutMs: 30000 }),
  create:  (payload) => request('/users',           { method: 'POST',   body: payload, prefix: 'Failed to create user', timeoutMs: 30000 }),
  update:  (id, p)   => request(`/users/${id}`,     { method: 'PUT',    body: p,       prefix: 'Failed to update user', timeoutMs: 30000 }),
  remove:  (id)      => request(`/users/${id}`,     { method: 'DELETE', prefix: 'Failed to delete user', timeoutMs: 30000 }),

  resetPassword: (id, newPassword) =>
    request(`/users/${id}/reset-password`, {
      method: 'POST', body: { newPassword }, prefix: 'Reset failed', timeoutMs: 30000,
    }),

  lock:   (id) => request(`/users/${id}/lock`,   { method: 'POST', prefix: 'Lock failed', timeoutMs: 30000 }),
  unlock: (id) => request(`/users/${id}/unlock`, { method: 'POST', prefix: 'Unlock failed', timeoutMs: 30000 }),

  /**
   * Grant a role to a user. The role provides the default level/target; pass a
   * `scope` ({ projectId? | locationId? | deviceId? }) to point THIS user's
   * grant at a specific target instead (e.g. the same viewer role on a
   * different project per user). Omit scope to use the role's own default.
   */
  grantRole: (id, roleKey, scope = null) => {
    const s = (typeof scope === 'object' && scope !== null) ? scope : {};
    return request(`/users/${id}/roles`, {
      method: 'POST',
      body: {
        roleKey,
        projectId:  s.projectId  ?? null,
        locationId: s.locationId ?? null,
        deviceId:   s.deviceId   ?? null,
      },
      prefix: 'Failed to grant role',
      timeoutMs: 30000,
    });
  },

  revokeRole: (id, userRoleId) =>
    request(`/users/${id}/roles/${userRoleId}`, {
      method: 'DELETE',
      prefix: 'Failed to revoke role',
      timeoutMs: 30000,
    }),
};

export const rolesApi = {
  list: () => request('/roles', { prefix: 'Failed to fetch roles', timeoutMs: 30000 }),
  create: (payload) => request('/roles', { method: 'POST', body: payload, prefix: 'Failed to create role', timeoutMs: 30000 }),
  update: (id, payload) => request(`/roles/${id}`, { method: 'PUT', body: payload, prefix: 'Failed to update role', timeoutMs: 30000 }),
  remove: (id) => request(`/roles/${id}`, { method: 'DELETE', prefix: 'Failed to delete role', timeoutMs: 30000 }),
  getPermissions: (id) => request(`/roles/${id}/permissions`, { prefix: 'Failed to fetch role permissions', timeoutMs: 30000 }),
  grantPermission: (id, permissionKey) => request(`/roles/${id}/permissions`, { method: 'POST', body: { permissionKey }, prefix: 'Failed to grant permission', timeoutMs: 30000 }),
  revokePermission: (id, permId) => request(`/roles/${id}/permissions/${permId}`, { method: 'DELETE', prefix: 'Failed to revoke permission', timeoutMs: 30000 }),
};

export const permissionsApi = {
  list: () => request('/permissions', { prefix: 'Failed to fetch permissions', timeoutMs: 30000 }),
  create: (permissionKey, description) =>
    request('/permissions', { method: 'POST', body: { permissionKey, description }, prefix: 'Failed to create permission', timeoutMs: 30000 }),
  /** patch = { description?, resource?, action? } */
  update: (id, patch) =>
    request(`/permissions/${id}`, { method: 'PUT', body: patch, prefix: 'Failed to update permission', timeoutMs: 30000 }),
  remove: (id) =>
    request(`/permissions/${id}`, { method: 'DELETE', prefix: 'Failed to delete permission', timeoutMs: 30000 }),

  // Endpoint mappings — what routes a permission protects.
  listEndpoints: (id) =>
    request(`/permissions/${id}/endpoints`, { prefix: 'Failed to fetch endpoints', timeoutMs: 30000 }),
  addEndpoint: (id, httpMethod, pathPattern) =>
    request(`/permissions/${id}/endpoints`, { method: 'POST', body: { httpMethod, pathPattern }, prefix: 'Failed to add endpoint', timeoutMs: 30000 }),
  removeEndpoint: (endpointId) =>
    request(`/permission-endpoints/${endpointId}`, { method: 'DELETE', prefix: 'Failed to remove endpoint', timeoutMs: 30000 }),

  // Element mappings — which granular UI elements (buttons/controls) a
  // permission covers. See config/uiElements.js for the catalog.
  listElements: (id) =>
    request(`/permissions/${id}/elements`, { prefix: 'Failed to fetch elements', timeoutMs: 30000 }),
  addElement: (id, elementId) =>
    request(`/permissions/${id}/elements`, { method: 'POST', body: { elementId }, prefix: 'Failed to add element', timeoutMs: 30000 }),
  removeElement: (id, elementId) =>
    request(`/permissions/${id}/elements/${encodeURIComponent(elementId)}`, { method: 'DELETE', prefix: 'Failed to remove element', timeoutMs: 30000 }),
};

// UI element → permission mappings (which permissions cover each granular UI
// element). Used to gate live controls (e.g. the alarm Mute button).
export const uiElementsApi = {
  list: () => request('/ui-elements', { prefix: 'Failed to fetch UI elements', timeoutMs: 30000 }),
};

// The master catalog of UI elements (grouped by field). Stored in the DB and
// fetched by the Permissions editor. `upsert` persists a typed-in element.
export const uiElementCatalogApi = {
  list: () => request('/ui-element-catalog', { prefix: 'Failed to fetch UI element catalog', timeoutMs: 30000 }),
  upsert: ({ id, field, label }) =>
    request('/ui-element-catalog', {
      method: 'POST', body: { id, field, label },
      prefix: 'Failed to save UI element', timeoutMs: 30000,
    }),
};

// UI feature → permission overrides (which permission reveals a UI feature).
export const uiFeaturesApi = {
  list: () => request('/ui-features', { prefix: 'Failed to fetch UI features', timeoutMs: 30000 }),
  /** permissionKey: a key to require, or null = always visible */
  set: (featureId, permissionKey) =>
    request(`/ui-features/${encodeURIComponent(featureId)}`, {
      method: 'PUT', body: { permissionKey: permissionKey ?? null },
      prefix: 'Failed to save UI feature', timeoutMs: 30000,
    }),
  /** remove the override → fall back to the built-in default */
  reset: (featureId) =>
    request(`/ui-features/${encodeURIComponent(featureId)}`, {
      method: 'DELETE', prefix: 'Failed to reset UI feature', timeoutMs: 30000,
    }),
};

export const auditApi = {
  list: ({ userId, limit } = {}) =>
    request('/audit', { query: { user_id: userId, limit }, prefix: 'Failed to fetch audit log', timeoutMs: 30000 }),
};

export default { authApi, usersApi, rolesApi, permissionsApi, uiFeaturesApi, uiElementsApi, auditApi };
