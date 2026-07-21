// ============================================================================
// Permissions.jsx — admin catalog of permission keys.
//
// Lets an admin create new permission keys, edit their descriptions, and delete
// custom ones. Built-in keys can be re-described but not renamed or deleted.
//
// Editing a permission opens a popup where the admin picks which UI ELEMENTS
// (buttons/controls) the permission controls — either by ticking them from the
// catalog or by TYPING a custom element id. The catalog is stored in the DB and
// fetched from GET /api/ui-element-catalog (the static config/uiElements.js list
// is only a fallback if that request fails). Whether a covered element is usable
// vs view-only is decided by the permission's own access level.
// ============================================================================

import { useEffect, useState, useCallback, useMemo } from 'react';
import { permissionsApi, uiElementCatalogApi } from '../api/auth.js';
import { UI_ELEMENTS as FALLBACK_ELEMENTS } from '../config/uiElements.js';
import { useToast, useConfirm } from '../context/useFeedback.js';
import Editable from '../components/pageedit/Editable.jsx';

// Build the lookup helpers (fields / elementsForField / byId) from a flat
// catalog array of { id, field, label }. Keeps components independent of where
// the catalog came from (DB fetch or the static fallback).
function makeCatalog(list) {
  const byId = Object.fromEntries(list.map((e) => [e.id, e]));
  return {
    elements: list,
    fields: [...new Set(list.map((e) => e.field))],
    elementsForField: (f) => list.filter((e) => e.field === f),
    uiElementById: (id) => byId[id] || null,
  };
}

// A permission's access level (read = view only, anything else = usable).
function permLevel(perm) {
  if (perm.action) return String(perm.action).toLowerCase();
  const parts = String(perm.key || '').split('.');
  return (parts[1] || '').toLowerCase();
}
function levelAllowsUse(level) {
  return !!level && level !== 'read';
}
// The resource/field a permission works on (e.g. 'alarm' for 'alarm.mute').
// Falls back to the key's prefix when the stored resource is empty.
function permResource(perm) {
  if (perm.resource) return String(perm.resource).toLowerCase();
  return String(perm.key || '').split('.')[0].toLowerCase();
}

