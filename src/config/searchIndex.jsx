// ============================================================================
// searchIndex.jsx — the catalog the Ctrl+K search (CommandPalette) searches.
//
// Two kinds of entries:
//   • kind: 'page'    — navigates to a route.
//   • kind: 'element' — deep-links to a specific control/section on a page. Its
//                       `to` carries a URL hash (and sometimes a ?tab= query);
//                       after navigation, useScrollToHash() scrolls that element
//                       into view and briefly highlights it.
//
// Every entry can be gated so search only offers what the user may actually
// reach (same idea as the sidebar):
//   feature  — UI-feature id, shown only if canFeature(feature)  (pages in nav)
//   perm     — single permission, shown only if hasPermission(perm)
//   anyPerm  — array, shown only if hasAnyPermission(anyPerm)
//
// `keywords` are extra search terms that never render — they let "gps", "tank",
// "start", "threshold"… find the right entry even when the label differs.
// ============================================================================

import { NAV_ITEMS } from './navItems.jsx';

// Generic chevron glyph for entries that don't have their own page icon.
const Glyph = (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 5l7 7-7 7" />
  </svg>
);

// ── Pages already in the sidebar nav — reuse them so search never drifts. ──
const NAV_PAGE_ENTRIES = NAV_ITEMS.map((i) => ({
  kind:    'page',
  to:      i.to,
  label:   i.label,
  labelFor: i.labelFor,
  feature: i.feature,
  section: i.section === 'Administration' ? 'Administration' : 'Pages',
  icon:    i.icon,
  keywords: '',
}));

// ── Routed pages that aren't in the sidebar but are still reachable. ──
const EXTRA_PAGE_ENTRIES = [
  { to: '/connections', label: 'Device Connections', perm: 'device.read', icon: Glyph,
    keywords: 'connect ip port modbus tcp manual socket' },
  { to: '/alarms', label: 'Alarms', perm: 'alarm.read', icon: Glyph,
    keywords: 'alerts fuel critical warning acknowledge accept live' },
  { to: '/fuel', label: 'Fuel Levels', perm: 'device.read', icon: Glyph,
    keywords: 'tank level percent liters gallons gauge average' },
  { to: '/map', label: 'Device Map', perm: 'device.read', icon: Glyph,
    keywords: 'gps location coordinates latitude longitude leaflet position' },
].map((e) => ({ kind: 'page', section: 'Pages', ...e }));

// ── In-page actions & controls (deep-linked to an element id). ──
const ACTION_ENTRIES = [
  // Projects / device detail
  { to: '/projects#generator-controls', label: 'Generator Controls (Start / Stop)', section: 'Actions',
    anyPerm: ['project.read', 'device.read'],
    keywords: 'start stop generator engine run power on off controls command' },
  { to: '/projects#fuel-level', label: 'Fuel Level gauge', section: 'Actions',
    anyPerm: ['project.read', 'device.read'],
    keywords: 'fuel tank level gauge percent liters consumption' },
  { to: '/projects', label: 'Add project / location / device', section: 'Actions',
    anyPerm: ['project.read', 'device.read'],
    keywords: 'add new project location sub-location device create tree' },
  { to: '/projects', label: 'Connect / Disconnect device', section: 'Actions',
    anyPerm: ['project.read', 'device.read'],
    keywords: 'connect disconnect device modbus session link' },
  { to: '/map', label: 'View device on map', section: 'Actions', perm: 'device.read',
    keywords: 'view map gps location coordinates position' },
  // Admin actions
  { to: '/users', label: 'Add user', section: 'Actions', perm: 'user.read',
    keywords: 'add new user create account invite' },
  { to: '/roles', label: 'Add / edit role', section: 'Actions', perm: 'user.assign_role',
    keywords: 'add role permission group rbac access' },
].map((e) => ({ kind: 'element', icon: Glyph, ...e }));

// ── Settings fields (deep-linked to the field, opening the right tab). ──
// `to` carries ?tab= so Settings opens the correct tab, plus #id for the field.
const SETTINGS_ENTRIES = [
  // Fuel & Alarms tab
  { to: '/settings?tab=fuel#set-low-threshold', label: 'Low Tank Warning threshold',
    keywords: 'fuel alarm low warning percent threshold level' },
  { to: '/settings?tab=fuel#set-critical-threshold', label: 'Critical Tank Level threshold',
    keywords: 'fuel alarm critical percent threshold level' },
  { to: '/settings?tab=fuel#set-alarm-cooldown', label: 'Re-alarm Cooldown',
    keywords: 'alarm cooldown snooze re-alarm minutes hours accept' },
  { to: '/settings?tab=fuel#set-tank-capacity', label: 'Tank Capacity',
    keywords: 'tank capacity liters gallons maximum size volume' },
  { to: '/settings?tab=fuel#set-tank-unit', label: 'Display Unit (L / gal / %)',
    keywords: 'unit liters gallons percentage display' },
  { to: '/settings?tab=fuel#set-consumption-threshold', label: 'Consumption Rate Threshold',
    keywords: 'consumption rate threshold burn drain per hour' },
  { to: '/settings?tab=fuel#set-fuel-alerts', label: 'Enable Fuel Alerts',
    keywords: 'fuel alerts enable disable alarm toggle sound' },
  // Connection tab
  { to: '/settings?tab=connection#set-default-port', label: 'Default Port',
    keywords: 'connection port modbus tcp 502' },
  { to: '/settings?tab=connection#set-connection-timeout', label: 'Connection Timeout',
    keywords: 'connection timeout ms milliseconds wait fail' },
  { to: '/settings?tab=connection#set-retry-attempts', label: 'Retry Attempts',
    keywords: 'connection retry attempts reconnect' },
  { to: '/settings?tab=connection#set-auto-reconnect', label: 'Auto-reconnect on disconnect',
    keywords: 'connection auto reconnect toggle' },
  // Display tab
  { to: '/settings?tab=display#set-show-offline', label: 'Show Offline Devices',
    keywords: 'display offline devices show hide toggle' },
  { to: '/settings?tab=display#set-default-view', label: 'Default Project View',
    keywords: 'display project view expanded compact default' },
].map((e) => ({ kind: 'element', section: 'Settings', perm: 'settings.read', icon: Glyph, ...e }));

export const SEARCH_ENTRIES = [
  ...NAV_PAGE_ENTRIES,
  ...EXTRA_PAGE_ENTRIES,
  ...ACTION_ENTRIES,
  ...SETTINGS_ENTRIES,
];
