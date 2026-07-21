// ============================================================================
// DatakomDeviceEdit.jsx — the "Edit" affordance for a Datakom cloud device.
//
// Cloud node/device names come from Datakom's portal and can't be renamed
// here — what CAN be edited is the platform device linked to the cloud one
// (its display name, and the link itself):
//   • linked      → Edit button → rename the platform device (device.write)
//   • not linked  → "Add & edit" creates a platform device bound to this did
//                   (device.write + datakom.write), then editing opens.
// ============================================================================
import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { modbusApi } from '../api/modbus.js';
import { brandsApi, isCloudBrand } from '../api/brands.js';
import { useAuth } from '../context/useAuth.js';
import { silk } from '../lib/motion.js';

const num = (v) => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export default function DatakomDeviceEdit({ did, cloudName }) {
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('device.write');
  const canLink = canEdit && hasPermission('datakom.write');

  const [linked, setLinked] = useState(null);   // platform device bound to this did
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const refresh = useCallback(async () => {
    try {
      const devs = await modbusApi.getDevices();
      const hit = (devs ?? []).find((d) => num(d.datakom_did ?? d.DATAKOM_DID) === num(did));
      setLinked(hit ? { id: hit.id ?? hit.ID, name: hit.name ?? hit.NAME ?? '' } : null);
    } catch { /* leave as-is on a blip */ }
  }, [did]);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => { if (linked) setName(linked.name); }, [linked]);

  if (!canEdit) return null;

  const save = async () => {
    if (!linked || !name.trim()) return;
    setBusy(true); setErr(''); setMsg('');
    try {
      await modbusApi.updateDevice(linked.id, { name: name.trim() });
      setMsg('Saved');
      await refresh();
    } catch (e) {
      setErr(e.message || 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  const link = async () => {
    setBusy(true); setErr(''); setMsg('');
    try {
      const brands = await brandsApi.list().catch(() => []);
      const dk = (brands ?? []).find((b) => isCloudBrand(b.name ?? b.NAME));
      await modbusApi.createDevice({
        name: cloudName || `Datakom ${did}`,
        datakom_did: did,
        ...(dk ? { brand_id: dk.id ?? dk.ID } : {}),
        status: 'offline',
      });
      setMsg('Added to your devices');
      setOpen(true);
      await refresh();
    } catch (e) {
      setErr(e.message || 'Link failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mb-5">
      {linked ? (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] text-gray-500">
            Linked device: <span className="text-gray-300">{linked.name}</span>
            <span className="text-gray-600"> · Device {linked.id}</span>
          </span>
          <motion.button
            type="button"
            {...silk.press}
            onClick={() => { setOpen((v) => !v); setMsg(''); setErr(''); }}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10 transition-colors"
          >
            <svg aria-hidden="true" className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            {open ? 'Close' : 'Edit'}
          </motion.button>
        </div>
      ) : canLink ? (
        <motion.button
          type="button"
          {...silk.press}
          onClick={link}
          disabled={busy}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600/80 text-white hover:bg-blue-500 disabled:opacity-50 transition-colors"
        >
          <svg aria-hidden="true" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          {busy ? 'Adding…' : 'Add & edit'}
        </motion.button>
      ) : null}

      <AnimatePresence>
        {open && linked && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto', transition: { ease: [0.32, 0.72, 0, 1], duration: 0.3 } }}
            exit={{ opacity: 0, height: 0, transition: { duration: 0.2 } }}
            className="overflow-hidden"
          >
            <div className="mt-3 rounded-xl bg-[#0f1117] border border-white/10 p-3 space-y-2">
              <label className="block text-[11px] text-gray-500" htmlFor={`dk-edit-name-${did}`}>
                Display name (shown across the whole app)
              </label>
              <div className="flex gap-2">
                <input
                  id={`dk-edit-name-${did}`}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') save(); }}
                  className="flex-1 px-3 py-2 bg-[#1a1d27] border border-white/10 rounded-lg text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/50 transition-colors"
                />
                <motion.button
                  type="button"
                  {...silk.press}
                  onClick={save}
                  disabled={busy || !name.trim() || name.trim() === linked.name}
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:bg-blue-700/40 text-white text-sm font-semibold transition-colors"
                >
                  {busy ? 'Saving…' : 'Save'}
                </motion.button>
              </div>
              <p className="text-[11px] text-gray-600">
                The cloud name from Datakom ({cloudName || `did ${did}`}) stays unchanged — this renames your platform device only.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {msg && <p className="mt-2 text-[11px] text-emerald-400">{msg}</p>}
      {err && <p className="mt-2 text-[11px] text-red-400">{err}</p>}
    </div>
  );
}