export default function Permissions() {
  const toast = useToast();
  const confirm = useConfirm();
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editingPerm, setEditingPerm] = useState(null);
  // The UI element catalog, fetched from the DB (falls back to the static list).
  const [catalogList, setCatalogList] = useState(FALLBACK_ELEMENTS);
  const cat = useMemo(() => makeCatalog(catalogList), [catalogList]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await permissionsApi.list();
      setPermissions(list);
      setError(null);
      return list;
    } catch (e) { setError(e.message); return []; }
    finally { setLoading(false); }
  }, []);

  const refreshCatalog = useCallback(async () => {
    try {
      const list = await uiElementCatalogApi.list();
      // Only replace the fallback once the DB actually has rows.
      if (Array.isArray(list) && list.length) setCatalogList(list);
    } catch { /* keep the fallback catalog */ }
  }, []);

  useEffect(() => { refresh(); refreshCatalog(); }, [refresh, refreshCatalog]);

  const [resetting, setResetting] = useState(false);

  async function handleDelete(perm) {
    if (perm.isBuiltin) return;
    if (!(await confirm({
      title: 'Delete permission',
      message: `Delete permission "${perm.key}"? It will be removed from every role that has it.`,
      danger: true,
    }))) return;
    try {
      await permissionsApi.remove(perm.id);
      toast.success(`Permission "${perm.key}" deleted`);
      refresh();
    } catch (e) { toast.error(e.detail || e.message); }
  }

  async function handleReset() {
    if (!(await confirm({
      title: 'Restore default permissions',
      message: 'This deletes every custom permission key, restores the built-in permissions, and rebuilds their default UI-element mappings. Custom permissions cannot be recovered. Continue?',
      danger: true,
    }))) return;
    setResetting(true);
    try {
      await permissionsApi.resetDefaults();
      toast.success('Permissions restored to defaults');
      await Promise.all([refresh(), refreshCatalog()]);
    } catch (e) { toast.error(e.detail || e.message); }
    finally { setResetting(false); }
  }

  if (loading) return <Loader />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Editable id="permissions.title" as="h1" className="text-white text-xl font-semibold">Permissions</Editable>
          <Editable id="permissions.subtitle" as="p" className="text-gray-500 text-sm mt-0.5">
            The catalog of permission keys the app checks. Editing one lets you pick the
            UI elements it controls. Assign permissions to roles on the Roles page.
          </Editable>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleReset} disabled={resetting}
            title="Restore the built-in permissions and their default UI-element mappings"
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
            New permission
          </button>
        </div>
      </div>

      {error && <ErrorBox msg={error} />}

      <div className="bg-[#13151c] border border-white/5 rounded-2xl overflow-hidden">
        <div className="px-4 py-3 bg-white/[0.02] text-gray-500 text-xs uppercase tracking-wider font-medium">
          Permissions ({permissions.length})
        </div>
        <div className="divide-y divide-white/5">
          {permissions.map(perm => (
            <PermissionRow key={perm.id} perm={perm}
              onEdit={() => setEditingPerm(perm)}
              onDelete={() => handleDelete(perm)} />
          ))}
          {permissions.length === 0 && (
            <div className="p-8 text-center text-gray-500">No permissions yet.</div>
          )}
        </div>
      </div>

      {showCreate && (
        <CreateModal
          cat={cat}
          refreshCatalog={refreshCatalog}
          onClose={() => setShowCreate(false)}
          onCreated={async (createdKey) => {
            setShowCreate(false);
            const list = await refresh();
            // Jump straight into the editor so the admin picks its UI elements.
            const created = list.find((p) => p.key === createdKey);
            if (created) setEditingPerm(created);
          }}
        />
      )}

      {editingPerm && (
        <EditPermissionModal
          perm={editingPerm}
          cat={cat}
          refreshCatalog={refreshCatalog}
          onClose={() => setEditingPerm(null)}
          onSaved={() => { setEditingPerm(null); refresh(); }}
        />
      )}
    </div>
  );
}

