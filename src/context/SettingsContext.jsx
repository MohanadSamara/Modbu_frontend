import { createContext, useContext, useState, useEffect } from 'react';
import { systemSettingsApi, defaultSettings } from '../api/settings.js';
import { useAuth } from './useAuth.js';

const SettingsContext = createContext();

const STORAGE_KEY = 'modbus-settings';

function loadFromStorage() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : null;
  } catch {
    return null;
  }
}

function saveToStorage(settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage errors
  }
}

export function SettingsProvider({ children }) {
  // Auth state — settings can only come from the API once the user is
  // authenticated. Before that, we show localStorage / defaults.
  // useAuth() throws if called outside AuthProvider, so we guard.
  let authState = { isAuthenticated: false, loading: false };
  try {
    authState = useAuth();
  } catch {
    // AuthProvider not ready yet - use defaults
    authState = { isAuthenticated: false, loading: true };
  }

  const { isAuthenticated, loading: authLoading } = authState;

  // Load from localStorage first for instant availability
  const [settings, setSettings] = useState(() => {
    const stored = loadFromStorage();
    if (stored && typeof stored === 'object' && Object.keys(stored).length > 0) {
      return stored;
    }
    return { ...defaultSettings };
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Re-fetch from the API whenever auth state changes:
  //   • on first login -> pull fresh server-side settings
  //   • on logout      -> revert to defaults so a different user signing
  //                       in next doesn't briefly see the previous one's data
  useEffect(() => {
    if (authLoading) return; // wait for auth to settle
    if (!isAuthenticated) {
      // Logged out — keep localStorage cache available but mark not-loading
      setLoading(false);
      return;
    }
    loadSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, authLoading]);

  const loadSettings = async () => {
    try {
      const data = await systemSettingsApi.get();
      const merged = { ...defaultSettings, ...data };
      setSettings(merged);
      saveToStorage(merged); // Cache to localStorage
      setError(null);
    } catch (err) {
      // Don't spam — most "failures" here are simply 401s during login bring-up
      setError(err.message);
      const cached = loadFromStorage();
      const fallback = cached || { ...defaultSettings };
      setSettings(fallback);
    } finally {
      setLoading(false);
    }
  };

const updateSettings = async (newSettings) => {
    // Merge new values on top of current state
    const merged = { ...settings, ...newSettings };
    try {
      // Send the full merged object so every key (including fuel alarm keys)
      // is persisted to the DB, not just the subset that changed.
      await systemSettingsApi.update(merged);
      setSettings(merged);
      saveToStorage(merged);
    } catch (err) {
      console.error('Update settings failed:', err.message);
      // Still update locally even if backend fails
      setSettings(merged);
      saveToStorage(merged);
      throw err;
    }
  };

  const value = {
    settings,
    loading,
    loadSettings,
    updateSettings
  };

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) {
    // Return default settings instead of throwing error
    return {
      settings: defaultSettings,
      loading: true,
      loadSettings: async () => {},
      updateSettings: async () => {}
    };
  }
  return context;
}
