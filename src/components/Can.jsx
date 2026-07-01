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

export default function Can({ permission, anyPermission, projectId = null, role, children, fallback = null }) {
  const { hasPermission, hasAnyPermission, hasRole } = useAuth();

  if (role && !hasRole(role)) return fallback;
  if (permission && !hasPermission(permission, projectId)) return fallback;
  if (anyPermission && !hasAnyPermission(anyPermission, projectId)) return fallback;

  return children;
}
