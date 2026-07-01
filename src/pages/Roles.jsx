// ============================================================================
// Roles.jsx — role editor page.
//
// Allows admins to:
//   • view all roles (system + custom)
//   • create new custom roles
//   • edit custom role name/description
//   • delete custom roles
//   • view what permissions each role has
//   • grant/revoke permissions to/from a role
// ============================================================================

import { useEffect, useState, useCallback } from 'react';
import { rolesApi, permissionsApi } from '../api/auth.js';
import RolePermissionsEditor from '../components/RolePermissionsEditor.jsx';

export default function Roles() {
  const [roles, setRoles]       = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(true);
const [error, setError]   = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedRole, setSelectedRole] = useState(null); // { id, key, name, description, isSystem }
  const [editingRole, setEditingRole] = useState(null); // { id, key, name, description } when editing
  const [showPermissions, setShowPermissions] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [r, p] = await Promise.all([rolesApi.list(), permissionsApi.list()]);
      setRoles(r);
      setPermissions(p);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // ── Save role edits ──────────────────────────────────────────────────
  async function handleSaveEdit() {
    if (!editingRole) return;
    try {
      const payload = {
        roleName: editingRole.name,
        description: editingRole.description
      };
      await rolesApi.update(editingRole.id, payload);
      setEditingRole(null);
      refresh();
      if (selectedRole?.id === editingRole.id) {
        setSelectedRole({ ...selectedRole, name: editingRole.name, description: editingRole.description });
      }
    } catch (e) { alert(e.message); }
  }

  // ── Delete role ────────────────────────────────────────────────────
  async function handleDelete(role) {
    if (role.isSystem) { alert("System roles cannot be deleted."); return; }
    if (!confirm(`Delete role "${role.name}"? This will revoke it from all users.`)) return;
    try {
      await rolesApi.remove(role.id);
      refresh();
      if (selectedRole?.id === role.id) setSelectedRole(null);
    } catch (e) { alert(e.message); }
  }

  // ── Add permission to role ────────────────────────────────────────
  async function grantPermission(permKey) {
    if (!selectedRole) return;
    try {
      await rolesApi.grantPermission(selectedRole.id, permKey);
      // Reload role detail
      const detail = await rolesApi.getPermissions(selectedRole.id);
      setSelectedRole({ ...selectedRole, permissions: detail });
    } catch (e) { alert(e.message); }
  }

  // ── Remove permission from role ────────────────────────────────────────
  async function revokePermission(permId) {
    if (!selectedRole) return;
    if (!confirm("Revoke this permission from the role?")) return;
    try {
      await rolesApi.revokePermission(selectedRole.id, permId);
      const detail = await rolesApi.getPermissions(selectedRole.id);
      setSelectedRole({ ...selectedRole, permissions: detail });
    } catch (e) { alert(e.message); }
  }

  // ── Render ───────────────────────────────────────────────────
