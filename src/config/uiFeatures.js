// ============================================================================
// uiFeatures.js — catalog of UI features whose visibility an admin can control.
//
// Each feature has a stable `id`, a human `label`, a `group` (for the editor),
// and a `defaultPermission` — the permission that reveals it out of the box.
// An admin can override which permission controls a feature (or make it always
// visible) on the UI Access page; the override is stored in the database and
// merged over these defaults at runtime.
//
// defaultPermission may be:
//   • a string  → require that permission
//   • an array  → require ANY of them (e.g. Projects link: project.read OR device.read)
//   • null      → always visible
// ============================================================================

export const UI_FEATURES = [
  // Navigation
  { id: 'nav.projects',    label: 'Projects / Devices link', group: 'Navigation',     defaultPermission: ['project.read', 'device.read'] },
  { id: 'nav.fuel',        label: 'Fuel Levels link',        group: 'Navigation',     defaultPermission: 'fuel.read' },
  { id: 'nav.brands',      label: 'Brands link',             group: 'Navigation',     defaultPermission: 'device.read' },
  { id: 'nav.events',      label: 'Events link',             group: 'Navigation',     defaultPermission: 'alarm.read' },
  { id: 'nav.settings',    label: 'Settings link',           group: 'Navigation',     defaultPermission: 'settings.read' },
  { id: 'nav.datakom',     label: 'Datakom Cloud link',      group: 'Navigation',     defaultPermission: 'datakom.read' },

  // Administration
  { id: 'nav.users',       label: 'Users link',              group: 'Administration', defaultPermission: 'user.read' },
  { id: 'nav.audit',       label: 'Audit log link',          group: 'Administration', defaultPermission: 'audit.read' },
  { id: 'nav.roles',       label: 'Roles link',              group: 'Administration', defaultPermission: 'user.assign_role' },
  { id: 'nav.permissions', label: 'Permissions link',        group: 'Administration', defaultPermission: 'user.assign_role' },

  // Device controls (buttons)
  { id: 'button.device.connect', label: 'Connect / Disconnect button', group: 'Device controls', defaultPermission: 'device.connect' },
  { id: 'button.device.control', label: 'Start / Stop controls',       group: 'Device controls', defaultPermission: ['device.control', 'device.start', 'device.stop'] },
  { id: 'button.project.write',  label: 'Create / delete project & location', group: 'Device controls', defaultPermission: 'project.write' },
  { id: 'button.device.write',   label: 'Add / delete device',         group: 'Device controls', defaultPermission: 'device.write' },
];

// Fast lookup of a feature's default permission.
const _byId = Object.fromEntries(UI_FEATURES.map((f) => [f.id, f]));
export function defaultPermissionFor(featureId) {
  return _byId[featureId] ? _byId[featureId].defaultPermission : null;
}
