import { useState, useRef, useEffect } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth.js';
import CommandPalette from './CommandPalette.jsx';
import EditToolbar from './pageedit/EditToolbar.jsx';
import GlobalEditLayer from './pageedit/GlobalEditLayer.jsx';
import { useScrollToHash } from '../hooks/useScrollToHash.js';

// Nav catalog lives in config/navItems.jsx so the sidebar and the Ctrl+K
// command palette always offer the same permission-gated pages.
import { NAV_ITEMS } from '../config/navItems.jsx';

// ── Backend health ──────────────────────────────────────────────────────
// Polls the backend so the header pill shows the REAL connection state
// instead of a hardcoded label. Any HTTP answer (even 401/404) proves the
// server is reachable; the dev proxy answers 5xx / throws when it's down.
function useBackendHealth(intervalMs = 20_000) {
  const [status, setStatus] = useState('checking'); // 'online' | 'offline' | 'checking'
  useEffect(() => {
    let alive = true;
    const ping = async () => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 4000);
      try {
        const res = await fetch('/api/health', { signal: ctrl.signal });
        if (alive) setStatus(res.status < 500 ? 'online' : 'offline');
      } catch {
        if (alive) setStatus('offline');
      } finally {
        clearTimeout(timer);
      }
    };
    ping();
    const id = setInterval(ping, intervalMs);
    return () => { alive = false; clearInterval(id); };
  }, [intervalMs]);
  return status;
}

