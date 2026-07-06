// ============================================================================
// <Can permission="..."> — declarative permission check used to hide UI
// elements (buttons, links, menu items) that the current user can't use.
//
// Examples:
//   <Can permission="device.write">
//     <button onClick={onAdd}>Add device</button>
//   </Can>
//
//   <Can permission="user.read" fallback={<p>Read-only mode</p>}>
//     <UsersTable />
//   </Can>
//
//   // passes if the user has EITHER key (granular or legacy):
//   <Can anyPermission={['device.start', 'device.control']}>
//     <StartButton />
//   </Can>
// ============================================================================

import { useAuth } from '../context/useAuth.js';

export default function Can({ permission, anyPermission, feature, element, projectId = null, role, children, fallback = null }) {
  const { hasPermission, hasAnyPermission, hasRole, canFeature, canUseElement } = useAuth();

  if (role && !hasRole(role)) return fallback;
  // `feature` gates by a UI-feature id (config/uiFeatures.js), so an admin can
  // change which permission controls it from the UI Access page.
  if (feature && !canFeature(feature, projectId)) return fallback;
  // `element` gates by a granular UI element id (config/uiElements.js): the
  // element is usable only if the user holds a covering write-level permission
  // configured on the Permissions page.
  if (element && !canUseElement(element, projectId)) return fallback;
  if (permission && !hasPermission(permission, projectId)) return fallback;
  if (anyPermission && !hasAnyPermission(anyPermission, projectId)) return fallback;

  return children;
}
