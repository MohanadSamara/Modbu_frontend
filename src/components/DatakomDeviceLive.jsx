// ============================================================================
// DatakomDeviceLive.jsx — live view of ONE Datakom device, for the Projects
// Details page. Given a Datakom device id (`did`), it now shows ONLY the fuel
// level (simplified for now) and drives it through the SAME <FuelGauge> the
// Modbus side uses — so the fuel alarm settings (thresholds, consumption rate,
// cooldown, accept/snooze) apply identically to Datakom cloud devices. The gauge
// reads fuel from a Datakom source instead of a Modbus poll. READ-ONLY.
// ============================================================================

import { useCallback, useEffect, useState } from 'react';
import { datakomApi } from '../api/datakom.js';
import FuelGauge from './FuelGauge.jsx';
import Can from './Can.jsx';

// Picker shown when a Datakom-brand device isn't linked yet: choose which live
// Datakom device it represents. `onLink(did)` persists the link (returns {ok,error}).
export function DatakomLinkCard({ onLink }) {
  const [devices, setDevices] = useState([]);
  const [sel, setSel] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let c = false;
    datakomApi.devices()
      .then((list) => { if (!c) setDevices(Array.isArray(list) ? list : []); })
      .catch((e) => { if (!c) setErr(e.message || 'Datakom not connected'); })
      .finally(() => { if (!c) setLoading(false); });
    return () => { c = true; };
  }, []);

  async function link() {
    if (sel === '') return;
    setBusy(true); setErr('');
    const r = await onLink(Number(sel));
    setBusy(false);
    if (r && !r.ok) setErr(r.error || 'Link failed');
  }

  return (
    <Can permission="datakom.write" fallback={
      <div className="rounded-2xl bg-[#1a1d27] border border-white/5 p-5 text-[11px] text-gray-500">
        This is a Datakom device, but linking it requires the <span className="font-mono">datakom.write</span> permission.
      </div>
    }>
    <div className="rounded-2xl bg-[#1a1d27] border border-white/5 p-5">
      <div className="flex items-center gap-2.5 mb-3">
        <span className="w-8 h-8 rounded-lg bg-orange-500/15 text-orange-400 flex items-center justify-center">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101M10.172 13.828a4 4 0 005.656 0l4-4a4 4 0 10-5.656-5.656l-1.1 1.1" />
          </svg>
        </span>
        <div>
          <h3 className="text-sm font-bold text-gray-100">Link to a Datakom device</h3>
          <p className="text-[11px] text-gray-500">This device's brand is Datakom — choose which live device it is to show cloud data.</p>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-gray-500 py-2">Loading Datakom devices…</p>
      ) : err ? (
        <p className="text-sm text-red-400 py-2">{err}</p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={sel}
            onChange={(e) => setSel(e.target.value)}
            aria-label="Select a Datakom device to link"
            className="flex-1 min-w-[200px] px-3 py-2 bg-[#0f1117] border border-white/10 rounded-lg text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/50 transition-colors"
          >
            <option value="">Select a Datakom device…</option>
            {devices.map((d) => (
              <option key={d.did} value={d.did}>{d.sid || `Device ${d.did}`} (did {d.did})</option>
            ))}
          </select>
          <button
            type="button"
            onClick={link}
            disabled={sel === '' || busy}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 active:scale-[0.98] disabled:bg-blue-700/40 disabled:active:scale-100 text-white text-sm font-semibold transition-all"
          >
            {busy ? 'Linking…' : 'Link'}
          </button>
        </div>
      )}
    </div>
    </Can>
  );
}

