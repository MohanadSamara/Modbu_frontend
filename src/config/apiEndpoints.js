// ============================================================================
// apiEndpoints.js — catalog of the backend's API routes, shown as a checklist
// when mapping a permission to the fields/routes it protects.
//
// `resource` lets the UI surface the routes most related to a permission
// (e.g. an 'alarm.*' permission highlights the alarm/events routes).
// ============================================================================

export const API_ENDPOINTS = [
  // Devices
  { group: 'Devices',   resource: 'device',   method: 'GET',    path: '/api/devices',                        label: 'List devices' },
  { group: 'Devices',   resource: 'device',   method: 'GET',    path: '/api/locations/:locationId/devices',  label: 'List devices in a location' },
  { group: 'Devices',   resource: 'device',   method: 'POST',   path: '/api/devices',                        label: 'Create device' },
  { group: 'Devices',   resource: 'device',   method: 'PUT',    path: '/api/devices/:id',                    label: 'Update device' },
  { group: 'Devices',   resource: 'device',   method: 'DELETE', path: '/api/devices/:id',                    label: 'Delete device' },

  // Modbus session / live
  { group: 'Modbus',    resource: 'device',   method: 'GET',    path: '/api/modbus/connect',                 label: 'Connect' },
  { group: 'Modbus',    resource: 'device',   method: 'GET',    path: '/api/modbus/disconnect',              label: 'Disconnect' },
  { group: 'Modbus',    resource: 'device',   method: 'GET',    path: '/api/modbus/session',                 label: 'Session status' },
  { group: 'Modbus',    resource: 'device',   method: 'GET',    path: '/api/registers',                      label: 'Read registers' },
  { group: 'Modbus',    resource: 'fuel',     method: 'GET',    path: '/api/modbus/fuel',                     label: 'Fuel reading' },
  { group: 'Modbus',    resource: 'fuel',     method: 'GET',    path: '/api/consumption-rate/:deviceId',     label: 'Consumption rate' },

  // Monitoring
  { group: 'Monitoring',resource: 'device',   method: 'GET',    path: '/api/stats',                          label: 'Stats' },
  { group: 'Monitoring',resource: 'alarm',    method: 'GET',    path: '/api/events',                         label: 'Events log' },
  { group: 'Monitoring',resource: 'alarm',    method: 'GET',    path: '/api/alarms',                         label: 'Alarms' },
  { group: 'Monitoring',resource: 'alarm',    method: 'GET',    path: '/api/device-actions',                 label: 'Device actions log' },

  // Projects
  { group: 'Projects',  resource: 'project',  method: 'GET',    path: '/api/projects/:id',                   label: 'View project' },
  { group: 'Projects',  resource: 'project',  method: 'GET',    path: '/api/project-tree',                   label: 'Project tree' },
  { group: 'Projects',  resource: 'project',  method: 'POST',   path: '/api/projects',                       label: 'Create project' },
  { group: 'Projects',  resource: 'project',  method: 'PUT',    path: '/api/projects/:id',                   label: 'Update project' },
  { group: 'Projects',  resource: 'project',  method: 'DELETE', path: '/api/projects/:id',                   label: 'Delete project' },

  // Locations
  { group: 'Locations', resource: 'location', method: 'GET',    path: '/api/locations/:id',                  label: 'View location' },
  { group: 'Locations', resource: 'location', method: 'GET',    path: '/api/locations/:id/children',         label: 'Location children' },
  { group: 'Locations', resource: 'location', method: 'POST',   path: '/api/projects/:projectId/locations',  label: 'Create location' },
  { group: 'Locations', resource: 'location', method: 'PUT',    path: '/api/locations/:id',                  label: 'Update location' },
  { group: 'Locations', resource: 'location', method: 'DELETE', path: '/api/locations/:id',                  label: 'Delete location' },

  // Settings
  { group: 'Settings',  resource: 'settings', method: 'GET',    path: '/api/settings',                       label: 'View settings' },
  { group: 'Settings',  resource: 'settings', method: 'PUT',    path: '/api/settings',                       label: 'Update settings' },
];

export const endpointKey = (method, path) => `${String(method).toUpperCase()} ${path}`;
