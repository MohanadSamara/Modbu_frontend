// ============================================================================
// dedupeDevices.js — collapse device rows that point at the same PHYSICAL
// device into one, for monitoring views (Dashboard, Fuel, Connections, Map).
//
// The DB deliberately allows many rows per physical device (same Datakom did
// or same IP:port) so one device can live in several projects — that stays
// visible in the Projects tree. But monitoring views must count/show the
// physical device ONCE, whatever its connection method(s).
//
// Rows sharing a did or IP:port collapse into one; the survivor is the most
// useful row (online first, then one assigned to a location, then the newest).
// `altIds` carries every collapsed row id so live WS frames arriving under a
// hidden duplicate's id still update the surviving entry.
// ============================================================================

export function dedupeByConnection(list) {
  const didOf = (d) => d.datakomDid ?? d.datakom_did ?? null; // both key styles
  const keyOf = (d) =>
    didOf(d) != null ? `dk:${didOf(d)}`
    : d.ip ? `ip:${d.ip}:${d.port ?? 502}`
    : `id:${d.id}`;
  const score = (d) =>
    (String(d.status).toLowerCase() === 'online' ? 4 : 0) + ((d.locationId ?? d.location_id) != null ? 2 : 0);
  const best = new Map();
  const idsByKey = new Map();
  for (const d of list || []) {
    const k = keyOf(d);
    if (d.id != null) idsByKey.set(k, [...(idsByKey.get(k) ?? []), d.id]);
    const cur = best.get(k);
    if (!cur || score(d) > score(cur) || (score(d) === score(cur) && (d.id ?? 0) > (cur.id ?? 0))) {
      best.set(k, d);
    }
  }
  return [...best.entries()].map(([k, d]) => ({ ...d, altIds: idsByKey.get(k) ?? [] }));
}

export default dedupeByConnection;
