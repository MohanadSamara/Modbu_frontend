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
// ============================================================================

import { useAuth } from '../context/useAuth.js';

export default function Can({ permission, projectId = null, role, children, fallback = null }) {
  const { hasPermission, hasRole } = useAuth();

  if (role && !hasRole(role)) return fallback;
  if (permission && !hasPermission(permission, projectId)) return fallback;

  return children;
}