export default function DatakomDeviceLive({ did, deviceId, deviceIp, onSyncIp, onUnlink }) {
  // Pull ONLY the fuel level from the Datakom reading. Returns a percentage, or
  // null when the device has no value yet or reports fuel in a non-% unit we
  // can't compare against the %-based thresholds. This is the single source the
  // shared <FuelGauge> polls, so all fuel-alarm settings apply to Datakom too.
  const fuelSource = useCallback(async () => {
    const d = await datakomApi.device(did);
    const fm = d?.reading?.metrics?.fuelLevel;
    if (!fm || fm.value == null) return null;
    if (fm.unit != null && !/%/.test(String(fm.unit))) return null;
    return fm.value;
  }, [did]);

  // Light poll for the cloud-reported IP + genset state — powers the IP auto-fill
  // and the control row. Independent of the gauge's own faster poll.
  // `cloudDown` flips when the backend refuses the reading (503 = the Datakom
  // connection is stopped/disconnected) so the panel says so instead of showing
  // a frozen "live" gauge.
  const [info, setInfo] = useState({ ip: null, gensetState: null });
  const [cloudDown, setCloudDown] = useState(false);
  useEffect(() => {
    let c = false;
    const tick = () => datakomApi.device(did)
      .then((d) => {
        if (c) return;
        setCloudDown(false);
        setInfo({ ip: d?.reading?.ip ?? null, gensetState: d?.reading?.identity?.gensetState ?? null });
      })
      .catch((e) => {
        if (c) return;
        // 503 = adapter stopped / not connected; other errors keep last state.
        if (/503|not connected/i.test(String(e?.message))) setCloudDown(true);
      });
    tick();
    const t = setInterval(tick, 5000);
    return () => { c = true; clearInterval(t); };
  }, [did]);

  const cloudIp = info.ip;
  // The Cloud IP / "Use this IP" sync row only makes sense for devices that use
  // the IP/Modbus method (they already carry a stored IP). Once the IP is removed
  // the device is intentionally cloud-only, so we hide the row entirely instead of
  // nagging the user to re-add the cloud-reported IP they just cleared.
  const hasStoredIp = String(deviceIp ?? '').trim() !== '';
  // Offer the IP only when the cloud reports one AND it differs from what the
  // platform device already has (so we don't nag once it's saved).
  const canOfferIp = hasStoredIp && !!onSyncIp && !!cloudIp && String(deviceIp).trim() !== String(cloudIp).trim();
  const [ipBusy, setIpBusy] = useState(false);
  const [ipMsg, setIpMsg] = useState('');
  const saveIp = async () => {
    setIpBusy(true); setIpMsg('');
    const r = await onSyncIp(cloudIp);
    setIpBusy(false);
    setIpMsg(r && r.ok ? 'Saved to device' : (r?.error || 'Save failed'));
  };

  return (
    <Can
      anyPermission={['datakom.read', 'device.read']}
      fallback={
        <p className="text-[11px] text-gray-600 px-1">
          Live Datakom Rainbow data isn't available for your account.
        </p>
      }
    >
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 px-1">
        {/* The technical link id (did) is management detail — only users who can
            manage the link (datakom.write) see it; everyone else just sees the
            "Live" label. */}
        <span className="text-[11px] text-gray-500">
          Live — Datakom Rainbow
          <Can permission="datakom.write"> · did {did}</Can>
        </span>
        {onUnlink && (
          <Can permission="datakom.write">
            <button
              type="button"
              onClick={onUnlink}
              title="Unlink this Datakom device"
              aria-label="Unlink this Datakom device"
              className="text-[11px] text-gray-400 hover:text-red-400 px-2 py-0.5 rounded-md hover:bg-white/5 transition-colors"
            >
              Unlink
            </button>
          </Can>
        )}
      </div>

      {/* Cloud-reported IP. When it differs from the device's stored IP, offer a
          one-click sync so the device gains a Modbus/IP address pulled from the
          cloud. The IP is network-infrastructure detail, so the WHOLE row (not
          just the sync button) is visible only to users with device.write. */}
      {cloudIp && hasStoredIp && (
        <Can permission="device.write">
          <div className="flex items-center justify-between gap-2 px-1 text-[11px]">
            <span className="text-gray-500">
              Cloud IP <span className="font-mono text-gray-300">{cloudIp}</span>
            </span>
            {canOfferIp && (
              <button
                type="button"
                onClick={saveIp}
                disabled={ipBusy}
                className="px-2 py-0.5 rounded-md bg-blue-600/80 text-white hover:bg-blue-500 disabled:opacity-50 transition-colors"
              >
                {ipBusy ? 'Saving…' : 'Use this IP'}
              </button>
            )}
            {ipMsg && <span className="text-emerald-400">{ipMsg}</span>}
          </div>
        </Can>
      )}

      {cloudDown ? (
        /* The Datakom connection is stopped — say so instead of a frozen gauge. */
        <div className="flex items-center gap-2 px-3 py-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs">
          <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636a9 9 0 010 12.728m-12.728 0a9 9 0 010-12.728m3.536 3.536L18.364 18.364M5.636 5.636l3.536 3.536" />
          </svg>
          Datakom cloud connection is off — no live data. Start it from the Datakom Cloud page.
        </div>
      ) : (
        <>
          {/* Same gauge + alarm logic as the Modbus side, fed from Datakom and polled
              faster for a snappier read. deviceId ties the accept/snooze to this same
              platform device, so an accept here is respected on the Modbus panel too.
              NO control buttons here — the cloud is read-only; start/stop is
              Modbus/IP-only. */}
          <FuelGauge
            isConnected
            target={{ deviceId }}
            fuelSource={fuelSource}
            pollMs={1000}
          />
          {info.gensetState && (
            <p className="px-1 text-[11px] text-gray-500">
              State <span className="font-mono text-gray-300">{info.gensetState}</span>
            </p>
          )}
        </>
      )}
    </div>
    </Can>
  );
}

// NB: the old "Datakom Rainbow control" (cloud start/stop) card was removed —
// remote control over the cloud isn't possible, so control stays Modbus/IP-only
// via <ControlButtons> on the IP panel.
