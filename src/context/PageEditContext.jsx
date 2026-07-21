// ============================================================================
// PageEditContext — admin-only visual "edit mode" for page content & style.
//
// How it works
// ------------
// Editable pieces of a page are wrapped once in <Editable id="...">. This
// context holds a map of *overrides* keyed by that id:
//
//   { [id]: { text?, hidden?, style?: { color, fontSize, fontWeight, textAlign } } }
//
// When an admin turns on Edit Mode, each <Editable> becomes selectable; the
// EditToolbar inspector writes overrides here. Overrides are applied for every
// render (edit mode or not), so once saved the design change is visible
// normally — it's only *changeable* by admins.
//
// Persistence
// -----------
// Overrides are GLOBAL: stored server-side (GET/PUT /page-content, backed by
// the MODBUS_ADMIN.page_content CLOB table) so every user on every device sees
// an admin's edits. localStorage is kept only as an instant-load cache — the
// same pattern SettingsContext uses. The GET is readable by any authenticated
// user; the PUT requires settings.write, so only admins ever write.
// ============================================================================

import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { pageContentApi } from '../api/settings.js';
import { useAuth } from './useAuth.js';

const PageEditContext = createContext(null);
const STORAGE_KEY = 'modbus-page-overrides';
const SAVE_DEBOUNCE_MS = 600;

function loadCache() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

function writeCache(overrides) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
  } catch {
    // ignore storage errors (quota / private mode)
  }
}

export function PageEditProvider({ children }) {
  // useAuth throws outside AuthProvider, so guard — this provider mounts inside
  // AuthProvider but stays defensive.
  let auth = { hasRole: () => false, isAuthenticated: false };
  try {
    auth = useAuth();
  } catch {
    // AuthProvider not ready yet.
  }
  const isAdmin = auth.hasRole?.('admin') ?? false;
  const isAuthenticated = auth.isAuthenticated ?? false;

  // Seed instantly from cache; the server copy overwrites it once fetched.
  const [overrides, setOverrides] = useState(loadCache);
  const [editMode, setEditMode] = useState(false);
  const [selectedId, setSelectedId] = useState(null);

  // dirty=true marks state that originated from a *local admin edit* and must
  // be pushed to the server. Server loads clear it so they don't echo back.
  const dirty = useRef(false);
  const saveTimer = useRef(null);

  // ── Load global overrides from the server once authenticated ─────────────
  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    pageContentApi
      .get()
      .then((data) => {
        if (cancelled) return;
        const obj = data && typeof data === 'object' ? data : {};
        dirty.current = false;      // this is server truth, not a local edit
        setOverrides(obj);
        writeCache(obj);
      })
      .catch(() => { /* keep cache — likely a transient 401 during bring-up */ });
    return () => { cancelled = true; };
  }, [isAuthenticated]);

  // ── Persist local edits ──────────────────────────────────────────────────
  // Always refresh the cache; push to the server only for admin-originated
  // changes, debounced so dragging a slider doesn't spam PUTs.
  useEffect(() => {
    writeCache(overrides);
    if (!dirty.current || !isAdmin) return;
    dirty.current = false;
    clearTimeout(saveTimer.current);
    const snapshot = overrides;
    saveTimer.current = setTimeout(() => {
      pageContentApi.update(snapshot).catch((err) => {
        console.error('Save page content failed:', err.message);
      });
    }, SAVE_DEBOUNCE_MS);
  }, [overrides, isAdmin]);

  // Losing admin (logout / role change) must drop edit mode immediately.
  useEffect(() => {
    if (!isAdmin) { setEditMode(false); setSelectedId(null); }
  }, [isAdmin]);

  // Merge a patch into one element's override. Empty text / empty style keys
  // are stripped so "clear this value" falls back to the element's default.
  const setOverride = useCallback((id, patch) => {
    dirty.current = true;
    setOverrides((prev) => {
      const current = prev[id] || {};
      const next = { ...current, ...patch };

      if ('text' in next && (next.text == null || next.text === '')) delete next.text;
      if (next.style) {
        const cleaned = {};
        for (const [k, v] of Object.entries(next.style)) {
          if (v != null && v !== '') cleaned[k] = v;
        }
        if (Object.keys(cleaned).length) next.style = cleaned;
        else delete next.style;
      }
      if (next.hidden === false) delete next.hidden;

      // Nothing left → remove the id entirely.
      if (Object.keys(next).length === 0) {
        const copy = { ...prev };
        delete copy[id];
        return copy;
      }
      return { ...prev, [id]: next };
    });
  }, []);

  const clearOverride = useCallback((id) => {
    dirty.current = true;
    setOverrides((prev) => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
    setSelectedId((sel) => (sel === id ? null : sel));
  }, []);

  const resetAll = useCallback(() => {
    dirty.current = true;
    setOverrides({});
    setSelectedId(null);
  }, []);

  const value = {
    isAdmin,
    editMode,
    setEditMode,
    overrides,
    selectedId,
    setSelectedId,
    setOverride,
    clearOverride,
    resetAll,
  };

  return <PageEditContext.Provider value={value}>{children}</PageEditContext.Provider>;
}

// Safe defaults when consumed outside a provider (keeps <Editable> usable in
// isolation / tests without crashing).
const NOOP = {
  isAdmin: false,
  editMode: false,
  setEditMode: () => {},
  overrides: {},
  selectedId: null,
  setSelectedId: () => {},
  setOverride: () => {},
  clearOverride: () => {},
  resetAll: () => {},
};

export function usePageEdit() {
  return useContext(PageEditContext) || NOOP;
}
