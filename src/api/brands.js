// ============================================================================
// brands.js — Brands API client.
//
// Backed by the shared `request()` helper in http.js (auth + 401 refresh).
// A brand is just { id, name }. Devices reference a brand via brand_id.
// ============================================================================

import { request } from './http';

// A brand whose live data comes from a cloud portal (Datakom Rainbow) instead of
// Modbus/IP. Matches both the real spelling "Datakom" and the common "Datacom"
// variant, so choosing either brand yields the cloud method (not IP). This is the
// single source of truth for "is this the cloud brand?" across the Projects UI.
export function isCloudBrand(name) {
  return /data[ck]om/i.test(String(name ?? ''));
}

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
