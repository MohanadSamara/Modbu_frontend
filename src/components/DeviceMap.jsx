// ============================================================================
// DeviceMap.jsx — Leaflet map plotting every device that has GPS coordinates.
//
// Coordinates come from the device row (latitude/longitude), which the backend
// fills either from a live Modbus GPS read (registers 10594/10596) when the
// device is connected, or from manual entry in the Add/Edit device form.
//
// Uses OpenStreetMap tiles (no API key). Marker icons are inline SVG via
// L.divIcon so we avoid Leaflet's broken default-marker asset paths in bundlers.
// ============================================================================

import { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Coloured pin as an inline SVG divIcon (green = online, grey = offline).
function pinIcon(color) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="26" height="38" viewBox="0 0 26 38">
      <path d="M13 0C5.82 0 0 5.82 0 13c0 9.25 13 25 13 25s13-15.75 13-25C26 5.82 20.18 0 13 0z"
            fill="${color}" stroke="#0b0d13" stroke-width="1.5"/>
      <circle cx="13" cy="13" r="5" fill="#0b0d13"/>
    </svg>`;
  return L.divIcon({
    html: svg,
    className: 'device-map-pin',
    iconSize: [26, 38],
    iconAnchor: [13, 38],
    popupAnchor: [0, -34],
  });
}

const ONLINE_ICON = pinIcon('#34d399');  // emerald-400
const OFFLINE_ICON = pinIcon('#9ca3af'); // gray-400
const DRAFT_ICON = pinIcon('#22d3ee');   // cyan-400 — the location being placed

// Reports map clicks to the parent (used to drop a device's location).
function ClickHandler({ onMapClick }) {
  useMapEvents({
    click(e) { onMapClick({ lat: e.latlng.lat, lng: e.latlng.lng }); },
  });
  return null;
}

// Auto-fit the map to all markers whenever the set of coordinates changes.
function FitBounds({ points }) {
  const map = useMap();
  // Re-fit whenever the coordinate set changes. Serialize to a stable key so we
  // don't refit on every render just because `points` is a new array instance.
  const key = points.map((p) => p.join(',')).join('|');
  useEffect(() => {
    if (!points.length) return;
    if (points.length === 1) {
      map.setView(points[0], 13);
    } else {
      map.fitBounds(points, { padding: [40, 40], maxZoom: 14 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, key]);
  return null;
}

// Pan/zoom to a device when it's selected from an external list.
function FlyToSelected({ selectedId, located }) {
  const map = useMap();
  useEffect(() => {
    if (selectedId == null) return;
    const d = located.find((x) => x.id === selectedId);
    if (d) map.flyTo([d.latitude, d.longitude], Math.max(map.getZoom(), 14), { duration: 0.8 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);
  return null;
}

export default function DeviceMap({
  devices = [], selectedId = null, height = '420px', onMapClick = null, draft = null,
  onDeviceClick = null,
}) {
  // Only devices with a real, valid coordinate pair get a marker.
  const located = useMemo(
    () =>
      devices.filter(
        (d) =>
          typeof d.latitude === 'number' &&
          typeof d.longitude === 'number' &&
          Math.abs(d.latitude) <= 90 &&
          Math.abs(d.longitude) <= 180 &&
          !(d.latitude === 0 && d.longitude === 0)
      ),
    [devices]
  );

  const points = useMemo(() => located.map((d) => [d.latitude, d.longitude]), [located]);

  const hasPoints = points.length > 0;
  // Always render the map. With no located devices we show a wide default view
  // and a small overlay note instead of hiding the map entirely.
  const center = hasPoints ? points[0] : [25, 15];
  const zoom = hasPoints ? 12 : 2;

  return (
    <div className="rounded-2xl overflow-hidden border border-white/5 relative z-0">
      {!hasPoints && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[500] px-4 py-2 rounded-lg bg-[#1a1d27]/90 border border-white/10 text-xs text-gray-300 text-center max-w-[90%] shadow-lg">
          No devices have GPS coordinates yet — add latitude/longitude to see them here
        </div>
      )}
      <MapContainer
        center={center}
        zoom={zoom}
        scrollWheelZoom
        style={{ height, width: '100%', background: '#0b0d13' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitBounds points={points} />
        <FlyToSelected selectedId={selectedId} located={located} />
        {onMapClick && <ClickHandler onMapClick={onMapClick} />}
        {draft && typeof draft.lat === 'number' && typeof draft.lng === 'number' && (
          <Marker position={[draft.lat, draft.lng]} icon={DRAFT_ICON} />
        )}
        {located.map((d) => (
          <Marker
            key={d.id ?? `${d.latitude},${d.longitude}`}
            position={[d.latitude, d.longitude]}
            icon={d.status === 'online' ? ONLINE_ICON : OFFLINE_ICON}
            eventHandlers={onDeviceClick ? { click: () => onDeviceClick(d.id) } : undefined}
          >
            <Popup>
              <div className="text-sm">
                <p className="font-semibold">{d.name || 'Unnamed device'}</p>
                <p className="text-gray-600">{d.ip}{d.port ? `:${d.port}` : ''}</p>
                <p className="mt-1">
                  <span
                    className={
                      d.status === 'online' ? 'text-emerald-600' : 'text-gray-500'
                    }
                  >
                    ● {d.status || 'offline'}
                  </span>
                </p>
                <p className="text-gray-500 mt-1 font-mono text-xs">
                  {d.latitude.toFixed(5)}, {d.longitude.toFixed(5)}
                  {typeof d.altitude === 'number' ? ` · ${d.altitude}m` : ''}
                </p>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
