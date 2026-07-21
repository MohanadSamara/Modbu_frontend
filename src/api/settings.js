// ============================================================================
// settings.js — Device & system settings API.
//
// Backed by the shared `request()` helper in http.js. Public exports
// (`deviceSettingsApi`, `systemSettingsApi`, `defaultSettings`) are unchanged.
// ============================================================================

import { request } from './http';

// ── Device-specific settings ────────────────────────────────────────────
export const deviceSettingsApi = {
  get: (deviceId) =>
    request(`/device-settings/${deviceId}`, { prefix: 'Failed to fetch device settings' }),

  update: (deviceId, settings) =>
    request(`/device-settings/${deviceId}`, {
      method: 'PUT',
      body: { settings },
      prefix: 'Failed to update device settings',
    }),
};

// ── Global / system settings ────────────────────────────────────────────
export const systemSettingsApi = {
  get: () =>
    request('/settings', { prefix: 'Failed to fetch settings' }),

  update: (settings) =>
    request('/settings', {
      method: 'PUT',
      body: { settings },
      prefix: 'Failed to update settings',
    }),
};

// ── Page content overrides (admin visual page editor) ───────────────────
// Backs the <Editable> override store. GET is readable by any authenticated
// user (so design edits render for everyone); PUT requires settings.write.
export const pageContentApi = {
  get: () =>
    request('/page-content', { prefix: 'Failed to fetch page content' }),

  update: (overrides) =>
    request('/page-content', {
      method: 'PUT',
      body: { overrides },
      prefix: 'Failed to save page content',
    }),
};

// ── Default values (used as fallback when the API is unreachable) ───────
export const defaultSettings = {
  // Tank/Fuel Alarm Settings
  LOW_TANK_THRESHOLD: 20,
  CRITICAL_TANK_THRESHOLD: 10,
  CONSUMPTION_RATE_THRESHOLD: 5,
  FUEL_ALERTS_ENABLED: true,
  ALARM_COOLDOWN_MINUTES: 60,

  // Tank Capacity Settings
  TANK_CAPACITY_LITERS: 1000,
  TANK_CAPACITY_UNIT: 'liters', // 'liters' | 'gallons' | 'percentage'
  SHOW_TANK_AS_PERCENTAGE: true,

  // Connection Settings
  DEFAULT_PORT: 502,
  CONNECTION_TIMEOUT: 5000,
  RETRY_ATTEMPTS: 3,
  AUTO_RECONNECT: false,

  // Project/Display Settings
  SHOW_OFFLINE_DEVICES: true,
  DEFAULT_PROJECT_VIEW: 'expanded',
};

export default { deviceSettingsApi, systemSettingsApi, defaultSettings };
