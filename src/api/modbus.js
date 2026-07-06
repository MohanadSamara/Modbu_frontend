// ============================================================================
// modbus.js — Modbus device API.
//
// All requests now go through the shared `request()` helper in http.js so
// they automatically carry the Authorization header and benefit from
// transparent token refresh on 401. The exported `modbusApi` shape is
// unchanged so no page or component needs to be updated.
// ============================================================================

import { request } from './http';

// Normalize a device target into query params. Accepts a numeric/string device
// id, or an object { deviceId | id, ip, port }.
function modbusTarget(target) {
  if (target == null) return {};
  if (typeof target !== 'object') return { device_id: target };
  const q = {};
  const id = target.deviceId ?? target.id ?? null;
  if (id != null) q.device_id = id;
  if (target.ip) { q.ip = target.ip; q.port = target.port ?? 502; }
  return q;
}

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

  // Every control/read is addressed to a specific device so it hits the right
  // connection when multiple users/devices are active. Pass the device's
  // backend id (or { ip, port } for a manual connection).
  start: (target = {}) =>
    request('/modbus/start', { query: modbusTarget(target), timeoutMs: 10000, prefix: 'Start failed' }),

  stop: (target = {}) =>
    request('/modbus/stop', { query: modbusTarget(target), timeoutMs: 10000, prefix: 'Stop failed' }),

  getFuel: (target = {}) =>
    request('/modbus/fuel', { query: modbusTarget(target), timeoutMs: 10000, prefix: 'Fuel read failed' }),

  // Live GPS position (regs 10594/10596/10598). Persists to the device row.
  getGps: (target = {}) =>
    request('/modbus/gps', { query: modbusTarget(target), timeoutMs: 10000, prefix: 'GPS read failed' }),

  disconnect: (target = {}) =>
    request('/modbus/disconnect', { query: modbusTarget(target), prefix: 'Disconnect failed' }),

  // ── Other ──────────────────────────────────────────────────────────────
  getRegisters: () =>
    request('/registers', { prefix: 'Failed to fetch registers' }),

  getEvents: () =>
    request('/events', { prefix: 'Failed to fetch events' }),

  // Recent alarms (device_actions where action_type LIKE 'ALARM_%').
  // Each row: { id, deviceId, type, time, severity: 'critical' | 'warning' }.
  getAlarms: (limit = 50) =>
    request('/alarms', { query: { limit }, prefix: 'Failed to fetch alarms' }),

  // Fuel consumption rate for one device over the last `windowMinutes`.
  // Returns { deviceId, ratePerHour, ... } or { deviceId, ratePerHour: null }.
  getConsumptionRate: (deviceId, windowMinutes = 60) =>
    request(`/consumption-rate/${deviceId}`, {
      query: { window: windowMinutes },
      prefix: 'Failed to fetch consumption rate',
    }),

  getStats: (period = '24h') =>
    request('/stats', { query: { period }, prefix: 'Failed to fetch stats' }),

  /** Returns the current server-side session without forcing a connect */
  getSession: () =>
    request('/modbus/session', { timeoutMs: 5000, prefix: 'Failed to fetch session' }),
};

export default modbusApi;
