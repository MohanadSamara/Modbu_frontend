# 🚀 AI Prompt for Backend Developer — Generate REST API Endpoints

**Copy-paste this entire prompt into ChatGPT, Claude, or Gemini to generate your backend API.**

---

## ⚡ URGENT — Add this endpoint NOW (10 lines of code)

The frontend calls `PATCH /api/devices/:id/last-seen` every time a device connects.
Add this route to your Express app **before your other device routes**:

```js
// PATCH /api/devices/:id/last-seen  — sets LAST_SEEN = SYSDATE
router.patch('/devices/:id/last-seen', async (req, res) => {
  let conn;
  try {
    conn = await oracledb.getConnection(dbConfig);
    const result = await conn.execute(
      `UPDATE DEVICES SET LAST_SEEN = SYSDATE WHERE DEVICE_ID = :id`,
      { id: Number(req.params.id) },
      { autoCommit: true }
    );
    if (result.rowsAffected === 0) return res.status(404).json({ error: 'Device not found' });
    const row = await conn.execute(
      `SELECT LAST_SEEN FROM DEVICES WHERE DEVICE_ID = :id`,
      { id: Number(req.params.id) }
    );
    const lastSeen = row.rows[0]?.[0];
    res.json({ success: true, last_seen: lastSeen ? lastSeen.toISOString() : null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    if (conn) await conn.close();
  }
});
```

Also make sure `GET /api/devices` returns `last_seen` in each row:

```js
// In your SELECT query for GET /api/devices, add LAST_SEEN:
// SELECT DEVICE_ID, DEVICE_NAME, DEVICE_IP, DEVICE_PORT, STATUS, LOCATION_ID, LAST_SEEN FROM DEVICES

// When mapping each row to JSON, add:
last_seen: row.LAST_SEEN ? row.LAST_SEEN.toISOString() : null,
```

---

```
I need you to generate a complete REST API backend (Node.js + Express + node-oracledb) that implements these exact endpoints:

BASE URL: http://localhost:3000/api
DB: Oracle (modbus_admin@XEPDB1 localhost:1521)

✅ SQL SCHEMA ALREADY RUN:
docs/sql/01_schema.sql (creates projects, locations, ALTER devices ADD location_id)

EXISTING ENDPOINTS (already implemented):
GET/POST/PUT/DELETE /api/devices (your existing code)

NEW ENDPOINTS REQUIRED (copy exact spec from docs/BACKEND_API.md):

## 1. Projects (all endpoints)
GET /api/projects [?include=locations,
