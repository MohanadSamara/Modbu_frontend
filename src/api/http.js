// ============================================================================
// http.js — single fetch wrapper used by every other api/* module.
//
// Responsibilities:
//   • inject `Authorization: Bearer <accessToken>` from in-memory storage
//   • on a 401, transparently call /api/auth/refresh once and retry
//   • parse JSON / throw rich errors with backend `error` / `detail` text
//   • surface auth failures to the UI via a callback (set by AuthProvider)
//
// Tokens:
//   • access token  — kept in memory only (lost on hard reload, that's fine —
//     we use the refresh token to mint a new one on first request)
//   • refresh token — stored in sessionStorage: it survives an in-tab reload
//     (so navigating around / refreshing keeps you signed in) but is cleared
//     when the tab/browser is closed, so ending the site requires a re-login.
// ============================================================================

const API_BASE = '/api';
const REFRESH_KEY = 'modbus.refreshToken';

// Session-scoped storage for the refresh token. Falls back to an in-memory
// shim if sessionStorage is unavailable (e.g. privacy modes), which still
// clears on tab close — matching the desired "log out when the site ends".
const tokenStore =
  typeof sessionStorage !== 'undefined' ? sessionStorage : {
    _v: null,
    getItem() { return this._v; },
    setItem(_k, v) { this._v = v; },
    removeItem() { this._v = null; },
  };

// One-time migration: older builds persisted the refresh token in localStorage,
// which kept users logged in across browser restarts. Drop it on load so that
// stale long-lived session can't survive — sessions now end when the tab closes.
try { localStorage.removeItem(REFRESH_KEY); } catch { /* ignore */ }

// ── Token storage ─────────────────────────────────────────────────────────
let _accessToken = null;
let _onAuthFailed = null; // set by AuthProvider; called when refresh fails

export function setAccessToken(token) {
  _accessToken = token || null;
}

export function getAccessToken() {
  return _accessToken;
}

export function setRefreshToken(token) {
  if (token) tokenStore.setItem(REFRESH_KEY, token);
  else       tokenStore.removeItem(REFRESH_KEY);
}

export function getRefreshToken() {
  return tokenStore.getItem(REFRESH_KEY);
}

export function clearTokens() {
  _accessToken = null;
  tokenStore.removeItem(REFRESH_KEY);
  // Clean up any token left in localStorage by an older build so a stale
  // long-lived session can't resurrect a login after this change.
  try { localStorage.removeItem(REFRESH_KEY); } catch { /* ignore */ }
}

export function setAuthFailedHandler(fn) {
  _onAuthFailed = fn;
}

// ── Refresh-token logic ───────────────────────────────────────────────────
// Coalesce concurrent 401s: if N requests fail at once, only ONE refresh
// call goes out. Everyone else awaits the same promise.
let _refreshInflight = null;

async function _refreshAccessToken() {
  if (_refreshInflight) return _refreshInflight;

  const refresh = getRefreshToken();
  if (!refresh) return null;

  _refreshInflight = (async () => {
    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: refresh }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      _accessToken = data.accessToken;
      // Server rotates refresh tokens — store the new one
      if (data.refreshToken) setRefreshToken(data.refreshToken);
      return _accessToken;
    } catch {
      return null;
    } finally {
      _refreshInflight = null;
    }
  })();

  return _refreshInflight;
}

// Public wrapper so callers (e.g. AuthProvider on first mount) can proactively
// mint an access token from the stored refresh token *before* making an
// authenticated request — avoiding an expected 401 on the very first call.
// Returns the new access token, or null if there's no/invalid refresh token.
export async function refreshAccessToken() {
  return _refreshAccessToken();
}

// ── Error helpers ─────────────────────────────────────────────────────────
async function parseErrorBody(res) {
  try {
    const body = await res.clone().json();
    return body?.error || body?.detail || body?.message || '';
  } catch {
    try { return (await res.text())?.trim() || ''; }
    catch { return ''; }
  }
}

async function buildError(prefix, res) {
  const detail = await parseErrorBody(res);
  const suffix = detail ? ` — ${detail}` : '';
  const err = new Error(`${prefix}: ${res.status} ${res.statusText}${suffix}`);
  err.status = res.status;
  err.detail = detail;
  return err;
}

// ── Core request ──────────────────────────────────────────────────────────
/**
 * Make an authenticated request to /api/<path>.
 *
 * @param {string} path        e.g. "/devices" or "/modbus/fuel"
 * @param {object} opts
 * @param {string} opts.method        default 'GET'
 * @param {object} opts.body          will be JSON.stringified
 * @param {object} opts.query         appended as ?k=v
 * @param {string} opts.prefix        error prefix for thrown messages
 * @param {number} opts.timeoutMs     default 10000
 * @param {AbortSignal} opts.signal   external abort signal
 * @param {boolean} opts.skipAuth     don't attach Authorization (for /auth/login)
 */
export async function request(path, opts = {}) {
  const {
    method = 'GET',
    body,
    query,
    prefix = 'Request failed',
    timeoutMs = 10000,
    signal: externalSignal,
    skipAuth = false,
  } = opts;

  let url = `${API_BASE}${path}`;
  if (query && typeof query === 'object') {
    const qs = new URLSearchParams();
    Object.entries(query).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') qs.append(k, v);
    });
    if (qs.toString()) url += `?${qs.toString()}`;
  }

  const doFetch = async (token) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    if (externalSignal) {
      if (externalSignal.aborted) ctrl.abort();
      else externalSignal.addEventListener('abort', () => ctrl.abort(), { once: true });
    }

    const headers = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (!skipAuth && token) headers['Authorization'] = `Bearer ${token}`;

    try {
      const res = await fetch(url, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: ctrl.signal,
      });
      return res;
    } finally {
      clearTimeout(timer);
    }
  };

  let res;
  try {
    res = await doFetch(_accessToken);
  } catch (err) {
    if (err?.name === 'AbortError') {
      throw new Error(`${prefix}: request timed out after ${timeoutMs}ms (${url})`, { cause: err });
    }
    throw new Error(
      `${prefix}: network error while requesting ${url}. ` +
      `Ensure backend is running (proxy target: http://localhost:3000).`,
      { cause: err }
    );
  }

  // If the server says our access token is bad, try to refresh once.
  if (!skipAuth && res.status === 401) {
    const newToken = await _refreshAccessToken();
    if (newToken) {
      try {
        res = await doFetch(newToken);
      } catch (err) {
        if (err?.name === 'AbortError') {
          throw new Error(`${prefix}: request timed out after ${timeoutMs}ms (${url})`, { cause: err });
        }
        throw err;
      }
    }
    // Still 401 (or refresh failed) → tell the app to log out.
    if (res.status === 401) {
      clearTokens();
      if (_onAuthFailed) _onAuthFailed();
      throw await buildError(prefix, res);
    }
  }

  if (!res.ok) throw await buildError(prefix, res);
  if (res.status === 204) return null;

  try {
    return await res.json();
  } catch {
    throw new Error(`${prefix}: invalid JSON response from ${url}`);
  }
}

export default { request, setAccessToken, getAccessToken, setRefreshToken, getRefreshToken, clearTokens, setAuthFailedHandler, refreshAccessToken };