if (loading) return <Loader />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-white text-xl font-semibold">Roles & Permissions</h1>
          <p className="text-gray-500 text-sm mt-0.5">Define what each role can do.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowPermissions(true)}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold rounded-lg flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            Edit Permissions
          </button>
          <button onClick={() => setShowCreate(true)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-lg flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New role
          </button>
        </div>
      </div>

      {error && <ErrorBox msg={error} />}

      <div className="grid md:grid-cols-2 gap-6">
        {/* Role list */}
        <div className="bg-[#13151c] border border-white/5 rounded-2xl overflow-hidden">
          <div className="px-4 py-3 bg-white/[0.02] text-gray-500 text-xs uppercase tracking-wider font-medium">
            Roles ({roles.length})
          </div>
          <div className="divide-y divide-white/5">
            {roles.map(role => (
              <button key={role.id}
                onClick={() => rolesApi.getPermissions(role.id).then(detail => setSelectedRole({...role, permissions: detail})).catch(() => setSelectedRole(role))}
                className={`w-full text-left px-4 py-3 flex items-center justify-between hover:bg-white/5 transition-colors
                  ${selectedRole?.id === role.id ? 'bg-blue-500/10 border-l-2 border-blue-500' : ''}`}>
                <div>
                  <div className="text-white font-medium flex items-center gap-2">
                    {role.name}
                    {role.isSystem && <span className="text-[10px] bg-gray-500/20 text-gray-400 px-1.5 py-0.5 rounded">System</span>}
                  </div>
                  <div className="text-gray-500 text-xs">{role.description || role.key}</div>
                </div>
                {!role.isSystem && (
                  <button onClick={(e) => { e.stopPropagation(); handleDelete(role); }}
                    className="text-gray-500 hover:text-red-400 p-1">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a2 2 0 012-2h2a2 2 0 012 2v3" />
                    </svg>
                  </button>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Permission editor (selected role) */}
        <div className="bg-[#13151c] border border-white/5 rounded-2xl overflow-hidden">
          {selectedRole ? (
            <>
              <div className="px-4 py-3 bg-white/[0.02] text-gray-500 text-xs uppercase tracking-wider font-medium flex items-center justify-between">
                <button onClick={() => setSelectedRole(null)} className="text-gray-500 hover:text-white">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
<div className="p-4 space-y-4">
                {/* Role name/description - view only */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-gray-500">Role details</span>
                  </div>
                  
                  <div className="text-white font-medium">{selectedRole.name}</div>
                  {selectedRole.description && (
                    <div className="text-gray-500 text-xs">{selectedRole.description}</div>
                  )}
                </div>

                {/* Current perms - view only */}
                <div>
                  <div className="text-xs text-gray-500 mb-2">Has permissions:</div>
                  <div className="flex flex-wrap gap-1.5">
                    {(selectedRole.permissions || []).length === 0 && (
                      <div className="text-gray-500 text-sm">— none —</div>
                    )}
                    {(selectedRole.permissions || []).map(p => (
                      <div key={p.id} className="flex items-center gap-1 px-2 py-1 rounded-md bg-blue-500/10 border border-blue-500/20 text-blue-300 text-xs">
                        <span>{p.key}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="text-gray-500 text-xs pt-2">
                  Use "Edit Permissions" button to modify role permissions
                </div>
              </div>
            </>
          ) : (
            <div className="p-8 text-center text-gray-500">
              Select a role to view its permissions
            </div>
          )}
        </div>
      </div>

{/* Create role modal */}
      {showCreate && <CreateRoleModal onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); refresh(); }} />}

      {/* Role Permissions Editor Modal */}
      {showPermissions && <RolePermissionsEditor onClose={() => setShowPermissions(false)} />}
    </div>
  );
}

// ── Loader ─────────────────────────────────────────────────────
function Loader() {
  return (
    <div className="flex items-center justify-center py-20 text-gray-400">
      <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

// ── Error box ─────────────────────────────────────────────────
function ErrorBox({ msg }) {
  return <div className="px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm">{msg}</div>;
}

// ── Create role modal ──────────────────────────────────────────
function CreateRoleModal({ onClose, onCreated }) {
  const [form, setForm] = useState({ roleKey: '', roleName: '', description: '' });
  const [permissions, setPermissions] = useState([]);
  const [selectedPerms, setSelectedPerms] = useState(new Set());
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    permissionsApi.list().then(setPermissions).catch(() => {});
  }, []);

  const togglePerm = (permKey) => {
    const newSet = new Set(selectedPerms);
    if (newSet.has(permKey)) {
      newSet.delete(permKey);
    } else {
      newSet.add(permKey);
    }
    setSelectedPerms(newSet);
  };

async function submit(e) {
    e.preventDefault();
    if (form.roleKey.length < 2 || form.roleName.length < 2) {
      setErr('roleKey and roleName must be at least 2 characters');
      return;
    }
    setErr(null);
    setSaving(true);
    try {
      // Send role data WITH permissions array - backend handles creating role and granting permissions in one transaction
      await rolesApi.create({ ...form, permissions: Array.from(selectedPerms) });
      onCreated();
    } catch (e) {
      setErr(e.detail || e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" onClick={onClose}>
      <div className="bg-[#13151c] border border-white/10 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
          <h2 className="text-white font-semibold">Create Role</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-3">
          <label className="block">
            <span className="text-xs font-medium text-gray-400">Role key (URL-friendly) <span className="text-red-400">*</span></span>
            <input value={form.roleKey} onChange={e => setForm({...form, roleKey: e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, '_')})}
              className="w-full mt-1 px-3 py-2 bg-[#0f1117] border border-white/10 rounded-lg text-white text-sm font-mono"
              placeholder="custom_technician" />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-400">Display name <span className="text-red-400">*</span></span>
            <input value={form.roleName} onChange={e => setForm({...form, roleName: e.target.value})}
              className="w-full mt-1 px-3 py-2 bg-[#0f1117] border border-white/10 rounded-lg text-white text-sm"
              placeholder="Custom Technician" />
          </label>
<label className="block">
            <span className="text-xs font-medium text-gray-400">Description</span>
            <input value={form.description} onChange={e => setForm({...form, description: e.target.value})}
              className="w-full mt-1 px-3 py-2 bg-[#0f1117] border border-white/10 rounded-lg text-white text-sm"
              placeholder="Can view and control assigned projects" />
          </label>

          {/* Permission selection */}
          <label className="block">
            <span className="text-xs font-medium text-gray-400">Permissions</span>
            <div className="mt-1 max-h-40 overflow-y-auto bg-[#0f1117] border border-white/10 rounded-lg p-2 space-y-1">
              {permissions.length === 0 ? (
                <div className="text-gray-500 text-xs">Loading permissions...</div>
              ) : (
                permissions.map(perm => (
                  <label key={perm.key} className="flex items-center gap-2 cursor-pointer hover:bg-white/5 p-1 rounded">
                    <input type="checkbox" checked={selectedPerms.has(perm.key)} onChange={() => togglePerm(perm.key)}
                      className="rounded border-white/20 bg-[#1a1d24] text-blue-500 focus:ring-blue-500/50" />
                    <span className="text-white text-sm">{perm.key}</span>
                    <span className="text-gray-500 text-xs truncate">{perm.description}</span>
                  </label>
                ))
              )}
            </div>
          </label>

          {err && <ErrorBox msg={err} />}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} disabled={saving}
              className="px-4 py-2 text-sm text-gray-300 hover:text-white">Cancel</button>
            <button type="submit" disabled={saving}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-700/40 text-white text-sm font-semibold rounded-lg">
              {saving ? 'Creating…' : 'Create role'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}