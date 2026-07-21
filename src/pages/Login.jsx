// ============================================================================
// Login page — username/email + password form.
// On success, navigates back to wherever the user was trying to go (or "/").
// ============================================================================

import { useState } from 'react';
import { useLocation, useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth.js';
import { motion } from 'framer-motion';
import { spring } from '../lib/motion.js';

export default function Login() {
  const { login, isAuthenticated, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const redirectTo = location.state?.from?.pathname || '/';

  const [loginValue, setLoginValue] = useState('');
  const [password, setPassword]     = useState('');
  const [showPassword, setShowPassword] = useState(false);
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
      <motion.div {...spring.entrance} className="w-full max-w-md">
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
            <label htmlFor="login-username" className="block text-xs font-medium text-gray-400 mb-1.5">
              Username or email
            </label>
            <input
              id="login-username"
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
            <label htmlFor="login-password" className="block text-xs font-medium text-gray-400 mb-1.5">
              Password
            </label>
            <div className="relative">
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={submitting}
                className="w-full pl-3 pr-11 py-2.5 bg-[#0f1117] border border-white/10 rounded-lg text-white text-sm
                           placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500
                           disabled:opacity-50"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                disabled={submitting}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-500 hover:text-gray-300 transition-colors"
              >
                {showPassword ? (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                      d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                      d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {error && (
            <div role="alert" className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-xs">
              {error}
            </div>
          )}

          <motion.button
            type="submit"
            disabled={submitting}
            {...spring.hover}
            {...spring.press}
            className="w-full px-4 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-700/40
                       text-white text-sm font-semibold rounded-lg transition-colors
                       flex items-center justify-center gap-2"
          >
            {submitting && (
              <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            )}
            {submitting ? 'Signing in…' : 'Sign in'}
          </motion.button>
        </form>

        <p className="text-center text-xs text-gray-600 mt-6">
          Need an account? Contact your administrator.
        </p>
      </motion.div>
    </div>
  );
}
