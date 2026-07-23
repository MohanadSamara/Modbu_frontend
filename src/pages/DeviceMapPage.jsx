import { useEffect, useMemo, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { modbusApi } from '../api/modbus.js';
import { devicesApi } from '../api/projects.js';
import { useAuth } from '../context/useAuth.js';
import DeviceMap from '../components/DeviceMap.jsx';
import { dedupeByConnection } from '../lib/dedupeDevices.js';
import { SkeletonList } from '../components/Skeleton.jsx';
import Editable from '../components/pageedit/Editable.jsx';

function num(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizeDevice(d) {
  return {
    id: d.id ?? d.ID,
    name: d.name ?? d.NAME ?? 'Unnamed device',
    ip: d.ip ?? d.IP ?? null,
    port: d.port ?? d.PORT ?? null,
    status: (d.status ?? d.STATUS ?? 'offline').toString().toLowerCase(),
    latitude: num(d.latitude ?? d.LATITUDE),
    longitude: num(d.longitude ?? d.LONGITUDE),
  };
}

function hasGps(d) {
  return (
    typeof d.latitude === 'number' &&
    typeof d.longitude === 'number' &&
    Math.abs(d.latitude) <= 90 &&
    Math.abs(d.longitude) <= 180 &&
    !(d.latitude === 0 && d.longitude === 0)
  );
}

function Field({ label, value, mono = false }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-gray-600 mb-0.5">{label}</p>
      <p className={`text-sm text-gray-200 ${mono ? 'font-mono' : ''}`}>{value}</p>
    </div>
  );
}

export default function DeviceMapPage() {
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('device.write');
  const navigate = useNavigate();

  // Open this device's details on the Projects page. Projects restores its
  // selection from the stable backend device id stored in localStorage, so we
  // seed it here, then navigate.
  const openInProjects = (d) => {
    if (d?.id != null) {
      try {
        localStorage.setItem('projects-sel-device-bid', String(d.id));
        localStorage.removeItem('projects-sel-location-bid');
        localStorage.removeItem('projects-sel-project-bid');
      } catch { /* ignore storage errors */ }
    }
    navigate('/projects');
  };

  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  // Selected device is kept in the URL (?device=id) for deep-linking/sharing.
  const [params, setParams] = useSearchParams();
  const selectedId = params.get('device');

  // Location-placement state.
  const [placingId, setPlacingId] = useState(null);   // device id being located
  const [draft, setDraft] = useState(null);           // { lat, lng }
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [locating, setLocating] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    modbusApi
      .getDevices()
      .then((rows) => {
        if (cancelled) return;
        // One marker per PHYSICAL device (duplicate rows collapse).
        setDevices(dedupeByConnection((rows ?? []).map(normalizeDevice)));
        setError('');
      })
      .catch((err) => { if (!cancelled) setError(err.message || 'Failed to load devices'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [reloadKey]);

  const placingDevice = devices.find((d) => String(d.id) === String(placingId)) || null;

  const startPlacing = (d) => {
    setPlacingId(d.id);
    setDraft(hasGps(d) ? { lat: d.latitude, lng: d.longitude } : null);
    setSaveError('');
  };
  const cancelPlacing = () => { setPlacingId(null); setDraft(null); setSaveError(''); };

  const onMapClick = (latlng) => {
    if (placingId == null) return;
    setDraft(latlng);
    setSaveError('');
  };

  // Fill the draft from the browser's current position (for quick testing).
  const useMyLocation = () => {
    if (!('geolocation' in navigator)) {
      setSaveError('Geolocation is not supported by this browser');
      return;
    }
    setLocating(true);
    setSaveError('');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setDraft({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
      },
      (err) => {
        const msg =
          err.code === err.PERMISSION_DENIED
            ? 'Location permission denied — allow it in your browser, then try again'
            : err.code === err.POSITION_UNAVAILABLE
              ? 'Your location is unavailable right now'
              : err.code === err.TIMEOUT
                ? 'Getting your location timed out — try again'
                : 'Could not get your location';
        setSaveError(msg);
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const saveLocation = async () => {
    if (placingId == null || !draft || typeof draft.lat !== 'number' || typeof draft.lng !== 'number') return;
    setSaving(true);
    setSaveError('');
    try {
      await devicesApi.update(placingId, { latitude: draft.lat, longitude: draft.lng });
      cancelPlacing();
      setReloadKey((k) => k + 1); // re-fetch so the new pin appears
    } catch (err) {
      setSaveError(err.message || 'Failed to save location');
    } finally {
      setSaving(false);
    }
  };

  const online = devices.filter((d) => d.status === 'online').length;
  const located = devices.filter(hasGps);

  // Located devices first (online before offline), then name; matches search.
  const listed = useMemo(() => {
    const q = search.trim().toLowerCase();
    return devices
      .filter((d) => {
        if (!q) return true;
        return (
          d.name.toLowerCase().includes(q) ||
          String(d.id ?? '').toLowerCase().includes(q) ||
          (d.ip ?? '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        const ga = hasGps(a) ? 0 : 1;
        const gb = hasGps(b) ? 0 : 1;
        if (ga !== gb) return ga - gb;
        if (a.status !== b.status) return a.status === 'online' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  }, [devices, search]);

  const select = (d) => {
    if (!hasGps(d)) return; // can't focus a device with no coordinates
    const next = new URLSearchParams(params);
    if (String(selectedId) === String(d.id)) next.delete('device');
    else next.set('device', String(d.id));
    setParams(next, { replace: true });
  };

  // Coerce selectedId (string from URL) to the device's id type for fly-to.
  const selectedForMap = useMemo(() => {
    if (selectedId == null) return null;
    const match = located.find((d) => String(d.id) === String(selectedId));
    return match ? match.id : null;
  }, [selectedId, located]);

  // The full device object for the detail card.
  const selectedDevice = useMemo(
    () => devices.find((d) => String(d.id) === String(selectedId)) || null,
    [devices, selectedId]
  );

  // Marker/row click → always select (show its card + fly to it).
  const selectById = (id) => {
    const next = new URLSearchParams(params);
    next.set('device', String(id));
    setParams(next, { replace: true });
  };
  const deselect = () => {
    const next = new URLSearchParams(params);
    next.delete('device');
    setParams(next, { replace: true });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-4 animate-slide-up">
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-xl bg-cyan-500/15 text-cyan-400 flex items-center justify-center">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 110-5 2.5 2.5 0 010 5z" />
            </svg>
          </span>
          <div>
            <Editable id="map.title" as="h1" className="text-xl font-bold text-gray-100">Device Map</Editable>
            <p className="text-xs text-gray-500">
              {located.length} of {devices.length} device{devices.length === 1 ? '' : 's'} mapped · {online} online
            </p>
          </div>
        </div>
        {/* Legend — status conveyed by colour AND label (not colour alone) */}
        <div className="flex items-center gap-4 text-xs text-gray-400">
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-400" /> Online</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-gray-500" /> Offline</span>
        </div>
      </div>

      {/* ── Location placement panel ── */}
      {placingId != null && (
        <div className="rounded-2xl bg-cyan-500/5 border border-cyan-500/30 p-4 flex flex-wrap items-center gap-3 animate-slide-up">
          <p className="text-sm text-cyan-100 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            Placing <span className="font-semibold">{placingDevice?.name || 'device'}</span> — click the map or type coordinates
          </p>
          <div className="flex items-center gap-2 ml-auto flex-wrap">
            <button
              onClick={useMyLocation}
              disabled={locating}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-200 text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {locating ? (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                    d="M12 2v2m0 16v2m10-10h-2M4 12H2m15.5-5.5l-1.4 1.4M7.9 16.1l-1.4 1.4m0-11.5l1.4 1.4m8.2 8.2l1.4 1.4M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              )}
              {locating ? 'Locating…' : 'Use my location'}
            </button>
            <label className="flex items-center gap-1.5 text-xs text-gray-400">
              Lat
              <input
                type="number" step="any" placeholder="41.0082"
                value={draft && draft.lat != null ? draft.lat : ''}
                onChange={(e) => {
                  const v = e.target.value === '' ? null : parseFloat(e.target.value);
                  setDraft((p) => ({ lat: Number.isFinite(v) ? v : null, lng: p?.lng ?? null }));
                }}
                className="w-28 px-2 py-1.5 rounded-lg bg-[#0f1117] border border-white/10 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
              />
            </label>
            <label className="flex items-center gap-1.5 text-xs text-gray-400">
              Lng
              <input
                type="number" step="any" placeholder="28.9784"
                value={draft && draft.lng != null ? draft.lng : ''}
                onChange={(e) => {
                  const v = e.target.value === '' ? null : parseFloat(e.target.value);
                  setDraft((p) => ({ lat: p?.lat ?? null, lng: Number.isFinite(v) ? v : null }));
                }}
                className="w-28 px-2 py-1.5 rounded-lg bg-[#0f1117] border border-white/10 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
              />
            </label>
            <button
              onClick={saveLocation}
              disabled={saving || !draft || draft.lat == null || draft.lng == null}
              className="px-4 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? 'Saving…' : 'Save location'}
            </button>
            <button
              onClick={cancelPlacing}
              className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 text-sm transition-colors"
            >
              Cancel
            </button>
          </div>
          {saveError && <p role="alert" className="w-full text-xs text-red-400">{saveError}</p>}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Device list (text/data alternative + selection) ── */}
        <div className="rounded-2xl bg-[#1a1d27] border border-white/5 p-4 animate-slide-up delay-100 flex flex-col">
          <div className="relative mb-3">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
            </svg>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search devices…"
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-[#0f1117] border border-white/10 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
            />
          </div>

          <div className="space-y-1 overflow-y-auto max-h-[560px] pr-1">
            {loading ? (
              <SkeletonList rows={6} height="h-12" className="p-0" />
            ) : error ? (
              <div className="py-10 text-center text-sm text-red-400">{error}</div>
            ) : listed.length === 0 ? (
              <div className="py-10 text-center text-sm text-gray-500">No devices match your search</div>
            ) : (
              listed.map((d) => {
                const gps = hasGps(d);
                const isSel = String(selectedId) === String(d.id);
                const isPlacing = String(placingId) === String(d.id);
                return (
                  <div
                    key={d.id ?? d.name}
                    className={`flex items-center gap-2 px-2 py-1.5 rounded-xl transition-colors
                      ${isSel ? 'bg-cyan-500/15 ring-1 ring-cyan-500/30'
                        : isPlacing ? 'bg-cyan-500/5 ring-1 ring-cyan-500/40' : 'hover:bg-white/5'}`}
                  >
                    <button
                      type="button"
                      onClick={() => select(d)}
                      disabled={!gps}
                      aria-pressed={isSel}
                      className={`text-left flex items-center gap-3 flex-1 min-w-0 py-1
                        ${gps ? 'cursor-pointer' : 'opacity-60 cursor-default'}`}
                    >
                      <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${d.status === 'online' ? 'bg-emerald-400' : 'bg-gray-500'}`} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-200 truncate">{d.name}</p>
                        <p className="text-xs text-gray-600 truncate">
                          {gps ? `${d.latitude.toFixed(4)}, ${d.longitude.toFixed(4)}` : 'No GPS coordinates'}
                        </p>
                      </div>
                    </button>
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => startPlacing(d)}
                        title={gps ? 'Move location' : 'Set location'}
                        className="flex-shrink-0 px-2 py-1 rounded-lg text-xs font-medium bg-white/5 text-gray-300 hover:bg-cyan-500/20 hover:text-cyan-200 transition-colors"
                      >
                        {gps ? 'Move' : 'Set'}
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* ── Map + selected device card ── */}
        <div className="lg:col-span-2 animate-slide-up delay-200 space-y-4">
          {selectedDevice && (
            <div className="rounded-2xl bg-[#1a1d27] border border-white/5 p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="w-10 h-10 rounded-xl bg-cyan-500/15 text-cyan-400 flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 110-5 2.5 2.5 0 010 5z" />
                    </svg>
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold text-gray-100 truncate">{selectedDevice.name}</h3>
                    <p className="text-xs text-gray-500">Device {selectedDevice.id ?? '—'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold
                    ${selectedDevice.status === 'online' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-white/5 text-gray-400'}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${selectedDevice.status === 'online' ? 'bg-emerald-400' : 'bg-gray-500'}`} />
                    {selectedDevice.status}
                  </span>
                  <button
                    onClick={deselect}
                    aria-label="Close device card"
                    className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-gray-400 hover:text-white transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-x-6 gap-y-3 mt-4">
                <Field label="IP address" value={selectedDevice.ip ? `${selectedDevice.ip}${selectedDevice.port ? `:${selectedDevice.port}` : ''}` : '—'} mono />
                <Field label="Coordinates" value={hasGps(selectedDevice) ? `${selectedDevice.latitude.toFixed(5)}, ${selectedDevice.longitude.toFixed(5)}` : 'Not set'} mono />
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                  onClick={() => openInProjects(selectedDevice)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-semibold transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  View details
                </button>
                {canEdit && (
                  <button
                    onClick={() => startPlacing(selectedDevice)}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 hover:bg-cyan-500/20 text-gray-200 hover:text-cyan-200 text-sm font-medium transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
                      <circle cx="12" cy="9" r="2.5" strokeWidth={1.8} />
                    </svg>
                    {hasGps(selectedDevice) ? 'Move location' : 'Set location'}
                  </button>
                )}
              </div>
            </div>
          )}

          {error ? (
            <div className="rounded-2xl bg-[#1a1d27] border border-red-500/20 p-6 text-sm text-red-400">{error}</div>
          ) : (
            <DeviceMap
              devices={devices}
              selectedId={selectedForMap}
              height="620px"
              onMapClick={placingId != null ? onMapClick : null}
              draft={placingId != null ? draft : null}
              onDeviceClick={selectById}
            />
          )}
        </div>
      </div>
    </div>
  );
}
