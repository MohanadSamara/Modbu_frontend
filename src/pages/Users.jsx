// ============================================================================
// Users page — admin-only user & access-control management.
//
//   • Lists every user with status, roles, last-login.
//   • Create new users (admin picks initial role).
//   • Edit basic profile (email, full name, status).
//   • Lock / unlock accounts (forces logout of every session).
//   • Reset a user's password (forces logout).
//   • Grant / revoke roles per user, optionally scoped to a project.
//   • Delete users.
//
// Uses the existing /api/users + /api/roles + /api/projects endpoints.
// ============================================================================

import { useEffect, useState, useCallback } from 'react';
import { usersApi, rolesApi } from '../api/auth';
import { projectsApi, locationsApi, devicesApi } from '../api/projects';
import { useAuth } from '../context/useAuth.js';
import Can from '../components/Can.jsx';

const STATUS_PILL = {
  active:   'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  disabled: 'bg-gray-500/10 text-gray-400 border-gray-500/30',
  locked:   'bg-red-500/10 text-red-400 border-red-500/30',
};

export default function Users() {
  const { user: currentUser } = useAuth();

  const [users, setUsers]       = useState([]);
  const [roles, setRoles]       = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);

  const [showCreate, setShowCreate]   = useState(false);
  const [editingUser, setEditingUser] = useState(null); // detailed user incl. roles

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const [u, r, p] = await Promise.all([
        usersApi.list(),
        rolesApi.list(),
        projectsApi.list().catch(() => []), // optional — projects.read might be missing
      ]);
      setUsers(u);
      setRoles(r);
      setProjects(p);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // ── Action helpers ──────────────────────────────────────────────────────
  async function handleLock(u)   {
    if (!confirm(`Lock (disable) ${u.username}? They'll be logged out everywhere.`)) return;
    try { await usersApi.lock(u.id);   refresh(); } catch (e) { alert(e.message); }
  }
  async function handleUnlock(u) {
    try { await usersApi.unlock(u.id); refresh(); } catch (e) { alert(e.message); }
  }
  async function handleDelete(u) {
    if (u.id === currentUser.id) { alert("You can't delete your own account."); return; }
    if (!confirm(`Permanently delete user "${u.username}"? This cannot be undone.`)) return;
    try { await usersApi.remove(u.id); refresh(); } catch (e) { alert(e.message); }
  }
  async function handleReset(u) {
    const newPassword = prompt(`New password for ${u.username} (>=8 chars):`);
    if (!newPassword || newPassword.length < 8) return;
    try {
      await usersApi.resetPassword(u.id, newPassword);
      alert(`Password reset. ${u.username} has been logged out everywhere.`);
    } catch (e) { alert(e.message); }
  }

  // ── Render ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-400">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-white text-xl font-semibold">Users & Access Control</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            Manage who can sign in and what they can do.
          </p>
        </div>
        <Can permission="user.write">
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-lg transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New user
          </button>
        </Can>
      </div>

      {error && (
        <div className="px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* User table */}
      <div className="bg-[#13151c] border border-white/5 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-white/[0.02] text-gray-500 text-xs uppercase tracking-wider">
              <tr>
                <th className="text-left px-5 py-3 font-medium">User</th>
                <th className="text-left px-5 py-3 font-medium">Status</th>
                <th className="text-left px-5 py-3 font-medium">Roles</th>
                <th className="text-left px-5 py-3 font-medium">Last login</th>
                <th className="text-right px-5 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {users.length === 0 && (
                <tr><td colSpan={5} className="text-center py-8 text-gray-500">No users yet.</td></tr>
              )}
              {users.map((u) => (
                <UserRow
                  key={u.id}
                  u={u}
                  isMe={u.id === currentUser.id}
                  onView={async () => {
                    try { setEditingUser(await usersApi.get(u.id)); }
                    catch (e) { alert(e.message); }
                  }}
                  onLock={() => handleLock(u)}
                  onUnlock={() => handleUnlock(u)}
                  onReset={() => handleReset(u)}
                  onDelete={() => handleDelete(u)}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create modal */}
      {showCreate && (
        <CreateUserModal
          roles={roles}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); refresh(); }}
        />
      )}

      {/* Edit / roles modal */}
      {editingUser && (
        <EditUserModal
          user={editingUser}
          roles={roles}
          projects={projects}
          onClose={() => setEditingUser(null)}
          onChange={async () => {
            // Reload both the table and the modal's user
            try {
              const [list, fresh] = await Promise.all([
                usersApi.list(),
                usersApi.get(editingUser.id),
              ]);
              setUsers(list);
              setEditingUser(fresh);
            } catch (e) { alert(e.message); }
          }}
        />
      )}
    </div>
  );
}

