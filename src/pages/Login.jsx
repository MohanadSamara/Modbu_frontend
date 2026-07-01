// ============================================================================
// Login page — username/email + password form.
// On success, navigates back to wherever the user was trying to go (or "/").
// ============================================================================

import { useState } from 'react';
import { useLocation, useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth.js';

export default function Login() {
  const { login, isAuthenticated, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const redirectTo = location.state?.from?.pathname || '/';

  const [loginValue, setLoginValue] = useState('');
  const [password, setPassword]     = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState(null);

  // Already logged in? Bounce away from /login.
  if (!loading && isAuthenticated) return <Navigate to={redirectTo} replace />;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!loginValue || !password) {
      setError('Please enter your username and password.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await login(loginValue.trim(), password);
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError(err.detail || err.message || 'Login failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0f1117] p-6">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex flex-col items-center gap-3 mb-8">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
            </svg>
          </div>
          <div className="text-center">
            <h1 className="text-white text-2xl font-bold tracking-tight">
              Modbus<span className="text-blue-400"> Hub</span>
            </h1>
            <p className="text-gray-500 text-sm mt-1">Sign in to continue</p>
          </div>
        </div>

        {/* Form */}
        <form
          onSubmit={handleSubmit}
          className="bg-[#13151c] border border-white/5 rounded-2xl p-6 space-y-4 shadow-xl"
        >
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">
              Username or email
            </label>
            <input
              type="text"
              autoComplete="username"
              value={loginValue}
              onChange={(e) => setLoginValue(e.target.value)}
              disabled={submitting}
              className="w-full px-3 py-2.5 bg-[#0f1117] border border-white/10 rounded-lg text-white text-sm
                         placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500
                         disabled:opacity-50"
              placeholder="admin"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">
              Password
            </label>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={submitting}
              className="w-full px-3 py-2.5 bg-[#0f1117] border border-white/10 rounded-lg text-white text-sm
                         placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500
                         disabled:opacity-50"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-xs">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full px-4 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-700/40
                       text-white text-sm font-semibold rounded-lg transition-colors
                       flex items-center justify-center gap-2"
          >
            {submitting && (
              <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            )}
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="text-center text-xs text-gray-600 mt-6">
          Need an account? Contact your administrator.
        </p>
      </div>
    </div>
  );
}
