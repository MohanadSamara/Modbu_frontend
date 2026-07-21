// ============================================================================
// uiElements.js — catalog of granular UI elements, grouped by FIELD (resource).
//
// A "field" is a resource area a permission works on (alarm, device, project,
// settings, user, audit). Each field owns a set of ELEMENTS — the concrete
// buttons / controls a user interacts with (e.g. the alarm field owns the Mute
// button). On the Permissions page, editing a permission lets an admin open a
// field and tick the elements that permission COVERS.
//
// What "covers" means is decided by the permission's own access level:
//   • a read-level permission that covers an element  → the element is visible
//     but NOT usable (view only)
//   • any other level (write, control, …) that covers → the element is usable
//
// Each element:
//   • id     — stable key, checked at runtime via <Can element="…"> / canUseElement
//   • field  — the resource/field it belongs to (used to group in the editor)
//   • label  — human name shown in the popup
// ============================================================================

// ── Permission implications ─────────────────────────────────────────────────
// A stronger permission automatically includes the weaker ones it needs to be
// usable (write implies read, device actions imply seeing devices, …).
// MUST stay in sync with the backend copy in Modbus/rbac-defaults.js — the
// backend enforces the same expansion, this copy only keeps the UI honest.
export const PERMISSION_IMPLICATIONS = {
  'device.write':     ['device.read'],
  'device.connect':   ['device.read'],
  'device.control':   ['device.read', 'fuel.read'],
  'device.start':     ['device.read'],
  'device.stop':      ['device.read'],
  'project.write':    ['project.read'],
  'location.write':   ['location.read'],
  'settings.write':   ['settings.read'],
  'user.write':       ['user.read'],
  'user.assign_role': ['user.read'],
  'datakom.write':    ['datakom.read', 'device.read'],
};

// All permission keys that satisfy a check for `key` (itself + stronger keys).
export function keysSatisfying(key) {
  const out = [key];
  for (const [strong, implied] of Object.entries(PERMISSION_IMPLICATIONS)) {
    if (implied.includes(key)) out.push(strong);
  }
  return out;
}

export const UI_ELEMENTS = [
  // ── Alarm ────────────────────────────────────────────────────────────────
  { id: 'alarm.mute',        field: 'alarm',    label: 'Mute alarm sound button' },
  { id: 'alarm.acknowledge', field: 'alarm',    label: 'Acknowledge alarm' },
  { id: 'alarm.reset',       field: 'alarm',    label: 'Reset / clear active alarm' },
  { id: 'alarm.view_events', field: 'alarm',    label: 'View events / alarms log' },

  // ── Device ───────────────────────────────────────────────────────────────
  { id: 'device.connect',    field: 'device',   label: 'Connect / Disconnect button' },
  { id: 'device.start_stop', field: 'device',   label: 'Start / Stop controls' },
  { id: 'device.add',        field: 'device',   label: 'Add device button' },
  { id: 'device.edit',       field: 'device',   label: 'Edit device configuration' },
  { id: 'device.delete',     field: 'device',   label: 'Delete device button' },

  // ── Project ──────────────────────────────────────────────────────────────
  { id: 'project.create',    field: 'project',  label: 'Create project / location' },
  { id: 'project.rename',    field: 'project',  label: 'Rename project / location' },
  { id: 'project.delete',    field: 'project',  label: 'Delete project / location' },

  // ── Settings ─────────────────────────────────────────────────────────────
  { id: 'settings.edit',     field: 'settings', label: 'Edit settings button' },
  { id: 'settings.reset',    field: 'settings', label: 'Reset settings to default' },

  // ── User administration ──────────────────────────────────────────────────
  { id: 'user.create',        field: 'user',    label: 'Create user button' },
  { id: 'user.edit',          field: 'user',    label: 'Edit user details' },
  { id: 'user.lock',          field: 'user',    label: 'Lock / unlock user' },
  { id: 'user.reset_password', field: 'user',   label: 'Reset user password' },
  { id: 'user.assign_role',   field: 'user',    label: 'Assign role button' },
  { id: 'user.delete',        field: 'user',    label: 'Delete user' },

  // ── Audit ────────────────────────────────────────────────────────────────
  { id: 'audit.view',        field: 'audit',    label: 'View audit log' },
  { id: 'audit.export',      field: 'audit',    label: 'Export audit log' },

  // ── Datakom Rainbow ──────────────────────────────────────────────────────
  { id: 'datakom.read',      field: 'datakom',  label: 'Live — Datakom Rainbow view' },
  { id: 'datakom.link',      field: 'datakom',  label: 'Link device to Datakom Rainbow' },
  { id: 'datakom.unlink',    field: 'datakom',  label: 'Unlink Datakom device' },
];

// The list of fields, in display order (derived from the catalog).
export const UI_ELEMENT_FIELDS = [...new Set(UI_ELEMENTS.map((e) => e.field))];

// Elements belonging to a given field.
export function elementsForField(field) {
  return UI_ELEMENTS.filter((e) => e.field === field);
}

// Fast lookup of one element by id.
const _byId = Object.fromEntries(UI_ELEMENTS.map((e) => [e.id, e]));
export function uiElementById(id) {
  return _byId[id] || null;
}