// ── Row ───────────────────────────────────────────────────────────────────
function UserRow({ u, isMe, onView, onLock, onUnlock, onReset, onDelete }) {
  const initials = (() => {
    const src = u.fullName || u.username || '';
    const parts = src.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return (parts[0] || '?').slice(0, 2).toUpperCase();
  })();

  return (
    <tr className="hover:bg-white/[0.02] transition-colors">
      <td className="px-5 py-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center text-white text-xs font-bold">
            {initials}
          </div>
          <div className="min-w-0">
            <div className="text-white font-medium truncate flex items-center gap-2">
              {u.fullName || u.username}
              {isMe && <span className="text-[10px] uppercase tracking-wider text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded">You</span>}
            </div>
            <div className="text-gray-500 text-xs truncate">{u.email}</div>
          </div>
        </div>
      </td>
      <td className="px-5 py-3">
        <span className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[11px] font-medium ${STATUS_PILL[u.status] || STATUS_PILL.disabled}`}>
          {u.status}
        </span>
      </td>
      <td className="px-5 py-3">
        <button onClick={onView} className="text-blue-400 hover:text-blue-300 text-xs font-medium">
          Manage roles →
        </button>
      </td>
      <td className="px-5 py-3 text-gray-400 text-xs">
        {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : '—'}
      </td>
      <td className="px-5 py-3 text-right">
        <div className="inline-flex items-center gap-1">
          <Can permission="user.write">
            <button onClick={onReset} title="Reset password"
              className="p-1.5 rounded-md text-gray-400 hover:text-white hover:bg-white/5">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
            </button>
            {u.status === 'active'
              ? <button onClick={onLock} disabled={isMe} title={isMe ? "Can't lock yourself" : 'Disable'}
                  className="p-1.5 rounded-md text-gray-400 hover:text-amber-400 hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </button>
              : <button onClick={onUnlock} title="Re-enable"
                  className="p-1.5 rounded-md text-gray-400 hover:text-emerald-400 hover:bg-white/5">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
                  </svg>
                </button>}
            <button onClick={onDelete} disabled={isMe} title={isMe ? "Can't delete yourself" : 'Delete'}
              className="p-1.5 rounded-md text-gray-400 hover:text-red-400 hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a2 2 0 012-2h2a2 2 0 012 2v3" />
              </svg>
            </button>
          </Can>
        </div>
      </td>
    </tr>
  );
}

// ── Create modal ──────────────────────────────────────────────────────────
function CreateUserModal({ roles, onClose, onCreated }) {
  const [form, setForm] = useState({
    username: '', email: '', password: '', fullName: '', roleKey: 'viewer',
  });
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setErr(null);
    setSubmitting(true);
    try {
      await usersApi.create(form);
      onCreated();
    } catch (e) {
      setErr(e.detail || e.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title="Create user" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Username" required>
          <input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })}
            disabled={submitting} className={inputCls} placeholder="alice" autoFocus />
        </Field>
        <Field label="Email" required>
          <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
            disabled={submitting} className={inputCls} placeholder="alice@acme.com" />
        </Field>
        <Field label="Full name">
          <input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })}
            disabled={submitting} className={inputCls} placeholder="Alice Smith" />
        </Field>
        <Field label="Initial password (>=8 chars)" required>
          <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
            disabled={submitting} className={inputCls} />
        </Field>
        <Field label="Initial role">
          <select value={form.roleKey} onChange={(e) => setForm({ ...form, roleKey: e.target.value })}
            disabled={submitting} className={inputCls}>
            {roles.map((r) => (
              <option key={r.key} value={r.key}>{r.name} ({r.key})</option>
            ))}
          </select>
        </Field>

        {err && <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-xs">{err}</div>}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} disabled={submitting}
            className="px-4 py-2 text-sm text-gray-300 hover:text-white">Cancel</button>
          <button type="submit" disabled={submitting}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-700/40 text-white text-sm font-semibold rounded-lg">
            {submitting ? 'Creating…' : 'Create user'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ── Edit / roles modal ────────────────────────────────────────────────────
function EditUserModal({ user, roles, projects, onClose, onChange }) {
  const [form, setForm] = useState({
    email:    user.email   || '',
    fullName: user.fullName || '',
    status:   user.status   || 'active',
  });
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileErr, setProfileErr] = useState(null);

  // Role grant form. The role provides the DEFAULT level + target, but the same
  // role can be granted to different users on different targets — so the admin
  // can adjust the target for this specific user before granting.
  const [grantRoleKey, setGrantRoleKey] = useState(roles[0]?.key || '');
  const [grantingRole, setGrantingRole] = useState(false);

  const selectedRole = roles.find((r) => r.key === grantRoleKey);

  // Scope for THIS grant, seeded from the role's own level/target.
  const [scopeType,       setScopeType]       = useState('global');
  const [scopeProjectId,  setScopeProjectId]  = useState('');
  const [scopeLocationId, setScopeLocationId] = useState('');
  const [scopeDeviceId,   setScopeDeviceId]   = useState('');
  const [locations, setLocations] = useState([]);
  const [devices,   setDevices]   = useState([]);

  // One distinct ROLE per user, but that role may be assigned to several
  // targets — up to the role's scope_count (e.g. a 2-device role → 2 devices).
  const assignments = user.roles || [];
  const hasRole = assignments.length > 0;
  const currentRoleKey = assignments[0]?.key || null;
  const currentRole = roles.find((r) => r.key === currentRoleKey) || null;
  const maxTargets = currentRole?.scopeLevel && currentRole.scopeLevel !== 'global'
    ? (currentRole.scopeCount || 1)
    : 1;
  const canAddMore = hasRole
    && (currentRole?.scopeLevel && currentRole.scopeLevel !== 'global')
    && assignments.length < maxTargets;

  const [editingUserRoleId, setEditingUserRoleId] = useState(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [addingTarget, setAddingTarget] = useState(false);

  // When the chosen role changes, reset the scope to that role's defaults.
  useEffect(() => {
    if (!selectedRole) return;
    setScopeType(selectedRole.scopeLevel || 'global');
    setScopeProjectId(selectedRole.scopeProjectId ? String(selectedRole.scopeProjectId) : '');
    setScopeLocationId(selectedRole.scopeLocationId ? String(selectedRole.scopeLocationId) : '');
    setScopeDeviceId(selectedRole.scopeDeviceId ? String(selectedRole.scopeDeviceId) : '');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grantRoleKey]);

  // Load locations when a project is chosen (for location/device levels).
  useEffect(() => {
    if ((scopeType !== 'location' && scopeType !== 'device') || !scopeProjectId) { setLocations([]); return; }
    let alive = true;
    locationsApi.listByProject(scopeProjectId)
      .then((tree) => { if (alive) setLocations(flattenLocations(tree)); })
      .catch(() => { if (alive) setLocations([]); });
    return () => { alive = false; };
  }, [scopeType, scopeProjectId]);

  // Load devices when a location is chosen (for device level).
  useEffect(() => {
    if (scopeType !== 'device' || !scopeLocationId) { setDevices([]); return; }
    let alive = true;
    devicesApi.listByLocation(scopeLocationId)
      .then((rows) => { if (alive) setDevices(rows || []); })
      .catch(() => { if (alive) setDevices([]); });
    return () => { alive = false; };
  }, [scopeType, scopeLocationId]);

  async function saveProfile() {
    setProfileErr(null);
    setSavingProfile(true);
    try {
      await usersApi.update(user.id, form);
      await onChange();
    } catch (e) { setProfileErr(e.detail || e.message); }
    finally { setSavingProfile(false); }
  }

  // Build the { projectId | locationId | deviceId } scope from the current
  // selectors, validating that a target is picked for non-global levels.
  function buildScope() {
    if (scopeType === 'project') {
      if (!scopeProjectId)  { alert('Pick a project for this user.');  return undefined; }
      return { projectId: Number(scopeProjectId) };
    }
    if (scopeType === 'location') {
      if (!scopeLocationId) { alert('Pick a location for this user.'); return undefined; }
      return { locationId: Number(scopeLocationId) };
    }
    if (scopeType === 'device') {
      if (!scopeDeviceId)   { alert('Pick a device for this user.');   return undefined; }
      return { deviceId: Number(scopeDeviceId) };
    }
    return null; // global
  }

  // Effective level of an existing assignment, inferred from its target.
  function levelOfAssignment(r) {
    if (r.deviceId)   return 'device';
    if (r.locationId) return 'location';
    if (r.projectId)  return 'project';
    return 'global';
  }

  function startEditAssignment(r) {
    setAddingTarget(false);
    setEditingUserRoleId(r.userRoleId);
    setScopeType(levelOfAssignment(r));
    setScopeProjectId(r.projectId ? String(r.projectId) : '');
    setScopeLocationId(r.locationId ? String(r.locationId) : '');
    setScopeDeviceId(r.deviceId ? String(r.deviceId) : '');
  }

  function cancelEdit() {
    setEditingUserRoleId(null);
  }

  // Re-point an existing assignment to a new target. There's no PUT endpoint for
  // assignments, so this revokes the old grant and re-creates it with the new
  // scope — the admin never has to do it manually.
  async function saveAssignmentEdit(roleKey) {
    const scope = buildScope();
    if (scope === undefined) return; // validation failed
    setSavingEdit(true);
    try {
      await usersApi.revokeRole(user.id, editingUserRoleId);
      await usersApi.grantRole(user.id, roleKey, scope);
      setEditingUserRoleId(null);
      await onChange();
    } catch (e) {
      alert(`Could not update the assignment: ${e.detail || e.message}. The role may have been removed — please re-assign it.`);
    } finally {
      setSavingEdit(false);
    }
  }

  async function grantRole(roleKey) {
    if (!roleKey) return;
    // One distinct role per user — a different role is blocked until the
    // current one is removed. The SAME role may be added again for another
    // target, up to the role's scope_count.
    if (hasRole && roleKey !== currentRoleKey) {
      alert('This user already has a role. Remove it before assigning a different one.');
      return;
    }
    if (hasRole && roleKey === currentRoleKey && assignments.length >= maxTargets) {
      alert(`This role covers ${maxTargets} ${currentRole.scopeLevel}${maxTargets !== 1 ? 's' : ''}. Remove one before adding another.`);
      return;
    }
    const scope = buildScope();
    if (scope === undefined) return; // validation failed
    setGrantingRole(true);
    try {
      await usersApi.grantRole(user.id, roleKey, scope);
      setAddingTarget(false);
      await onChange();
    } catch (e) { alert(e.detail || e.message); }
    finally { setGrantingRole(false); }
  }

  // Begin adding another target for the already-assigned role.
  function startAddTarget() {
    setEditingUserRoleId(null);
    setAddingTarget(true);
    setScopeType(currentRole?.scopeLevel || 'global');
    setScopeProjectId('');
    setScopeLocationId('');
    setScopeDeviceId('');
  }

  async function revokeRole(userRoleId) {
    if (!confirm('Remove this role from the user?')) return;
    try {
      await usersApi.revokeRole(user.id, userRoleId);
      setEditingUserRoleId((cur) => (cur === userRoleId ? null : cur));
      await onChange();
    } catch (e) { alert(e.detail || e.message); }
  }

  // Target selectors (project → location → device), shared by the assign form
  // and the in-place edit editor. Each shows a count of what's available.
  const targetFields = (
    <>
      {scopeType !== 'global' && (
        <Field label="Project">
          <select value={scopeProjectId}
            onChange={(e) => { setScopeProjectId(e.target.value); setScopeLocationId(''); setScopeDeviceId(''); }}
            className={inputCls}>
            <option value="">— select project —</option>
            {projects.map((p) => (
              <option key={p.ID || p.id} value={p.ID || p.id}>{p.NAME || p.name}</option>
            ))}
          </select>
          <p className="text-[11px] text-gray-500 mt-1">
            {projects.length} project{projects.length !== 1 ? 's' : ''} available
          </p>
        </Field>
      )}

      {(scopeType === 'location' || scopeType === 'device') && scopeProjectId && (
        <Field label="Location">
          <select value={scopeLocationId}
            onChange={(e) => { setScopeLocationId(e.target.value); setScopeDeviceId(''); }}
            className={inputCls}>
            <option value="">— select location —</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>{' '.repeat((l.depth - 1) * 2)}{l.name}</option>
            ))}
          </select>
          <p className="text-[11px] text-gray-500 mt-1">
            {locations.length} location{locations.length !== 1 ? 's' : ''} in this project
          </p>
        </Field>
      )}

      {scopeType === 'device' && scopeLocationId && (
        <Field label="Device">
          <select value={scopeDeviceId} onChange={(e) => setScopeDeviceId(e.target.value)} className={inputCls}>
            <option value="">— select device —</option>
            {devices.map((d) => (
              <option key={d.id || d.ID} value={d.id || d.ID}>{d.name || d.NAME}</option>
            ))}
          </select>
          <p className="text-[11px] text-gray-500 mt-1">
            {devices.length} device{devices.length !== 1 ? 's' : ''} in this location
          </p>
        </Field>
      )}
    </>
  );

  return (
    <Modal title={`Edit ${user.username}`} onClose={onClose} wide>
      <div className="grid md:grid-cols-2 gap-6">
        {/* Profile */}
        <section>
          <h3 className="text-white text-sm font-semibold mb-3">Profile</h3>
          <div className="space-y-3">
            <Field label="Email">
              <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                className={inputCls} />
            </Field>
            <Field label="Full name">
              <input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                className={inputCls} />
            </Field>
            <Field label="Status">
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}
                className={inputCls}>
                <option value="active">active</option>
                <option value="disabled">disabled</option>
                <option value="locked">locked</option>
              </select>
            </Field>
            {profileErr && <div className="text-red-300 text-xs">{profileErr}</div>}
            <button onClick={saveProfile} disabled={savingProfile}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-700/40 text-white text-sm font-semibold rounded-lg">
              {savingProfile ? 'Saving…' : 'Save profile'}
            </button>
          </div>
        </section>

        {/* Roles */}
        <section>
          <h3 className="text-white text-sm font-semibold mb-3">Role assignments</h3>

          {/* No role → show a hint; the assign form is in the else branch below. */}
          {!hasRole && (
            <div className="text-gray-500 text-xs mb-4">No role assigned. User will be denied access.</div>
          )}

          {/* One role per user — its targets are listed under a single card. */}
          {hasRole ? (
            <div className="rounded-lg bg-white/5 border border-white/5 mb-4">
              {/* Role header */}
              <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-white/5">
                <span className="text-blue-400 text-sm font-semibold">{currentRole?.name || currentRoleKey}</span>
                <span className="text-gray-500 text-[10px] uppercase tracking-wider">
                  {!currentRole || currentRole.scopeLevel === 'global' ? 'Global' : `${currentRole.scopeLevel}-level`}
                </span>
              </div>

              {/* Its targets */}
              <div className="divide-y divide-white/5">
                {assignments.map((a) => {
                  const editing = editingUserRoleId === a.userRoleId;
                  return (
                    <div key={a.userRoleId}>
                      <div className="flex items-center justify-between gap-2 px-3 py-1.5">
                        <span className="text-xs text-gray-300">
                          {a.deviceId ? `Device #${a.deviceId}`
                            : a.locationId ? `Location #${a.locationId}`
                            : a.projectId ? `Project #${a.projectId}`
                            : 'Everywhere (global)'}
                        </span>
                        <div className="flex items-center gap-3 flex-shrink-0">
                          {levelOfAssignment(a) !== 'global' && (
                            <button onClick={() => (editing ? cancelEdit() : startEditAssignment(a))}
                              className="text-blue-400 hover:text-blue-300 text-xs">
                              {editing ? 'Cancel' : 'Edit'}
                            </button>
                          )}
                          <button onClick={() => revokeRole(a.userRoleId)}
                            className="text-gray-500 hover:text-red-400 text-xs">Remove</button>
                        </div>
                      </div>

                      {editing && (
                        <div className="px-3 pb-3 pt-1 space-y-2 border-t border-white/5 bg-black/20">
                          <div className="text-[11px] text-gray-500">
                            Change the {scopeType} this assignment points to.
                          </div>
                          {targetFields}
                          <button onClick={() => saveAssignmentEdit(a.key)} disabled={savingEdit}
                            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-700/40 text-white text-xs font-semibold rounded-lg">
                            {savingEdit ? 'Saving…' : 'Save changes'}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Footer: count + add another target */}
              <div className="px-3 py-2 border-t border-white/5 space-y-2">
                <div className="text-[11px] text-gray-500">
                  {maxTargets > 1
                    ? `Covers up to ${maxTargets} ${currentRole.scopeLevel}s — ${assignments.length} of ${maxTargets} assigned.`
                    : 'One role per user. Remove it to assign a different one.'}
                </div>

                {canAddMore && !addingTarget && (
                  <button onClick={startAddTarget}
                    className="text-xs text-blue-400 hover:text-blue-300">
                    + Add another {currentRole.scopeLevel}
                  </button>
                )}

                {canAddMore && addingTarget && (
                  <div className="rounded-lg bg-black/20 border border-white/5 p-3 space-y-2">
                    <div className="text-[11px] text-gray-500">
                      Add another {scopeType} for this role.
                    </div>
                    {targetFields}
                    <div className="flex gap-2">
                      <button onClick={() => grantRole(currentRoleKey)} disabled={grantingRole}
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-700/40 text-white text-xs font-semibold rounded-lg">
                        {grantingRole ? 'Adding…' : 'Add'}
                      </button>
                      <button onClick={() => setAddingTarget(false)}
                        className="px-3 py-1.5 text-xs text-gray-300 hover:text-white">Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="border-t border-white/5 pt-3">
              <div className="text-xs text-gray-500 mb-2">Assign role</div>
              <div className="space-y-2">
                <Field label="Role">
                  <select value={grantRoleKey} onChange={(e) => setGrantRoleKey(e.target.value)} className={inputCls}>
                    {roles.map((r) => (
                      <option key={r.key} value={r.key}>{r.name} ({r.key})</option>
                    ))}
                  </select>
                </Field>

                {/* Level comes from the role; the target is set per user. */}
                <div className="text-xs text-gray-400 px-1 py-1">
                  Level: <span className="text-gray-200">
                    {scopeType === 'global' ? 'Global (everywhere)' : `A single ${scopeType}`}
                  </span>
                  {selectedRole?.scopeLevel && selectedRole.scopeLevel !== 'global' && (selectedRole.scopeCount || 1) > 1 && (
                    <span className="text-gray-500"> — up to {selectedRole.scopeCount} {selectedRole.scopeLevel}s, added one at a time.</span>
                  )}
                </div>

                {targetFields}

                <button onClick={() => grantRole(grantRoleKey)} disabled={grantingRole}
                  className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-700/40 text-white text-sm font-semibold rounded-lg">
                  {grantingRole ? 'Granting…' : 'Assign role'}
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </Modal>
  );
}

// ── Tiny shared bits ──────────────────────────────────────────────────────

// The /projects/:id/locations endpoint returns a nested tree. Flatten it to a
// list (keeping `depth` for indentation) so it can populate a <select>.
function flattenLocations(tree, out = []) {
  for (const node of tree || []) {
    out.push({ id: node.id, name: node.name, depth: node.depth || 1 });
    if (node.children?.length) flattenLocations(node.children, out);
  }
  return out;
}

const inputCls =
  'w-full px-3 py-2 bg-[#0f1117] border border-white/10 rounded-lg text-white text-sm placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500';

function Field({ label, required, children }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-gray-400 mb-1">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </span>
      {children}
    </label>
  );
}

function Modal({ title, children, onClose, wide = false }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" onClick={onClose}>
      <div
        className={`bg-[#13151c] border border-white/10 rounded-2xl shadow-2xl w-full ${wide ? 'max-w-3xl' : 'max-w-md'} max-h-[90vh] overflow-y-auto`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
          <h2 className="text-white font-semibold">{title}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
