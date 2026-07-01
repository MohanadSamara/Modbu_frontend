// ============================================================================
// modbus.js — Modbus device API.
//
// All requests now go through the shared `request()` helper in http.js so
// they automatically carry the Authorization header and benefit from
// transparent token refresh on 401. The exported `modbusApi` shape is
// unchanged so no page or component needs to be updated.
// ============================================================================

import { request } from './http';

export const modbusApi = {
  // ── Device management ──────────────────────────────────────────────────
  getDevices: () =>
    request('/devices', { prefix: 'Failed to fetch devices' }),

  createDevice: (device) =>
    request('/devices', { method: 'POST', body: device, prefix: 'Create failed' }),

  updateDevice: (id, device) =>
    request(`/devices/${id}`, { method: 'PUT', body: device, prefix: 'Update failed' }),

  deleteDevice: (id) =>
    request(`/devices/${id}`, { method: 'DELETE', prefix: 'Delete failed' }).then(() => ({ success: true })),

  getDeviceActions: () =>
    request('/device-actions', { prefix: 'Failed to fetch actions' }),

  // ── Modbus controls ────────────────────────────────────────────────────
  connect: (deviceId, ip = null, port = 502) => {
    const query = {};
    if (deviceId) query.device_id = deviceId;
    if (ip) { query.ip = ip; query.port = port; }
    return request('/modbus/connect', { query, prefix: 'Connect failed' });
  },

  start: () =>
    request('/modbus/start', { timeoutMs: 10000, prefix: 'Start failed' }),

  stop: () =>
    request('/modbus/stop', { timeoutMs: 10000, prefix: 'Stop failed' }),

  getFuel: () =>
    request('/modbus/fuel', { timeoutMs: 10000, prefix: 'Fuel read failed' }),

  disconnect: () =>
    request('/modbus/disconnect', { prefix: 'Disconnect failed' }),

  // ── Other ──────────────────────────────────────────────────────────────
  getRegisters: () =>
    request('/registers', { prefix: 'Failed to fetch registers' }),

  getEvents: () =>
    request('/events', { prefix: 'Failed to fetch events' }),

  getStats: (period = '24h') =>
    request('/stats', { query: { period }, prefix: 'Failed to fetch stats' }),

  /** Returns the current server-side session without forcing a connect */
  getSession: () =>
    request('/modbus/session', { timeoutMs: 5000, prefix: 'Failed to fetch session' }),
};

export default modbusApi;
