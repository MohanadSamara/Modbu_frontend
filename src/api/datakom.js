// ============================================================================
// datakom.js — Datakom Rainbow (read-only cloud data source) API client.
//
// Datakom devices aren't read over Modbus; their live values come from Datakom's
// Rainbow SCADA portal over a WebSocket that the BACKEND maintains. These routes
// surface that adapter's cached status + readings. All read-only.
// Backed by the shared `request()` helper in http.js (auth + 401 refresh).
// ============================================================================

import { request } from './http';

export const datakomApi = {
  // Connection/session diagnostics — always 200 (even when not connected yet).
  status: () =>
    request('/brands/datakom/status', { prefix: 'Failed to fetch Datakom status' }),

  // Devices the portal exposes, each with its latest reading. 503 until connected.
  devices: () =>
    request('/brands/datakom/devices', { prefix: 'Failed to fetch Datakom devices' }),

  // One device by Datakom device id (did) or name/sid.
  device: (idOrName) =>
    request(`/brands/datakom/device/${encodeURIComponent(idOrName)}`, { prefix: 'Failed to fetch Datakom device' }),

  // The Datakom node hierarchy (nodes → devices), nested — a read-only project
  // tree. 503 until the adapter is connected.
  tree: () =>
    request('/brands/datakom/tree', { prefix: 'Failed to fetch Datakom tree' }),

  // ── Node name overrides ─────────────────────────────────────────────────
  // Custom display names for cloud nodes, stored locally (the cloud is never
  // changed). nodeNames() → { [nodeId]: customName }. setNodeName with an empty
  // name clears the override (reverts to the portal name). Write = datakom.write.
  nodeNames: () =>
    request('/brands/datakom/node-names', { prefix: 'Failed to fetch node names' }),
  setNodeName: (nodeId, name) =>
    request(`/brands/datakom/node-names/${encodeURIComponent(nodeId)}`, {
      method: 'PUT', body: { name: name ?? '' },
      prefix: 'Failed to save node name',
    }),

  // ── Node containers (local grouping folders) ────────────────────────────
  // nodeContainers() → { [nodeId]: containerName }. setNodeContainer with an
  // empty name clears it (node returns to top level). Write = datakom.write.
  nodeContainers: () =>
    request('/brands/datakom/node-containers', { prefix: 'Failed to fetch node containers' }),
  setNodeContainer: (nodeId, container) =>
    request(`/brands/datakom/node-containers/${encodeURIComponent(nodeId)}`, {
      method: 'PUT', body: { container: container ?? '' },
      prefix: 'Failed to save container',
    }),

  // ── Adapter runtime control (Datakom connection page) ───────────────────
  // Start/stop the backend's cloud WebSocket connection at runtime. The
  // enabled flag persists across restarts (system_settings). datakom.write.
  adapterStart: () =>
    request('/brands/datakom/adapter/start', { method: 'POST', timeoutMs: 15000, prefix: 'Failed to start Datakom connection' }),
  adapterStop: () =>
    request('/brands/datakom/adapter/stop', { method: 'POST', timeoutMs: 15000, prefix: 'Failed to stop Datakom connection' }),
  adapterRestart: () =>
    request('/brands/datakom/adapter/restart', { method: 'POST', timeoutMs: 15000, prefix: 'Failed to restart Datakom connection' }),

  // ── Cloud→DB sync ───────────────────────────────────────────────────────
  // Import the cloud tree as editable projects/locations/devices rows.
  sync: () =>
    request('/brands/datakom/sync', { method: 'POST', timeoutMs: 60000, prefix: 'Datakom sync failed' }),
  syncStatus: () =>
    request('/brands/datakom/sync/status', { prefix: 'Failed to fetch sync status' }),

  // ── Cloud control (SCAFFOLD) ────────────────────────────────────────────
  // Remote start/stop over Datakom's cloud. Wired end-to-end but the backend
  // stays inert (HTTP 501, code CONTROL_NOT_CONFIGURED) until the Rainbow
  // command frame is captured and configured in datakom-rainbow.js.
  //   did      — Datakom device id
  //   deviceId — optional platform device id, logged for Run History
  start: (did, deviceId) =>
    request(`/brands/datakom/device/${encodeURIComponent(did)}/start`, {
      method: 'POST',
      query: deviceId != null ? { device_id: deviceId } : undefined,
      timeoutMs: 10000,
      prefix: 'Datakom start failed',
    }),

  stop: (did, deviceId) =>
    request(`/brands/datakom/device/${encodeURIComponent(did)}/stop`, {
      method: 'POST',
      query: deviceId != null ? { device_id: deviceId } : undefined,
      timeoutMs: 10000,
      prefix: 'Datakom stop failed',
    }),
};

export default datakomApi;
