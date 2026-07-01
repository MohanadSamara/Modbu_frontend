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
   * Grant a role, optionally scoped. `scope` is { projectId?, locationId?,
   * deviceId? } — pass at most one. A bare number is treated as projectId for
   * backward compatibility.
   */
  grantRole: (id, roleKey, scope = null) => {
    const s = typeof scope === 'object' && scope !== null ? scope : { projectId: scope };
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
};

export const auditApi = {
  list: ({ userId, limit } = {}) =>
    request('/audit', { query: { user_id: userId, limit }, prefix: 'Failed to fetch audit log', timeoutMs: 30000 }),
};

export default { authApi, usersApi, rolesApi, permissionsApi, auditApi };
