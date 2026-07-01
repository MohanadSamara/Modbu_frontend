// ============================================================================
// projects.js — Projects / Locations / Devices API client.
//
// Backed by the shared `request()` helper in http.js (auth + 401 refresh).
// Public API (`projectsApi`, `locationsApi`, `devicesApi`) is unchanged.
// ============================================================================

import { request } from './http';

// ── Projects ────────────────────────────────────────────────────────────
export const projectsApi = {
  list: (include) =>
    request('/projects', { query: { include }, prefix: 'Failed to fetch projects' }),

  get: (id, include) =>
    request(`/projects/${id}`, { query: { include }, prefix: 'Failed to fetch project' }),

  create: (payload) =>
    request('/projects', { method: 'POST', body: payload, prefix: 'Failed to create project' }),

  update: (id, payload) =>
    request(`/projects/${id}`, { method: 'PUT', body: payload, prefix: 'Failed to update project' }),

  remove: (id) =>
    request(`/projects/${id}`, { method: 'DELETE', prefix: 'Failed to delete project' }),

  /** Full nested tree (projects → locations → devices) in one call */
  tree: () => request('/project-tree', { prefix: 'Failed to fetch project tree' }),
};

// ── Locations ───────────────────────────────────────────────────────────
export const locationsApi = {
  listByProject: (projectId) =>
    request(`/projects/${projectId}/locations`, { prefix: 'Failed to fetch locations' }),

  get: (id, include) =>
    request(`/locations/${id}`, { query: { include }, prefix: 'Failed to fetch location' }),

  create: (projectId, payload) =>
    request(`/projects/${projectId}/locations`, {
      method: 'POST', body: payload, prefix: 'Failed to create location',
    }),

  update: (id, payload) =>
    request(`/locations/${id}`, { method: 'PUT', body: payload, prefix: 'Failed to update location' }),

  remove: (id) =>
    request(`/locations/${id}`, { method: 'DELETE', prefix: 'Failed to delete location' }),

  getChildren: (id) =>
    request(`/locations/${id}/children`, { prefix: 'Failed to fetch child locations' }),
};

// ── Devices ─────────────────────────────────────────────────────────────
export const devicesApi = {
  listByLocation: (locationId) =>
    request(`/locations/${locationId}/devices`, { prefix: 'Failed to fetch devices' }),

  list: (filters = {}) =>
    request('/devices', { query: filters, prefix: 'Failed to fetch devices' }),

  create: (payload) =>
    request('/devices', { method: 'POST', body: payload, prefix: 'Failed to create device' }),

  update: (id, payload) =>
    request(`/devices/${id}`, { method: 'PUT', body: payload, prefix: 'Failed to update device' }),

  remove: (id) =>
    request(`/devices/${id}`, { method: 'DELETE', prefix: 'Failed to delete device' }),
};

export default { projectsApi, locationsApi, devicesApi };