const HEALTH_META = {
  online:   { dot: 'bg-emerald-400', text: 'text-gray-400',  label: 'Backend online' },
  offline:  { dot: 'bg-red-400',     text: 'text-red-300',   label: 'Backend offline' },
  checking: { dot: 'bg-amber-400 animate-pulse', text: 'text-gray-400', label: 'Checking…' },
};

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout, hasPermission, canFeature } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const userMenuRef = useRef(null);
  const health = useBackendHealth();
  const healthMeta = HEALTH_META[health] ?? HEALTH_META.checking;

  // Deep-link support for Ctrl+K search: scroll to & highlight #hash targets.
  useScrollToHash();

  // Ctrl+K / Cmd+K toggles the command palette from anywhere
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // Close the user menu when clicking outside or pressing Escape
  useEffect(() => {
    if (!userMenuOpen) return;
    const onDocClick = (e) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
        setUserMenuOpen(false);
      }
    };
    const onKey = (e) => { if (e.key === 'Escape') setUserMenuOpen(false); };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [userMenuOpen]);

  async function handleLogout() {
    setUserMenuOpen(false);
    await logout();
    navigate('/login', { replace: true });
  }

  // Initials for the avatar (fallback to "?")
  const initials = (() => {
    const src = user?.fullName || user?.username || '';
    if (!src) return '?';
    const parts = src.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  })();

  // Best role to display (admin > operator > viewer > first one we have)
  const displayRole = (() => {
    if (!user?.roles?.length) return null;
    const order = ['admin', 'operator', 'viewer'];
    for (const k of order) {
      const r = user.roles.find((x) => x.key === k);
      if (r) return r;
    }
    return user.roles[0];
  })();

  return (
    <div className="min-h-screen flex bg-[#0f1117]">
      {/* ── Sidebar ── */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex flex-col w-64 bg-[#13151c] border-r border-white/5
          transform transition-transform duration-300 ease-in-out
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 lg:flex`}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-6 h-16 border-b border-white/5 flex-shrink-0">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
            </svg>
          </div>
          <div>
            <span className="text-white font-bold text-lg tracking-tight">Modbus</span>
            <span className="text-blue-400 font-bold text-lg tracking-tight"> Hub</span>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-6 overflow-y-auto">
          {(() => {
            // Drop entries the current user can't access, then group by section.
            const canSee = (i) => !i.feature || canFeature(i.feature);
            const visible = NAV_ITEMS.filter(canSee);
            const groups = [];
            let current = null;
            visible.forEach((item) => {
              const section = item.section || 'Navigation';
              if (!current || current.name !== section) {
                current = { name: section, items: [] };
                groups.push(current);
              }
              current.items.push(item);
            });

            return groups.map((g, gi) => (
              <div key={g.name} className={gi > 0 ? 'mt-6' : ''}>
                <p className="px-3 mb-3 text-[10px] font-semibold uppercase tracking-widest text-gray-500">
                  {g.name}
                </p>
                <div className="space-y-1">
                  {g.items.map(({ to, label, labelFor, icon }) => {
                    const active =
                      to === '/' ? location.pathname === '/' : location.pathname.startsWith(to);
                    const shownLabel = labelFor ? labelFor(hasPermission) : label;
                    return (
                      <Link
                        key={to}
                        to={to}
                        onClick={() => setSidebarOpen(false)}
                        aria-current={active ? 'page' : undefined}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200
                          ${active
                            ? 'bg-blue-500/15 text-blue-400 shadow-sm'
                            : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
                          }`}
                      >
                        <span className={active ? 'text-blue-400' : 'text-gray-500'}>{icon}</span>
                        {shownLabel}
                        {active && (
                          <span className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-400" />
                        )}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ));
          })()}
        </nav>

        {/* Footer — surfaced only when the backend is NOT healthy; a steady
            "online" badge here was redundant noise. */}
        {health !== 'online' && (
          <div className="px-4 py-4 border-t border-white/5">
            <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-white/5" role="status" aria-live="polite">
              <span className={`w-2 h-2 rounded-full ${healthMeta.dot}`} />
              <span className={`text-xs ${healthMeta.text}`}>{healthMeta.label}</span>
            </div>
          </div>
        )}
      </aside>

      {/* Overlay for mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Main area ── */}
      <div className="flex-1 flex flex-col min-h-screen min-w-0">
        {/* Top bar */}
        <header className="sticky top-0 z-20 flex items-center justify-between h-16 px-6 bg-[#0f1117]/90 backdrop-blur border-b border-white/5">
          {/* Mobile menu toggle */}
          <button
            className="lg:hidden p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
            onClick={() => setSidebarOpen((v) => !v)}
            aria-label="Toggle navigation menu"
            aria-expanded={sidebarOpen}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          {/* Page title from nav */}
          <div className="hidden lg:block">
            <span className="text-sm font-medium text-gray-400">
              {(() => {
                const item = NAV_ITEMS
                  .filter((i) => !i.feature || canFeature(i.feature))
                  .find(({ to }) =>
                    to === '/' ? location.pathname === '/' : location.pathname.startsWith(to)
                  );
                if (!item) return '';
                return item.labelFor ? item.labelFor(hasPermission) : item.label;
              })()}
            </span>
          </div>

          {/* Right side */}
          <div className="flex items-center gap-3 ml-auto">
            {/* Command palette trigger */}
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10
                text-xs text-gray-500 hover:text-gray-300 hover:bg-white/10 transition-colors"
              aria-label="Open command palette"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              Search
              <kbd className="px-1.5 py-0.5 rounded-md bg-white/5 border border-white/10 text-[10px]">Ctrl K</kbd>
            </button>

            {/* Health chip — shown only when the backend is offline/checking;
                a permanent "online" chip was redundant with the rest of the UI. */}
            {health !== 'online' && (
              <div
                className={`hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border text-xs ${healthMeta.text} ${
                  health === 'offline' ? 'border-red-500/30 bg-red-500/5' : 'border-white/10'
                }`}
                role="status"
                aria-live="polite"
              >
                <span className={`w-1.5 h-1.5 rounded-full ${healthMeta.dot}`} />
                {healthMeta.label}
              </div>
            )}

            {/* User menu */}
            <div className="relative" ref={userMenuRef}>
              <button
                type="button"
                onClick={() => setUserMenuOpen((v) => !v)}
                className="flex items-center gap-2 pl-2 pr-2.5 py-1 rounded-full hover:bg-white/5 transition-colors"
                aria-label="User menu"
                aria-haspopup="menu"
                aria-expanded={userMenuOpen}
              >
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center text-white text-xs font-bold shadow">
                  {initials}
                </div>
                <div className="hidden sm:flex flex-col items-start leading-tight">
                  <span className="text-xs text-white font-medium">
                    {user?.fullName || user?.username || 'User'}
                  </span>
                  {displayRole && (
                    <span className="text-[10px] text-gray-500 uppercase tracking-wider">
                      {displayRole.name || displayRole.key}
                    </span>
                  )}
                </div>
                <svg className={`w-3.5 h-3.5 text-gray-500 transition-transform ${userMenuOpen ? 'rotate-180' : ''}`}
                     fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {userMenuOpen && (
                <div className="absolute right-0 mt-2 w-60 bg-[#13151c] border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50">
                  <div className="px-4 py-3 border-b border-white/5">
                    <div className="text-sm text-white font-medium truncate">
                      {user?.fullName || user?.username || 'User'}
                    </div>
                    <div className="text-xs text-gray-500 truncate">{user?.email}</div>
                  </div>

                  {user?.roles?.length > 0 && (
                    <div className="px-4 py-2 border-b border-white/5">
                      <div className="text-[10px] uppercase tracking-wider text-gray-600 mb-1">Roles</div>
                      <div className="flex flex-wrap gap-1">
                        {user.roles.map((r, i) => (
                          <span
                            key={`${r.key}-${r.projectId ?? 'g'}-${i}`}
                            className="px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-400 text-[10px] font-medium"
                            title={r.projectId ? `Scoped to project ${r.projectId}` : 'Global'}
                          >
                            {r.name || r.key}
                            {r.projectId && <span className="text-blue-300/60 ml-1">·P{r.projectId}</span>}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-gray-300 hover:bg-white/5 hover:text-red-300 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                    Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Page content — data-pe-root/route anchor the global visual editor's
            per-page element selectors. */}
        <main className="flex-1 p-6 overflow-auto" data-pe-root data-pe-route={location.pathname}>
          <Outlet />
        </main>
      </div>

      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}

      {/* Admin-only visual page editor (self-gates; renders nothing for others) */}
      <GlobalEditLayer />
      <EditToolbar />
    </div>
  );
}
