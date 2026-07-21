// ============================================================================
// Roles.jsx — role editor page.
//
// The role page defines STRUCTURE only:
//   • access rights (permissions) — what the role can see/do
//   • level TYPE (global / project / location / device) — the scope granularity
//
// It does NOT pick a specific project/location/device. That target is chosen
// per user on the Users page when the role is assigned, so the same role (e.g.
// "viewer") can be given to different users on different projects.
// ============================================================================

import { useEffect, useState, useCallback, useRef } from 'react';
import { rolesApi, permissionsApi } from '../api/auth.js';
import { projectsApi, locationsApi, devicesApi } from '../api/projects.js';
import { useToast, useConfirm } from '../context/useFeedback.js';
import Editable from '../components/pageedit/Editable.jsx';

// Count locations in a nested location tree (each node may have `children`).
function countLocations(tree) {
  let n = 0;
  for (const node of tree || []) {
    n += 1;
    if (node.children?.length) n += countLocations(node.children);
  }
  return n;
}

// The count that matches a given level, or null for global.
function countForLevel(level, counts) {
  if (!counts) return null;
  if (level === 'project')  return counts.project;
  if (level === 'location') return counts.location;
  if (level === 'device')   return counts.device;
  return null;
}

// ── Level derivation ──────────────────────────────────────────────────────
// A role's Level (scope granularity) is derived from the permissions it holds,
// "narrowest wins": if any device.* permission is present the role is scoped to
// a device; else location.*; else project.*; else it's global. The concrete
// target (which device/project) is still chosen per user on the Users page.
const LEVEL_RANK = { global: 0, project: 1, location: 2, device: 3 };

function levelForPermKey(key) {
  const prefix = String(key ?? '').split('.')[0];
  if (prefix === 'device') return 'device';
  if (prefix === 'location') return 'location';
  if (prefix === 'project') return 'project';
  return 'global';
}

function deriveLevel(permKeys) {
  let best = 'global';
  for (const k of permKeys) {
    const lvl = levelForPermKey(k);
    if (LEVEL_RANK[lvl] > LEVEL_RANK[best]) best = lvl;
  }
  return best;
}

export default function Roles() {
  const toast = useToast();
  const confirm = useConfirm();
  const [roles, setRoles]             = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState(null);
  const [showCreate, setShowCreate]   = useState(false);
  const [editingRole, setEditingRole] = useState(null); // full role object

  // How many projects / locations / devices exist — shown next to the Level.
  const [counts, setCounts] = useState({ project: 0, location: 0, device: 0 });

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

  // Load the counts once (best-effort; ignored if the endpoints are forbidden).
  useEffect(() => {
    let alive = true;
    (async () => {
      const [projects, devices] = await Promise.all([
        projectsApi.list().catch(() => []),
        devicesApi.list().catch(() => []),
      ]);
      let location = 0;
      await Promise.all((projects || []).map(async (p) => {
        const pid = p.id ?? p.ID;
        if (!pid) return;
        const tree = await locationsApi.listByProject(pid).catch(() => []);
        location += countLocations(tree);
      }));
      if (alive) setCounts({ project: (projects || []).length, location, device: (devices || []).length });
    })();
    return () => { alive = false; };
  }, []);

  const [resetting, setResetting] = useState(false);

  async function handleReset() {
    if (!(await confirm({
      title: 'Restore default role permissions',
      message: 'This resets each built-in system role (admin, viewer, operator) to its default set of permissions. Custom roles are left untouched. Continue?',
      danger: true,
    }))) return;
    setResetting(true);
    try {
      await rolesApi.resetDefaults();
      toast.success('System roles restored to default permissions');
      refresh();
    } catch (e) { toast.error(e.detail || e.message); }
    finally { setResetting(false); }
  }

  async function handleDelete(role) {
    if (role.isSystem) { toast.error('System roles cannot be deleted.'); return; }
    if (!(await confirm({
      title: 'Delete role',
      message: `Delete role "${role.name}"? This will revoke it from all users.`,
      danger: true,
    }))) return;
    try {
      await rolesApi.remove(role.id);
      toast.success(`Role "${role.name}" deleted`);
      refresh();
    } catch (e) { toast.error(e.message); }
  }

  if (loading) return <Loader />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Editable id="roles.title" as="h1" className="text-white text-xl font-semibold">Roles &amp; Permissions</Editable>
          <Editable id="roles.subtitle" as="p" className="text-gray-500 text-sm mt-0.5">
            Define each role's access rights and level. The target project is chosen per user.
          </Editable>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleReset} disabled={resetting}
            title="Reset the built-in system roles to their default permissions"
            className="px-4 py-2 bg-white/5 hover:bg-white/10 disabled:opacity-50 text-gray-300 text-sm font-semibold rounded-lg flex items-center gap-2 border border-white/10">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {resetting ? 'Resetting…' : 'Reset to defaults'}
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

      <div className="bg-[#13151c] border border-white/5 rounded-2xl overflow-hidden">
        <div className="px-4 py-3 bg-white/[0.02] text-gray-500 text-xs uppercase tracking-wider font-medium">
          Roles ({roles.length})
        </div>
        <div className="divide-y divide-white/5">
          {roles.map(role => (
            <div key={role.id}
              className="w-full text-left px-4 py-3 flex items-center justify-between gap-3 hover:bg-white/5 transition-colors">
              <div className="min-w-0">
                <div className="text-white font-medium flex items-center gap-2">
                  {role.name}
                  {role.isSystem && <span className="text-[10px] bg-gray-500/20 text-gray-400 px-1.5 py-0.5 rounded">System</span>}
                  <LevelBadge role={role} />
                </div>
                <div className="text-gray-500 text-xs">{role.description || role.key}</div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => setEditingRole(role)}
                  className="px-3 py-1.5 text-xs font-medium text-blue-400 hover:text-blue-300 hover:bg-white/5 rounded-md">
                  Edit
                </button>
                {!role.isSystem && (
                  <button onClick={() => handleDelete(role)}
                    className="text-gray-500 hover:text-red-400 p-1.5">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a2 2 0 012-2h2a2 2 0 012 2v3" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          ))}
          {roles.length === 0 && (
            <div className="p-8 text-center text-gray-500">No roles yet.</div>
          )}
        </div>
      </div>

      {showCreate && (
        <CreateRoleModal
          permissions={permissions}
          counts={counts}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); refresh(); }}
        />
      )}

      {editingRole && (
        <EditRoleModal
          role={editingRole}
          permissions={permissions}
          counts={counts}
          onClose={() => setEditingRole(null)}
          onSaved={() => { setEditingRole(null); refresh(); }}
        />
      )}
    </div>
  );
}

