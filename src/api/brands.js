// ============================================================================
// brands.js — Brands API client.
//
// Backed by the shared `request()` helper in http.js (auth + 401 refresh).
// A brand is just { id, name }. Devices reference a brand via brand_id.
// ============================================================================

import { request } from './http';

export const brandsApi = {
  list: () =>
    request('/brands', { prefix: 'Failed to fetch brands' }),

  create: (name) =>
    request('/brands', { method: 'POST', body: { name }, prefix: 'Failed to create brand' }),

  update: (id, name) =>
    request(`/brands/${id}`, { method: 'PUT', body: { name }, prefix: 'Failed to update brand' }),

  remove: (id) =>
    request(`/brands/${id}`, { method: 'DELETE', prefix: 'Failed to delete brand' }),
};

export default brandsApi;