// ── One compact row — opens the edit popup ────────────────────────────────
function PermissionRow({ perm, onEdit, onDelete }) {
  return (
    <div className="px-4 py-3 flex items-center justify-between gap-3">
      <div className="min-w-0 flex-1">
        <div className="text-white font-medium font-mono text-sm flex items-center gap-2 flex-wrap">
          {perm.key}
          {perm.isBuiltin && (
            <span className="text-[10px] bg-gray-500/20 text-gray-400 px-1.5 py-0.5 rounded">Built-in</span>
          )}
          {perm.resource && (
            <span className="text-[10px] bg-blue-500/10 text-blue-300 px-1.5 py-0.5 rounded">type: {perm.resource}</span>
          )}
          {perm.action && (
            <span className="text-[10px] bg-emerald-500/10 text-emerald-300 px-1.5 py-0.5 rounded">level: {perm.action}</span>
          )}
        </div>
        <div className="text-gray-500 text-xs mt-0.5">
          {perm.description || <span className="italic text-gray-600">No description</span>}
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <button onClick={onEdit}
          className="px-3 py-1.5 text-xs font-medium text-blue-400 hover:text-blue-300 hover:bg-white/5 rounded-md">
          Edit
        </button>
        <button onClick={onDelete} disabled={perm.isBuiltin}
          title={perm.isBuiltin ? 'Built-in permissions cannot be deleted' : 'Delete permission'}
          className={`p-1.5 rounded-md ${perm.isBuiltin ? 'text-gray-700 cursor-not-allowed' : 'text-gray-500 hover:text-red-400 hover:bg-white/5'}`}>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a2 2 0 012-2h2a2 2 0 012 2v3" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ── Edit popup: metadata + the UI elements the permission controls ─────────
function EditPermissionModal({ perm, cat, refreshCatalog, onClose, onSaved }) {
  const [form, setForm] = useState({
    description: perm.description || '',
    resource: perm.resource || '',
    action: perm.action || '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  async function save() {
    setSaving(true); setErr(null);
    try {
      await permissionsApi.update(perm.id, {
        description: form.description,
        resource: form.resource,
        action: form.action,
      });
      onSaved();
    } catch (e) { setErr(e.detail || e.message); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" onClick={onClose}>
      <div className="bg-[#13151c] border border-white/10 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[88vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="text-white font-semibold font-mono truncate">{perm.key}</h2>
            {perm.isBuiltin && (
              <span className="text-[10px] bg-gray-500/20 text-gray-400 px-1.5 py-0.5 rounded">Built-in</span>
            )}
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-6">
          {/* Metadata: what the permission is */}
          <section className="space-y-3">
            <h3 className="text-white text-sm font-semibold">Details</h3>
            <label className="block">
              <span className="block text-xs font-medium text-gray-400 mb-1">Description</span>
              <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                className={inputSm} placeholder="What this permission allows" />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="block text-xs font-medium text-gray-400 mb-1">Type / resource</span>
                <input value={form.resource} onChange={e => setForm({ ...form, resource: e.target.value })}
                  className={inputSm} placeholder="e.g. report" />
              </label>
              <label className="block">
                <span className="block text-xs font-medium text-gray-400 mb-1">Access level</span>
                <input value={form.action} onChange={e => setForm({ ...form, action: e.target.value })}
                  className={inputSm} placeholder="e.g. export" />
              </label>
            </div>
            {err && <ErrorBox msg={err} />}
            <button onClick={save} disabled={saving}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-700/40 text-white text-sm font-semibold rounded-lg">
              {saving ? 'Saving…' : 'Save details'}
            </button>
          </section>

          {/* UI elements it controls: pick a field → tick the elements, or type your own */}
          <section className="space-y-2 border-t border-white/5 pt-4">
            <h3 className="text-white text-sm font-semibold">UI elements this permission controls</h3>
            <ElementsManager perm={perm} cat={cat} refreshCatalog={refreshCatalog} />
          </section>
        </div>

        <div className="px-5 py-3 border-t border-white/5 flex justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-300 hover:text-white">Close</button>
        </div>
      </div>
    </div>
  );
}

// ── Fields → elements a permission controls ───────────────────────────────
// Shows the fields (alarm, device, …). Click a field to open a popup listing
// that field's elements; tick the ones this permission covers. You can also
// TYPE a custom element id to cover something not in the catalog. Whether a
// covered element is usable or view-only is decided by THIS permission's level.
function ElementsManager({ perm, cat, refreshCatalog }) {
  const [covered, setCovered] = useState(null); // Set of element ids
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const level = permLevel(perm);
  const usable = levelAllowsUse(level);
  const resource = permResource(perm);

  const load = useCallback(async () => {
    try { setCovered(new Set(await permissionsApi.listElements(perm.id))); }
    catch (e) { setErr(e.detail || e.message); }
  }, [perm.id]);

  useEffect(() => { load(); }, [load]);

  // Tick / untick one element — persists immediately.
  async function toggleElement(elementId, isSelected) {
    setBusy(true); setErr(null);
    try {
      if (isSelected) await permissionsApi.removeElement(perm.id, elementId);
      else await permissionsApi.addElement(perm.id, elementId);
      setCovered((prev) => {
        const next = new Set(prev);
        if (isSelected) next.delete(elementId); else next.add(elementId);
        return next;
      });
    } catch (e) { setErr(e.detail || e.message); await load(); }
    finally { setBusy(false); }
  }

  // Add an element the admin typed in. Cover it for this permission AND persist
  // it to the catalog so it shows up as a reusable checkbox next time.
  async function addCustom(id) {
    setBusy(true); setErr(null);
    try {
      await permissionsApi.addElement(perm.id, id);
      setCovered((prev) => new Set(prev).add(id));
      try { await uiElementCatalogApi.upsert({ id }); await refreshCatalog?.(); }
      catch { /* mapping saved even if the catalog upsert fails */ }
    } catch (e) { setErr(e.detail || e.message); await load(); }
    finally { setBusy(false); }
  }

  // Cover (or clear) every element of a field in one go. Runs the per-element
  // API calls sequentially so a mid-list failure still leaves a consistent set.
  async function toggleField(field, shouldSelect) {
    setBusy(true); setErr(null);
    try {
      for (const el of cat.elementsForField(field)) {
        const isCovered = covered.has(el.id);
        if (shouldSelect && !isCovered) await permissionsApi.addElement(perm.id, el.id);
        else if (!shouldSelect && isCovered) await permissionsApi.removeElement(perm.id, el.id);
      }
    } catch (e) { setErr(e.detail || e.message); }
    finally { setBusy(false); await load(); }
  }

  if (covered === null) return <div className="text-[11px] text-gray-600">Loading…</div>;

  return (
    <>
      <ElementPicker
        cat={cat}
        selected={covered}
        usable={usable}
        level={level}
        resource={resource}
        busy={busy}
        onToggleElement={toggleElement}
        onToggleField={toggleField}
        onAddCustom={addCustom}
      />
      {err && <div className="text-red-300 text-[11px] mt-2">{err}</div>}
    </>
  );
}

// ── Reusable elements picker ──────────────────────────────────────────────
// Presentational: renders the read/write banner, a summary of what's selected,
// a "type your own" box, and a checkbox for every field + element. It holds no
// selection state itself — the parent owns the `selected` Set and the handlers,
// so the SAME picker drives both editing (persists per click) and creating
// (collects a Set applied after the permission exists).
function ElementPicker({ cat, selected, usable, level, resource, busy, onToggleElement, onToggleField, onAddCustom }) {
  const [customId, setCustomId] = useState('');

  const relatedField = cat.fields.includes(resource) ? resource : null;
  const otherFields = cat.fields.filter((f) => f !== relatedField);
  const orderedFields = relatedField ? [relatedField, ...otherFields] : cat.fields;

  const coveredEls = [...selected].map(cat.uiElementById).filter(Boolean);
  const customEls = [...selected].filter((id) => !cat.uiElementById(id));

  function submitCustom(e) {
    e.preventDefault();
    const id = customId.trim();
    if (!id || selected.has(id)) { setCustomId(''); return; }
    onAddCustom(id);
    setCustomId('');
  }

  const ElementRow = ({ el }) => {
    const checked = selected.has(el.id);
    return (
      <label className={`flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer
        ${checked ? (usable ? 'bg-emerald-500/10' : 'bg-amber-500/10') : 'hover:bg-white/5'}`}>
        <input type="checkbox" checked={checked} disabled={busy}
          onChange={() => onToggleElement(el.id, checked)}
          className="w-4 h-4 rounded border-white/20 bg-white/10 text-blue-600 focus:ring-blue-500 shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm text-white truncate">{el.label}</span>
          <span className="block text-[10px] font-mono text-gray-600">{el.id}</span>
        </span>
        {checked && (
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0
            ${usable ? 'bg-emerald-500/20 text-emerald-200' : 'bg-amber-500/20 text-amber-200'}`}>
            {usable ? 'usable' : 'view'}
          </span>
        )}
      </label>
    );
  };

  const FieldGroup = ({ field }) => {
    const items = cat.elementsForField(field);
    const count = items.filter((e) => selected.has(e.id)).length;
    const allChecked = items.length > 0 && count === items.length;
    return (
      <div className="rounded-xl border border-white/5 bg-black/20 overflow-hidden">
        <label className="flex items-center gap-2.5 px-3 py-2.5 bg-white/[0.02] border-b border-white/5 cursor-pointer">
          <input type="checkbox" checked={allChecked} disabled={busy}
            ref={(node) => { if (node) node.indeterminate = count > 0 && !allChecked; }}
            onChange={() => onToggleField(field, !allChecked)}
            className="w-4 h-4 rounded border-white/20 bg-white/10 text-blue-600 focus:ring-blue-500 shrink-0" />
          <span className="text-sm font-semibold text-white capitalize flex-1">{field}</span>
          <span className="text-[11px] text-gray-500">{count}/{items.length}</span>
        </label>
        <div className="p-1.5 space-y-0.5">
          {items.map((el) => <ElementRow key={el.id} el={el} />)}
          {items.length === 0 && (
            <div className="px-3 py-2 text-[11px] text-gray-600">No elements in this field.</div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-3">
      {/* What read/write means for the selected level */}
      <div className={`px-3 py-2 rounded-lg text-[11px] leading-relaxed border
        ${usable
          ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-200/90'
          : 'bg-amber-500/10 border-amber-500/20 text-amber-200/90'}`}>
        This is a <span className="font-mono font-semibold">{level || 'no'}</span>-level permission.
        {usable
          ? ' Elements you tick here become USABLE for anyone who holds it.'
          : ' Elements you tick here are only VISIBLE (view-only) — a write-level permission is needed to use them.'}
      </div>

      {/* Summary — all UI elements selected */}
      <div className="rounded-lg bg-black/20 border border-white/5 p-3">
        <div className="text-[11px] font-semibold text-gray-400 mb-1.5">
          UI elements this permission covers ({coveredEls.length + customEls.length})
        </div>
        {coveredEls.length === 0 && customEls.length === 0 ? (
          <div className="text-[11px] text-gray-600">
            None yet — tick the elements below, or type your own.
          </div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {coveredEls.map((e) => (
              <span key={e.id}
                className={`text-[10px] font-medium px-2 py-0.5 rounded flex items-center gap-1
                  ${usable ? 'bg-emerald-500/15 text-emerald-200' : 'bg-amber-500/15 text-amber-200'}`}>
                {e.label}
                <span className="opacity-60">· {usable ? 'usable' : 'view'}</span>
              </span>
            ))}
            {customEls.map((id) => (
              <span key={id}
                className="text-[10px] font-medium px-2 py-0.5 rounded flex items-center gap-1 bg-white/10 text-gray-200">
                <span className="font-mono">{id}</span>
                <button type="button" onClick={() => onToggleElement(id, true)} disabled={busy}
                  title="Remove this element" className="opacity-60 hover:opacity-100 hover:text-red-400">✕</button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Type your own element id (not in the catalog) */}
      <form onSubmit={submitCustom} className="flex items-center gap-2">
        <input value={customId} onChange={(e) => setCustomId(e.target.value)}
          className={inputSm} placeholder="Type an element id, e.g. report.download" />
        <button type="submit" disabled={busy || !customId.trim()}
          className="px-3 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-700/40 text-white text-sm font-semibold rounded-lg whitespace-nowrap">
          Add
        </button>
      </form>

      {/* Fields + elements — a checkbox for each. Tick a field header to toggle
          the whole field, or tick individual elements. */}
      <div className="space-y-2">
        <div className="text-[11px] font-semibold text-gray-400">
          Tick the fields and elements this permission controls
        </div>
        {orderedFields.map((field) => <FieldGroup key={field} field={field} />)}
      </div>
    </div>
  );
}

const inputSm =
  'w-full px-3 py-2 bg-[#0f1117] border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500';

// ── Create modal ──────────────────────────────────────────────────────────
function CreateModal({ cat, refreshCatalog, onClose, onCreated }) {
  const [key, setKey] = useState('');
  const [description, setDescription] = useState('');
  const [selected, setSelected] = useState(() => new Set()); // element ids to apply on create
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  const valid = /^[a-z][a-z0-9_]*\.[a-z0-9_]+$/.test(key);
  // Derive resource/level from the key so the picker orders + labels correctly
  // before the permission exists (e.g. 'alarm.write' → alarm / write).
  const resource = key.split('.')[0] || '';
  const level = (key.split('.')[1] || '').toLowerCase();
  const usable = levelAllowsUse(level);

  // Selections are collected locally (no permission id yet) and applied on save.
  function toggleElement(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function toggleField(field, shouldSelect) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const el of cat.elementsForField(field)) {
        if (shouldSelect) next.add(el.id); else next.delete(el.id);
      }
      return next;
    });
  }
  async function addCustom(id) {
    setSelected((prev) => new Set(prev).add(id));
    // Persist the typed element to the catalog so it becomes a reusable checkbox.
    try { await uiElementCatalogApi.upsert({ id }); await refreshCatalog?.(); }
    catch { /* selection still applies on create even if this fails */ }
  }

  async function submit(e) {
    e.preventDefault();
    if (!valid) { setErr("Key must look like 'resource.action' (lowercase, e.g. report.export)."); return; }
    setSaving(true); setErr(null);
    try {
      await permissionsApi.create(key, description);
      // Create returns no id, so re-fetch to find the new permission, then apply
      // the ticked elements to it one by one.
      if (selected.size) {
        const list = await permissionsApi.list();
        const created = list.find((p) => p.key === key);
        if (created) {
          for (const elId of selected) {
            try { await permissionsApi.addElement(created.id, elId); }
            catch { /* skip an element the backend rejects; keep going */ }
          }
        }
      }
      onCreated(key);
    } catch (e) { setErr(e.detail || e.message); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" onClick={onClose}>
      <div className="bg-[#13151c] border border-white/10 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[88vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
          <h2 className="text-white font-semibold">Create permission</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <form onSubmit={submit} className="flex flex-col min-h-0 flex-1">
          <div className="p-5 space-y-5 overflow-y-auto">
            <div className="space-y-3">
              <label className="block">
                <span className="block text-xs font-medium text-gray-400 mb-1">Key <span className="text-red-400">*</span></span>
                <input value={key}
                  onChange={e => setKey(e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, ''))}
                  className="w-full px-3 py-2 bg-[#0f1117] border border-white/10 rounded-lg text-white text-sm font-mono
                    focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  placeholder="report.export" autoFocus />
                <span className="text-[11px] text-gray-500 mt-1 block">Format: resource.action — lowercase, e.g. <span className="font-mono">report.export</span></span>
              </label>
              <label className="block">
                <span className="block text-xs font-medium text-gray-400 mb-1">Description</span>
                <input value={description} onChange={e => setDescription(e.target.value)}
                  className="w-full px-3 py-2 bg-[#0f1117] border border-white/10 rounded-lg text-white text-sm
                    focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  placeholder="Export reports to PDF" />
              </label>
            </div>

            {/* Pick the UI elements to apply as soon as the permission is created */}
            <div className="border-t border-white/5 pt-4 space-y-2">
              <h3 className="text-white text-sm font-semibold">UI elements this permission controls</h3>
              <ElementPicker
                cat={cat}
                selected={selected}
                usable={usable}
                level={level}
                resource={resource}
                busy={saving}
                onToggleElement={toggleElement}
                onToggleField={toggleField}
                onAddCustom={addCustom}
              />
            </div>

            {err && <ErrorBox msg={err} />}
          </div>

          <div className="px-5 py-3 border-t border-white/5 flex justify-end gap-2">
            <button type="button" onClick={onClose} disabled={saving}
              className="px-4 py-2 text-sm text-gray-300 hover:text-white">Cancel</button>
            <button type="submit" disabled={saving || !valid}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-700/40 text-white text-sm font-semibold rounded-lg">
              {saving ? 'Creating…' : selected.size ? `Create + apply ${selected.size}` : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Shared bits ───────────────────────────────────────────────────────────
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
