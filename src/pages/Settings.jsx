import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { systemSettingsApi, defaultSettings } from '../api/settings.js';
import { useSettings } from '../context/SettingsContext.jsx';
import { useToast, useConfirm } from '../context/useFeedback.js';
import Editable from '../components/pageedit/Editable.jsx';

const TABS = [
  {
    id: 'fuel',
    label: 'Fuel & Alarms',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
          d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    id: 'connection',
    label: 'Connection',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
          d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    id: 'display',
    label: 'Display',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
          d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    ),
  },
];

function Field({ id, label, hint, children }) {
  return (
    <div id={id} className="space-y-1.5 scroll-mt-24">
      <label className="block text-sm font-medium text-gray-300">{label}</label>
      {children}
      {hint && <p className="text-xs text-gray-500">{hint}</p>}
    </div>
  );
}

function NumberInput({ value, onChange, min, max, step }) {
  return (
    <input
      type="number"
      min={min} max={max} step={step}
      value={value}
      onChange={onChange}
      className="w-full px-4 py-2.5 rounded-xl bg-[#0f1117] border border-white/10 text-gray-200 text-sm
        focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/50 transition-colors"
    />
  );
}

function Toggle({ checked, onChange, label }) {
  return (
    <label className="flex items-center gap-3 cursor-pointer select-none group">
      <div
        onClick={() => onChange(!checked)}
        className={`relative w-11 h-6 rounded-full transition-colors duration-200 flex-shrink-0
          ${checked ? 'bg-blue-600' : 'bg-white/10'}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200
            ${checked ? 'translate-x-5' : 'translate-x-0'}`}
        />
      </div>
      <span className="text-sm text-gray-300 group-hover:text-gray-100 transition-colors">{label}</span>
    </label>
  );
}

function SelectInput({ value, onChange, options }) {
  return (
    <select
      value={value}
      onChange={onChange}
      className="w-full px-4 py-2.5 rounded-xl bg-[#0f1117] border border-white/10 text-gray-200 text-sm
        focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/50 transition-colors"
    >
      {options.map(([val, lab]) => (
        <option key={val} value={val}>{lab}</option>
      ))}
    </select>
  );
}

function SectionCard({ title, icon, accent = 'border-white/5', children }) {
  return (
    <div className={`rounded-2xl bg-[#1a1d27] border ${accent} p-6 space-y-5`}>
      <div className="flex items-center gap-2.5 mb-1">
        <span className="text-gray-400">{icon}</span>
        <h3 className="text-base font-semibold text-gray-200">{title}</h3>
      </div>
      {children}
    </div>
  );
}

