// ============================================================================
// Brands.jsx — brand management page.
//
// Pure CRUD over the brands lookup table (add / edit / delete). No devices are
// shown here — assigning a brand to a device happens on the Device Connections
// page via the inline Brand dropdown.
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import { brandsApi } from '../api/brands.js';
import { useAuth } from '../context/useAuth.js';
import { useToast, useConfirm } from '../context/useFeedback.js';
import { SkeletonTableRows } from '../components/Skeleton.jsx';
import Editable from '../components/pageedit/Editable.jsx';
// Oracle returns uppercase keys; normalise the fields we render.
function normalizeBrand(b) {
  return {
    id: b.id ?? b.ID,
    name: b.name ?? b.NAME ?? '',
    createdAt: b.created_at ?? b.CREATED_AT ?? null,
    deviceCount: Number(b.device_count ?? b.DEVICE_COUNT ?? 0),
  };
}

function formatDate(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  if (isNaN(d)) return '—';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function Brands() {
  const { hasPermission } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const canWrite = hasPermission('device.write');

  const [brands, setBrands] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState(null); // brand object being edited

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    brandsApi
      .list()
      .then((rows) => {
        if (cancelled) return;
        setBrands((rows ?? []).map(normalizeBrand));
        setError('');
      })
      .catch((err) => { if (!cancelled) setError(err.message || 'Failed to load brands'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [reloadKey]);

  const reload = () => setReloadKey((k) => k + 1);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return brands;
    return brands.filter((b) => b.name.toLowerCase().includes(q));
  }, [brands, search]);

  async function handleDelete(brand) {
    const msg = brand.deviceCount > 0
      ? `Delete "${brand.name}"? It will be removed from ${brand.deviceCount} device(s).`
      : `Delete "${brand.name}"?`;
    if (!(await confirm({ title: 'Delete brand', message: msg, danger: true }))) return;
    try {
      await brandsApi.remove(brand.id);
      toast.success(`Brand "${brand.name}" deleted`);
      reload();
    } catch (e) {
      toast.error(e.message);
    }
  }

  return (
    <div className="space-y-4 animate-fade-in">
      {/* ── Header bar ── */}
      <div className="rounded-2xl bg-[#1a1d27] border border-white/5 px-6 py-4 flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex items-center gap-3">
          <span className="w-9 h-9 rounded-xl bg-cyan-500/15 text-cyan-400 flex items-center justify-center">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                d="M7 7h.01M7 3h5a1.99 1.99 0 011.41.59l7 7a2 2 0 010 2.82l-7 7a2 2 0 01-2.82 0l-7-7A1.99 1.99 0 013 12V7a4 4 0 014-4z" />
            </svg>
          </span>
          <div>
            <Editable id="brands.title" as="h1" className="text-base font-bold uppercase tracking-wide text-gray-100">Brands</Editable>
            <Editable id="brands.subtitle" as="p" className="text-xs text-gray-500 mt-0.5">Manage device brands. Assign them to devices on the Connections page.</Editable>
          </div>
        </div>

        <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">
          <span className="w-2 h-2 rounded-full bg-cyan-400" /> Total: <span className="text-gray-200 tabular-nums">{brands.length}</span>
        </span>

        {canWrite && (
          <button
            onClick={() => setShowCreate(true)}
            className="ml-auto inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500/40"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New brand
          </button>
        )}
      </div>

      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search brands…"
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#1a1d27] border border-white/5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
          />
        </div>
        <span className="px-3 py-2 rounded-lg bg-[#1a1d27] border border-white/5 text-xs font-semibold text-gray-400 tabular-nums">
          {visible.length}/{brands.length}
        </span>
      </div>

      {/* ── Table ── */}
      <div className="rounded-2xl bg-[#1a1d27] border border-white/5 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/5">
                {['Brand', 'Devices', 'Created', canWrite ? 'Actions' : ''].filter(Boolean).map((h) => (
                  <th key={h} className={`px-6 py-4 text-[11px] font-semibold text-gray-500 uppercase tracking-widest ${h === 'Actions' ? 'text-right' : 'text-left'}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {error ? (
                <tr><td colSpan={4} className="px-6 py-10 text-center text-sm text-red-400">{error}</td></tr>
              ) : loading ? (
                <SkeletonTableRows rows={4} cols={4} />
              ) : visible.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center">
                    <p className="text-sm text-gray-400">{brands.length === 0 ? 'No brands yet.' : 'No brands match your search.'}</p>
                    {canWrite && brands.length === 0 && (
                      <button onClick={() => setShowCreate(true)}
                        className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-colors cursor-pointer">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        Add your first brand
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                visible.map((b) => (
                  <tr key={b.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02] transition-colors">
                    <td className="px-6 py-4 text-sm font-semibold text-gray-100">{b.name}</td>
                    <td className="px-6 py-4">
                      <span className="px-2.5 py-1 rounded-md bg-white/5 text-xs font-semibold text-gray-300 tabular-nums">
                        {b.deviceCount}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">{formatDate(b.createdAt)}</td>
                    {canWrite && (
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => setEditing(b)}
                            className="px-3 py-1.5 text-xs font-medium text-blue-400 hover:text-blue-300 hover:bg-white/5 rounded-md transition-colors cursor-pointer">
                            Edit
                          </button>
                          <button onClick={() => handleDelete(b)} title="Delete brand"
                            className="text-gray-500 hover:text-red-400 p-1.5 rounded-md transition-colors cursor-pointer">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a2 2 0 012-2h2a2 2 0 012 2v3" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showCreate && (
        <BrandModal
          title="New brand"
          onClose={() => setShowCreate(false)}
          onSubmit={(name) => brandsApi.create(name)}
          onSaved={() => { setShowCreate(false); reload(); }}
        />
      )}
      {editing && (
        <BrandModal
          title="Edit brand"
          initialName={editing.name}
          onClose={() => setEditing(null)}
          onSubmit={(name) => brandsApi.update(editing.id, name)}
          onSaved={() => { setEditing(null); reload(); }}
        />
      )}
    </div>
  );
}

// ── Add / edit modal ────────────────────────────────────────────────────────
function BrandModal({ title, initialName = '', onClose, onSubmit, onSaved }) {
  const [name, setName] = useState(initialName);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  async function submit(e) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) { setErr('Brand name is required'); return; }
    setErr('');
    setSaving(true);
    try {
      await onSubmit(trimmed);
      onSaved();
    } catch (e) {
      setErr(e.detail || e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" onClick={onClose}>
      <div className="bg-[#13151c] border border-white/10 rounded-2xl shadow-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
          <h2 className="text-white font-semibold">{title}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white cursor-pointer">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-4">
          <label className="block">
            <span className="block text-xs font-medium text-gray-400 mb-1">
              Brand name<span className="text-red-400 ml-0.5">*</span>
            </span>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Cummins"
              className="w-full px-3 py-2 bg-[#0f1117] border border-white/10 rounded-lg text-white text-sm placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </label>

          {err && (
            <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm" role="alert">
              {err}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} disabled={saving}
              className="px-4 py-2 text-sm text-gray-300 hover:text-white cursor-pointer">Cancel</button>
            <button type="submit" disabled={saving}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-700/40 text-white text-sm font-semibold rounded-lg cursor-pointer">
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
