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
import { projectsApi } from '../api/projects';
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

  // Role grant form
  const [grantRoleKey,   setGrantRoleKey]   = useState(roles[0]?.key || '');
  const [grantProjectId, setGrantProjectId] = useState('');
  const [grantingRole,   setGrantingRole]   = useState(false);

  async function saveProfile() {
    setProfileErr(null);
    setSavingProfile(true);
    try {
      await usersApi.update(user.id, form);
      await onChange();
    } catch (e) { setProfileErr(e.detail || e.message); }
    finally { setSavingProfile(false); }
  }

  async function grantRole() {
    if (!grantRoleKey) return;
    setGrantingRole(true);
    try {
      await usersApi.grantRole(user.id, grantRoleKey, grantProjectId ? Number(grantProjectId) : null);
      setGrantProjectId('');
      await onChange();
    } catch (e) { alert(e.detail || e.message); }
    finally { setGrantingRole(false); }
  }

  async function revokeRole(userRoleId) {
    if (!confirm('Revoke this role assignment?')) return;
    try {
      await usersApi.revokeRole(user.id, userRoleId);
      await onChange();
    } catch (e) { alert(e.detail || e.message); }
  }

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

          {/* Existing role chips */}
          <div className="space-y-1.5 mb-4">
            {(user.roles || []).length === 0 && (
              <div className="text-gray-500 text-xs">No roles assigned. User will be denied access.</div>
            )}
            {(user.roles || []).map((r) => (
              <div key={r.userRoleId}
                className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/5">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-blue-400 text-xs font-semibold">{r.name || r.key}</span>
                  <span className="text-gray-500 text-[10px] uppercase tracking-wider">
                    {r.projectId ? `Project #${r.projectId}` : 'Global'}
                  </span>
                </div>
                <button onClick={() => revokeRole(r.userRoleId)}
                  className="text-gray-500 hover:text-red-400 text-xs">Revoke</button>
              </div>
            ))}
          </div>

          {/* Grant new */}
          <div className="border-t border-white/5 pt-3">
            <div className="text-xs text-gray-500 mb-2">Grant new role</div>
            <div className="flex flex-wrap items-end gap-2">
              <div className="flex-1 min-w-[120px]">
                <Field label="Role">
                  <select value={grantRoleKey} onChange={(e) => setGrantRoleKey(e.target.value)} className={inputCls}>
                    {roles.map((r) => (
                      <option key={r.key} value={r.key}>{r.name} ({r.key})</option>
                    ))}
                  </select>
                </Field>
              </div>
              <div className="flex-1 min-w-[120px]">
                <Field label="Scope">
                  <select value={grantProjectId} onChange={(e) => setGrantProjectId(e.target.value)} className={inputCls}>
                    <option value="">Global (all projects)</option>
                    {projects.map((p) => (
                      <option key={p.ID || p.id} value={p.ID || p.id}>{p.NAME || p.name}</option>
                    ))}
                  </select>
                </Field>
              </div>
              <button onClick={grantRole} disabled={grantingRole}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-700/40 text-white text-sm font-semibold rounded-lg">
                {grantingRole ? 'Granting…' : 'Grant'}
              </button>
            </div>
          </div>
        </section>
      </div>
    </Modal>
  );
}

// ── Tiny shared bits ──────────────────────────────────────────────────────
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