export default function Settings() {
  const { settings: contextSettings, loading: contextLoading, updateSettings } = useSettings();
  const toast = useToast();
  const confirm = useConfirm();
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
const [error, setError] = useState('');

  // The Ctrl+K search deep-links to a specific setting via ?tab=<id> so the
  // right tab is open when useScrollToHash scrolls to the field. Sync the active
  // tab to the param during render (React's "adjust state on prop change"
  // pattern) so a search launched while already on this page still switches tab.
  const [searchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const validTab = TABS.some((t) => t.id === tabParam) ? tabParam : null;
  const [activeTab, setActiveTab] = useState(validTab || 'fuel');
  const [seenTabParam, setSeenTabParam] = useState(validTab);
  if (validTab && validTab !== seenTabParam) {
    setSeenTabParam(validTab);
    setActiveTab(validTab);
  }

  useEffect(() => {
    if (!contextLoading && contextSettings && Object.keys(contextSettings).length > 0) {
      setSettings(contextSettings);
      setLoading(false);
    }
  }, [contextSettings, contextLoading]);

  useEffect(() => {
    if (contextSettings && Object.keys(contextSettings).length > 0) {
      setSettings(contextSettings);
    }
  }, [contextSettings]);

  const set = (key, value) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      await updateSettings(settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError('Save failed: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (await confirm({
      title: 'Reset settings',
      message: 'Reset all settings to defaults?',
      confirmLabel: 'Reset',
      danger: true,
    })) {
      setSettings({ ...defaultSettings });
      setSaved(false);
      toast.info('Settings reset to defaults — remember to save.');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 rounded-full border-2 border-blue-500/30 border-t-blue-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-3xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <Editable id="settings.title" as="h1" className="text-2xl font-bold text-white tracking-tight">Settings</Editable>
          <Editable id="settings.subtitle" as="p" className="text-sm text-gray-400 mt-1">Configure alarms, connection and display options.</Editable>
        </div>
<div className="flex gap-2">
          <button
            onClick={handleReset}
            className="px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-gray-300 text-sm font-medium hover:bg-white/10 transition-colors"
          >
            Reset
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-500 disabled:opacity-50 transition-colors shadow"
          >
            {saving ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Saving…
              </>
            ) : 'Save Settings'}
          </button>
        </div>
      </div>

      {/* Feedback */}
      {error && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {error}
        </div>
      )}
      {saved && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm">
          <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          Settings saved successfully.
        </div>
      )}

      {/* Tab bar */}
      <div className="flex gap-1 p-1 rounded-xl bg-[#1a1d27] border border-white/5">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 flex-1 justify-center px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200
              ${activeTab === tab.id
                ? 'bg-blue-600 text-white shadow'
                : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
              }`}
          >
            {tab.icon}
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* ── FUEL TAB ── */}
      {activeTab === 'fuel' && (
        <div className="space-y-5">
          <SectionCard
            title="Tank Level Alerts"
            accent="border-amber-500/15"
            icon={
              <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            }
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <Field id="set-low-threshold" label="Low Tank Warning (%)" hint="Trigger warning when tank drops below this level">
                <NumberInput
                  value={settings.LOW_TANK_THRESHOLD ?? 20}
                  min={0} max={100}
                  onChange={(e) => set('LOW_TANK_THRESHOLD', parseInt(e.target.value) || 0)}
                />
              </Field>
              <Field id="set-critical-threshold" label="Critical Tank Level (%)" hint="Critical alert — immediate attention needed">
                <NumberInput
                  value={settings.CRITICAL_TANK_THRESHOLD ?? 10}
                  min={0} max={100}
                  onChange={(e) => set('CRITICAL_TANK_THRESHOLD', parseInt(e.target.value) || 0)}
                />
              </Field>
              <Field id="set-alarm-cooldown" label="Re-alarm Cooldown" hint="After accepting an alarm, how long before the same alarm fires again if the condition persists">
                <SelectInput
                  value={String(settings.ALARM_COOLDOWN_MINUTES ?? 60)}
                  onChange={(e) => set('ALARM_COOLDOWN_MINUTES', parseInt(e.target.value))}
                  options={[
                    ['5',   '5 minutes'],
                    ['15',  '15 minutes'],
                    ['30',  '30 minutes'],
                    ['60',  '1 hour'],
                    ['120', '2 hours'],
                    ['240', '4 hours'],
                    ['480', '8 hours'],
                  ]}
                />
              </Field>
            </div>
          </SectionCard>

          <SectionCard
            title="Tank Capacity"
            accent="border-emerald-500/15"
            icon={
              <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                  d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            }
          >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              <Field id="set-tank-capacity" label="Tank Capacity" hint="Maximum fuel tank capacity">
                <NumberInput
                  value={settings.TANK_CAPACITY_LITERS ?? 1000}
                  min={0} max={100000}
                  onChange={(e) => set('TANK_CAPACITY_LITERS', parseInt(e.target.value) || 0)}
                />
              </Field>
              <Field id="set-tank-unit" label="Display Unit">
                <SelectInput
                  value={settings.TANK_CAPACITY_UNIT ?? 'liters'}
                  onChange={(e) => set('TANK_CAPACITY_UNIT', e.target.value)}
                  options={[['liters', 'Liters (L)'], ['gallons', 'Gallons (gal)'], ['percentage', 'Percentage (%)']]}
                />
              </Field>
              <div className="flex items-end pb-0.5">
                <Toggle
                  checked={settings.SHOW_TANK_AS_PERCENTAGE ?? true}
                  onChange={(v) => set('SHOW_TANK_AS_PERCENTAGE', v)}
                  label="Show as %"
                />
              </div>
            </div>
          </SectionCard>

          <SectionCard
            title="Consumption Rate"
            accent="border-orange-500/15"
            icon={
              <svg className="w-5 h-5 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                  d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            }
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <Field id="set-consumption-threshold" label="Consumption Rate Threshold (%/hr)" hint="Alert if consumption exceeds this rate">
                <NumberInput
                  value={settings.CONSUMPTION_RATE_THRESHOLD ?? 5}
                  min={0} max={100} step={0.1}
                  onChange={(e) => set('CONSUMPTION_RATE_THRESHOLD', parseFloat(e.target.value) || 0)}
                />
              </Field>
              <div id="set-fuel-alerts" className="flex items-end pb-1 scroll-mt-24">
                <Toggle
                  checked={settings.FUEL_ALERTS_ENABLED ?? true}
                  onChange={(v) => set('FUEL_ALERTS_ENABLED', v)}
                  label="Enable Fuel Alerts"
                />
              </div>
            </div>
          </SectionCard>
        </div>
      )}

      {/* ── CONNECTION TAB ── */}
      {activeTab === 'connection' && (
        <div className="space-y-5">
          <SectionCard
            title="Connection Settings"
            accent="border-blue-500/15"
            icon={
              <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                  d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            }
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <Field id="set-default-port" label="Default Port" hint="Standard Modbus TCP port is 502">
                <NumberInput
                  value={settings.DEFAULT_PORT ?? 502}
                  min={1} max={65535}
                  onChange={(e) => set('DEFAULT_PORT', parseInt(e.target.value) || 502)}
                />
              </Field>
              <Field id="set-connection-timeout" label="Connection Timeout (ms)" hint="Time to wait before failing a connection attempt">
                <NumberInput
                  value={settings.CONNECTION_TIMEOUT ?? 5000}
                  min={1000} max={60000} step={1000}
                  onChange={(e) => set('CONNECTION_TIMEOUT', parseInt(e.target.value) || 5000)}
                />
              </Field>
              <Field id="set-retry-attempts" label="Retry Attempts" hint="How many times to retry a failed connection">
                <NumberInput
                  value={settings.RETRY_ATTEMPTS ?? 3}
                  min={0} max={10}
                  onChange={(e) => set('RETRY_ATTEMPTS', parseInt(e.target.value) || 3)}
                />
              </Field>
              <div id="set-auto-reconnect" className="flex items-end pb-1 scroll-mt-24">
                <Toggle
                  checked={settings.AUTO_RECONNECT ?? false}
                  onChange={(v) => set('AUTO_RECONNECT', v)}
                  label="Auto-reconnect on disconnect"
                />
              </div>
            </div>
          </SectionCard>
        </div>
      )}

      {/* ── DISPLAY TAB ── */}
      {activeTab === 'display' && (
        <div className="space-y-5">
          <SectionCard
            title="Display & Project Settings"
            accent="border-purple-500/15"
            icon={
              <svg className="w-5 h-5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                  d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            }
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div id="set-show-offline" className="flex items-center scroll-mt-24">
                <Toggle
                  checked={settings.SHOW_OFFLINE_DEVICES ?? true}
                  onChange={(v) => set('SHOW_OFFLINE_DEVICES', v)}
                  label="Show Offline Devices"
                />
              </div>
              <Field id="set-default-view" label="Default Project View">
                <SelectInput
                  value={settings.DEFAULT_PROJECT_VIEW ?? 'expanded'}
                  onChange={(e) => set('DEFAULT_PROJECT_VIEW', e.target.value)}
                  options={[['expanded', 'Expanded'], ['compact', 'Compact']]}
                />
              </Field>
            </div>
          </SectionCard>
        </div>
      )}

{/* Info footer */}
      <p className="text-xs text-center text-gray-600">
        Settings are persisted in the Oracle database and cached in localStorage.
      </p>
    </div>
  );
}