// ── Level badge ───────────────────────────────────────────────────────────
function LevelBadge({ role }) {
  const level = role.scopeLevel || 'global';
  const label = level === 'global' ? 'Global' : `${level[0].toUpperCase()}${level.slice(1)}-level`;
  const cls = level === 'global'
    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
    : 'bg-amber-500/10 text-amber-400 border-amber-500/20';
  return <span className={`text-[10px] px-1.5 py-0.5 rounded border ${cls}`}>{label}</span>;
}

// ── Loader / error ────────────────────────────────────────────────────────
function Loader() {
  return (
    <div className="flex items-center justify-center py-20 text-gray-400">
      <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
function ErrorBox({ msg }) {
  return <div className="px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm">{msg}</div>;
}

// ── Level display (auto-derived from the selected permissions) ────────────
// The level is no longer picked by hand — it follows the permissions you grant
// (narrowest wins). Rendered read-only so the two can't drift apart.
const LEVEL_LABEL = {
  global: 'Global (everywhere)',
  project: 'A single project',
  location: 'A single location',
  device: 'A single device',
};

function LevelField({ level }) {
  return (
    <Field label="Level">
      <div className={`${inputCls} flex items-center justify-between cursor-default opacity-90`}>
        <span>{LEVEL_LABEL[level] ?? LEVEL_LABEL.global}</span>
        <span className="text-[10px] uppercase tracking-wider text-gray-500">Auto</span>
      </div>
    </Field>
  );
}

// Editable "how many" field for a scoped level. The unit word follows the level
// and pluralises with the entered number; the value is capped at how many of
// that entity actually exist (counts), and can't be less than 1.
function LevelCountField({ level, counts, value, onChange }) {
  const max = countForLevel(level, counts);
  if (max == null) return null; // global — nothing to count
  const noun = level; // 'project' | 'location' | 'device'
  if (max < 1) {
    return (
      <Field label={`Number of ${noun}s`}>
        <div className="text-[11px] text-gray-500">No {noun}s exist yet.</div>
      </Field>
    );
  }
  const clamp = (v) => Math.max(1, Math.min(max, Math.floor(v) || 1));
  return (
    <Field label={`Number of ${noun}s`}>
      <div className="flex items-center gap-3">
        <input
          type="number" min={1} max={max} value={value}
          onChange={(e) => onChange(clamp(Number(e.target.value)))}
          className={`${inputCls} w-24`}
        />
        <span className="text-sm text-gray-300">{value} {noun}{value !== 1 ? 's' : ''}</span>
        <span className="text-[11px] text-gray-500">of {max} available</span>
      </div>
    </Field>
  );
}

// The role stores only its level TYPE; the concrete target is always chosen per
// user at assignment, so we send null targets here.
function scopePayload(level, count) {
  return {
    scopeLevel: level,
    scopeProjectId: null,
    scopeLocationId: null,
    scopeDeviceId: null,
    scopeCount: level === 'global' ? null : (count || 1),
  };
}

// ── Create role modal ─────────────────────────────────────────────────────
function CreateRoleModal({ permissions, counts, onClose, onCreated }) {
  const [form, setForm] = useState({ roleKey: '', roleName: '', description: '' });
  const [selectedPerms, setSelectedPerms] = useState(new Set());
  const [level, setLevel] = useState('global');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  // How many of the level's entity this role covers (default: all existing).
  const [levelCount, setLevelCount] = useState(1);
  useEffect(() => {
    const max = countForLevel(level, counts);
    setLevelCount(max && max > 0 ? max : 1);
  }, [level, counts]);

  // Level follows the permission you just toggled: checking a permission sets
  // the level to that permission's scope; unchecking falls back to the most
  // specific scope still granted. It's never edited by hand.
  const togglePerm = (permKey) => {
    const next = new Set(selectedPerms);
    if (next.has(permKey)) {
      next.delete(permKey);
      setLevel(deriveLevel(next));
    } else {
      next.add(permKey);
      setLevel(levelForPermKey(permKey));
    }
    setSelectedPerms(next);
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
      await rolesApi.create({ ...form, ...scopePayload(level, levelCount), permissions: Array.from(selectedPerms) });
      onCreated();
    } catch (e) {
      setErr(e.detail || e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Create role" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Role key (URL-friendly)" required>
          <input value={form.roleKey}
            onChange={e => setForm({ ...form, roleKey: e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, '_') })}
            className={`${inputCls} font-mono`} placeholder="custom_technician" />
        </Field>
        <Field label="Display name" required>
          <input value={form.roleName} onChange={e => setForm({ ...form, roleName: e.target.value })}
            className={inputCls} placeholder="Custom Technician" />
        </Field>
        <Field label="Description">
          <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
            className={inputCls} placeholder="Can view and control assigned devices" />
        </Field>

        <div className="border-t border-white/5 pt-3">
          <div className="text-xs font-semibold text-gray-300 mb-2">Level</div>
          <LevelField level={level} />
          <div className="mt-2">
            <LevelCountField level={level} counts={counts} value={levelCount} onChange={setLevelCount} />
          </div>
          <p className="text-[11px] text-gray-500 mt-1">
            {level === 'global'
              ? 'Set automatically from the permission you select below.'
              : `Set automatically from the permission you select below. The specific ${level} is chosen per user when this role is assigned.`}
          </p>
        </div>

        <div className="border-t border-white/5 pt-3">
          <div className="text-xs font-semibold text-gray-300 mb-2">Access rights</div>
          <div className="max-h-40 overflow-y-auto bg-[#0f1117] border border-white/10 rounded-lg p-2 space-y-1">
            {permissions.length === 0 ? (
              <div className="text-gray-500 text-xs">No permissions available.</div>
            ) : permissions.map(perm => (
              <label key={perm.key} className="flex items-center gap-2 cursor-pointer hover:bg-white/5 p-1 rounded">
                <input type="checkbox" checked={selectedPerms.has(perm.key)} onChange={() => togglePerm(perm.key)}
                  className="rounded border-white/20 bg-[#1a1d24] text-blue-500 focus:ring-blue-500/50" />
                <span className="text-white text-sm">{perm.key}</span>
                <span className="text-gray-500 text-xs truncate">{perm.description}</span>
              </label>
            ))}
          </div>
        </div>

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
    </Modal>
  );
}

// ── Edit role modal (works for system + custom roles) ─────────────────────
function EditRoleModal({ role, permissions, counts, onClose, onSaved }) {
  const [form, setForm]   = useState({ roleName: role.name || '', description: role.description || '' });
  const [rolePerms, setRolePerms] = useState([]); // [{id, key, ...}]
  const [level, setLevel] = useState(role.scopeLevel || 'global');
  const [savingProfile, setSavingProfile] = useState(false);
  const [busyPerm, setBusyPerm] = useState(false);
  const [err, setErr] = useState(null);

  // How many of the level's entity this role covers. Seeded from the saved
  // value; when the admin switches to a *different* level it defaults to all
  // available, and it's always clamped to how many exist.
  const [levelCount, setLevelCount] = useState(role.scopeCount || 1);
  const baseLevel = useRef(role.scopeLevel || 'global');
  useEffect(() => {
    const max = countForLevel(level, counts);
    if (max == null) return; // global — nothing to count
    const base = level === baseLevel.current ? (role.scopeCount || max) : max;
    setLevelCount(Math.min(Math.max(1, base), max));
  }, [level, counts, role.scopeCount]);

  // Load the role's current permissions.
  useEffect(() => {
    let alive = true;
    rolesApi.getPermissions(role.id)
      .then(p => { if (alive) setRolePerms(p); })
      .catch(e => { if (alive) setErr(e.message); });
    return () => { alive = false; };
  }, [role.id]);

  const hasPerm = (permId) => rolePerms.some(p => p.id === permId);

  async function togglePerm(perm) {
    setErr(null);
    setBusyPerm(true);
    const granting = !hasPerm(perm.id);
    try {
      if (granting) await rolesApi.grantPermission(role.id, perm.key);
      else          await rolesApi.revokePermission(role.id, perm.id);
      const updated = await rolesApi.getPermissions(role.id);
      setRolePerms(updated);
      // Level follows the permission you just toggled: checking sets it to that
      // permission's scope; unchecking falls back to the most specific scope
      // still granted. Persisted on "Save role".
      if (granting) setLevel(levelForPermKey(perm.key));
      else          setLevel(deriveLevel(updated.map((p) => p.key)));
    } catch (e) {
      setErr(e.detail || e.message);
    } finally {
      setBusyPerm(false);
    }
  }

  async function save() {
    setErr(null);
    setSavingProfile(true);
    try {
      // Always send the level (with null targets) so any stale target on the
      // role is cleared — the target lives on the user assignment now.
      await rolesApi.update(role.id, { roleName: form.roleName, description: form.description, ...scopePayload(level, levelCount) });
      onSaved();
    } catch (e) {
      setErr(e.detail || e.message);
    } finally {
      setSavingProfile(false);
    }
  }

  return (
    <Modal title={`Edit ${role.name}`} onClose={onClose} wide>
      <div className="grid md:grid-cols-2 gap-6">
        {/* Details + level */}
        <section className="space-y-3">
          <h3 className="text-white text-sm font-semibold">Details</h3>
          <Field label="Display name">
            <input value={form.roleName} onChange={e => setForm({ ...form, roleName: e.target.value })} className={inputCls} />
          </Field>
          <Field label="Description">
            <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className={inputCls} />
          </Field>

          <div className="border-t border-white/5 pt-3">
            <div className="text-xs font-semibold text-gray-300 mb-2">Level</div>
            <LevelField level={level} />
            <div className="mt-2">
              <LevelCountField level={level} counts={counts} value={levelCount} onChange={setLevelCount} />
            </div>
            <p className="text-[11px] text-gray-500 mt-1">
              {level === 'global'
                ? 'Set automatically from the permission you select. Save the role to persist it.'
                : `Set automatically from the permission you select. The specific ${level} is chosen per user on the Users page. Save the role to persist it.`}
            </p>
          </div>

          {err && <ErrorBox msg={err} />}
          <button onClick={save} disabled={savingProfile}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-700/40 text-white text-sm font-semibold rounded-lg">
            {savingProfile ? 'Saving…' : 'Save role'}
          </button>
        </section>

        {/* Access rights */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-white text-sm font-semibold">Access rights</h3>
            <span className="text-xs text-gray-500">{rolePerms.length} of {permissions.length}</span>
          </div>
          <div className="space-y-1.5 max-h-[22rem] overflow-y-auto pr-1">
            {permissions.map(perm => {
              const granted = hasPerm(perm.id);
              return (
                <label key={perm.id}
                  className={`flex items-start gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors
                    ${granted ? 'bg-blue-500/10 border-blue-500/30' : 'bg-white/5 border-white/5 hover:border-white/10'}`}>
                  <input type="checkbox" checked={granted} disabled={busyPerm} onChange={() => togglePerm(perm)}
                    className="mt-0.5 w-4 h-4 rounded border-white/20 bg-white/10 text-blue-600 focus:ring-blue-500" />
                  <div className="min-w-0">
                    <div className={`text-sm font-medium ${granted ? 'text-blue-300' : 'text-gray-300'}`}>{perm.key}</div>
                    {perm.description && <div className="text-xs text-gray-500 truncate">{perm.description}</div>}
                  </div>
                </label>
              );
            })}
            {permissions.length === 0 && <div className="text-center py-8 text-gray-500">No permissions available.</div>}
          </div>
          <p className="text-[11px] text-gray-500 mt-2">Permission changes save immediately.</p>
        </section>
      </div>
    </Modal>
  );
}

// ── Shared bits ───────────────────────────────────────────────────────────
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
        onClick={(e) => e.stopPropagation()}>
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
