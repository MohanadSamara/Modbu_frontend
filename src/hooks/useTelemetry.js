// ============================================================================
// useTelemetry — live telemetry over the backend WebSocket (/ws/telemetry).
//
// Replaces REST polling for fuel / consumption / alarm / GPS updates. The
// backend reads every connected device on a timer and pushes a frame per
// device; this hook keeps the latest frame for each device in state so any
// page can render live values without its own interval.
//
// Auth: browsers can't set an Authorization header on a WebSocket, so the
// short-lived access token is passed as ?token=… (verified server-side by the
// same code the REST routes use). On an unauthorized close we mint a fresh
// token from the refresh token and retry.
//
// Usage:
//   const { frames, status } = useTelemetry();               // all visible devices
//   const { frames, status } = useTelemetry({ deviceIds });  // just these ids
//   frames[deviceId] -> { fuel, consumptionRate, consumption, alarms, gps, at, receivedAt }
//   status           -> 'idle' | 'connecting' | 'open' | 'closed'
// ============================================================================

import { useEffect, useRef, useState } from 'react';
import { getAccessToken, refreshAccessToken } from '../api/http.js';

const TELEMETRY_PATH = '/ws/telemetry';

function buildWsUrl(token) {
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  // Same origin as the app — Vite proxies /ws to the backend in dev.
  return `${proto}://${window.location.host}${TELEMETRY_PATH}?token=${encodeURIComponent(token)}`;
}

export function useTelemetry({ enabled = true, deviceIds } = {}) {
  const [frames, setFrames] = useState({}); // { [deviceId]: frame }
  const [status, setStatus] = useState('idle');

  const wsRef = useRef(null);
  const retryRef = useRef(0);
  const closedByUsRef = useRef(false);

  // Stable key so the effect only re-subscribes when the *set* of ids changes,
  // not on every render that happens to pass a new array instance.
  const idsKey = Array.isArray(deviceIds)
    ? [...new Set(deviceIds.map(Number).filter(Number.isFinite))].sort((a, b) => a - b).join(',')
    : '';

  useEffect(() => {
    if (!enabled) return; // status is reported as 'idle' below when disabled
    closedByUsRef.current = false;
    let reconnectTimer = null;

    const scheduleReconnect = () => {
      if (closedByUsRef.current) return;
      const attempt = Math.min(retryRef.current++, 5);
      const delay = Math.min(1000 * 2 ** attempt, 15000); // 1s → 15s cap
      reconnectTimer = setTimeout(connect, delay);
    };

    const connect = async () => {
      if (closedByUsRef.current) return;
      let token = getAccessToken();
      if (!token) token = await refreshAccessToken().catch(() => null);
      if (!token) { setStatus('closed'); scheduleReconnect(); return; }
      if (closedByUsRef.current) return;

      setStatus('connecting');
      let ws;
      try {
        ws = new WebSocket(buildWsUrl(token));
      } catch {
        setStatus('closed');
        scheduleReconnect();
        return;
      }
      wsRef.current = ws;

      ws.onopen = () => {
        retryRef.current = 0;
        setStatus('open');
        const ids = idsKey ? idsKey.split(',').map(Number) : [];
        // Empty array ⇒ subscribe to all devices this user may see.
        try { ws.send(JSON.stringify({ type: 'subscribe', deviceIds: ids })); } catch { /* ignore */ }
      };

      ws.onmessage = (ev) => {
        let msg;
        try { msg = JSON.parse(ev.data); } catch { return; }
        if (msg.type === 'telemetry' && msg.deviceId != null) {
          setFrames((prev) => ({
            ...prev,
            [msg.deviceId]: { ...msg, receivedAt: Date.now() },
          }));
        }
      };

      ws.onclose = (ev) => {
        if (closedByUsRef.current) return;
        setStatus('closed');
        // 4001 = unauthorized: the access token was rejected (likely expired).
        // Refresh it so the next attempt connects with a valid one.
        if (ev.code === 4001) refreshAccessToken().catch(() => {});
        scheduleReconnect();
      };

      ws.onerror = () => { try { ws.close(); } catch { /* ignore */ } };
    };

    connect();

    return () => {
      closedByUsRef.current = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      const ws = wsRef.current;
      wsRef.current = null;
      if (ws) { try { ws.close(1000, 'unmount'); } catch { /* ignore */ } }
    };
  }, [enabled, idsKey]);

  return { frames, status: enabled ? status : 'idle' };
}

export default useTelemetry;
