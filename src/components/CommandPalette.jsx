import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth.js';
import { SEARCH_ENTRIES } from '../config/searchIndex.jsx';

// Order (and thus grouping) of result sections in the palette.
const SECTION_ORDER = ['Pages', 'Actions', 'Settings', 'Administration'];

// Ctrl+K / Cmd+K search. Searches everything in the catalog the current user can
// reach — pages, in-page actions/controls, and individual settings — with the
// same permission gating as the sidebar. Selecting an entry navigates to its
// route; element entries also carry a #hash so the target page scrolls to and
// highlights the control (see useScrollToHash). Mounted only while open, so
// state starts fresh on every open without reset effects.
export default function CommandPalette({ onClose }) {
  const navigate = useNavigate();
  const { hasPermission, hasAnyPermission, canFeature } = useAuth();
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const listRef = useRef(null);

  const items = useMemo(() => {
    // Gate first: only offer what this user may actually open/use.
    const visible = SEARCH_ENTRIES.filter((e) => {
      if (e.feature && !canFeature(e.feature)) return false;
      if (e.perm && !hasPermission(e.perm)) return false;
      if (e.anyPerm && !hasAnyPermission(e.anyPerm)) return false;
      return true;
    });
    const q = query.trim().toLowerCase();
    const mapped = visible
      .map((e) => ({
        ...e,
        shownLabel: e.labelFor ? e.labelFor(hasPermission) : e.label,
        section: e.section || 'Pages',
      }))
      .filter((e) => {
        if (!q) return true;
        const hay = `${e.shownLabel} ${e.keywords || ''} ${e.section}`.toLowerCase();
        return hay.includes(q);
      });
    // Group sections contiguously (and in a friendly order) so each header
    // renders once and the keyboard index matches the visual order.
    const rank = (s) => {
      const i = SECTION_ORDER.indexOf(s);
      return i === -1 ? SECTION_ORDER.length : i;
    };
    return mapped
      .map((e, i) => ({ e, i }))                       // decorate for stable sort
      .sort((a, b) => rank(a.e.section) - rank(b.e.section) || a.i - b.i)
      .map(({ e }) => e);
  }, [query, canFeature, hasPermission, hasAnyPermission]);

  // Derived, not stored — stays valid when the filtered list shrinks.
  const safeIdx = items.length ? Math.min(activeIdx, items.length - 1) : 0;

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
      else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIdx(Math.min(safeIdx + 1, items.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIdx(Math.max(safeIdx - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const item = items[safeIdx];
        if (item) { navigate(item.to); onClose(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [items, safeIdx, navigate, onClose]);

  // Keep the highlighted row in view while arrowing through a long list
  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-idx="${safeIdx}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [safeIdx]);

  // Pre-group for rendering so section headers appear once per group.
  const groups = useMemo(() => {
    const out = [];
    let current = null;
    items.forEach((item, idx) => {
      if (!current || current.name !== item.section) {
        current = { name: item.section, items: [] };
        out.push(current);
      }
      current.items.push({ ...item, idx });
    });
    return out;
  }, [items]);

  return (
    <div
      className="fixed inset-0 z-[105] flex items-start justify-center pt-[15vh] p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="animate-scale-in relative w-full max-w-lg rounded-2xl bg-[#13151c] border border-white/10 shadow-2xl overflow-hidden">
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 border-b border-white/5">
          <svg className="w-4 h-4 text-gray-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            autoFocus
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActiveIdx(0); }}
            placeholder="Search pages, actions, settings…"
            className="flex-1 py-3.5 bg-transparent text-sm text-gray-200 placeholder-gray-600 focus:outline-none"
            aria-label="Search"
          />
          <kbd className="hidden sm:block px-1.5 py-0.5 rounded-md bg-white/5 border border-white/10 text-[10px] text-gray-500">
            Esc
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[45vh] overflow-y-auto py-2">
          {items.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-gray-500">Nothing matches “{query}”</p>
          )}
          {groups.map((group) => (
            <div key={group.name}>
              <p className="px-4 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-widest text-gray-600">
                {group.name}
              </p>
              {group.items.map((item) => (
                <button
                  key={item.idx}
                  type="button"
                  data-idx={item.idx}
                  onClick={() => { navigate(item.to); onClose(); }}
                  onMouseMove={() => setActiveIdx(item.idx)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left transition-colors
                    ${item.idx === safeIdx ? 'bg-blue-500/15 text-blue-300' : 'text-gray-300 hover:bg-white/5'}`}
                >
                  <span className={item.idx === safeIdx ? 'text-blue-400' : 'text-gray-500'}>{item.icon}</span>
                  {item.shownLabel}
                  {item.idx === safeIdx && (
                    <kbd className="ml-auto px-1.5 py-0.5 rounded-md bg-white/5 border border-white/10 text-[10px] text-gray-500">
                      ↵
                    </kbd>
                  )}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
