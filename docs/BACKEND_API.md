# Backend API — Projects / Locations / Devices

This document describes the REST endpoints the frontend (`src/pages/Projects.jsx`) expects so projects, locations and devices are persisted in the Oracle DB (`modbus_admin` schema, service `XEPDB1`) defined in `docs/sql/01_schema.sql`.

Base URL (proxied via Vite to `http://localhost:3000`): **`/api`**

All responses are JSON. All errors follow:

```json
{ "error": "human readable message", "detail": "optional extra info" }
```

HTTP status code conventions:
- `200 OK`        — successful GET / PUT
- `201 Created`   — successful POST
- `204 No Content`— successful DELETE
- `400 Bad Request` — validation error
- `404 Not Found`   — resource missing
- `409 Conflict`    — duplicate name / FK violation
- `500 Internal Server Error`

---

## 1. Projects

### `GET /api/projects`
List all projects.

**Response 200**
```json
[
  {
    "id": 1,
    "name": "Main Site",
    "description": "Primary production site",
    "created_at": "2025-01-20T10:00:00.000Z",
    "updated_at": "2025-01-20T10:00:00.000Z"
  }
]
```

### `GET /api/projects/:id`
Get one project.

**Response 200**
```json
{
  "id": 1,
  "name": "Main Site",
  "description": "Primary production site",
  "created_at": "2025-01-20T10:00:00.000Z",
  "updated_at": "2025-01-20T10:00:00.000Z"
}
```

### `POST /api/projects`
**Body**
```json
{ "name": "Main Site", "description": "optional" }
```
**Response 201** → `{ "success": true }`

### `PUT /api/projects/:id`
**Body**
```json
{ "name": "New name", "description": "..." }
```
**Response 200** → `{ "success": true }`

### `DELETE /api/projects/:id`
Cascades: deletes all locations + devices under the project.
**Response 200** → `{ "success": true, "deleted": id }`

---

## 2. Locations

### `GET /api/projects/:projectId/locations`
List locations of a project. Returns hierarchical tree with CONNECT BY.

**Response 200**
```json
[
  {
    "id": 10,
    "project_id": 1,
    "parent_id": null,
    "name": "Building A",
    "description": "...",
    "address": "1st floor",
    "created_at": "...",
    "updated_at": "...",
    "depth": 1,
    "path": "/Building A",
    "children": [...]
  }
]
```

### `GET /api/locations/:id`
Single location.

**Response 200**
```json
{
  "id": 10,
  "project_id": 1,
  "parent_id": null,
  "name": "Building A",
  "description": "...",
  "address": "1st floor",
  "created_at": "...",
  "updated_at": "..."
}
```

### `POST /api/projects/:projectId/locations`
**Body**
```json
{ "name": "Building A", "address": "optional", "description": "optional" }
```
**Response 201** → `{ "success": true }`

### `PUT /api/locations/:id`
Update location.

**Body**
```json
{ "name": "Building A", "description": "...", "address": "...", "parent_id": null }
```
**Response 200** → `{ "success": true }`

### `DELETE /api/locations/:id`
Cascades: deletes all devices belonging to that location.
**Response 200** → `{ "success": true }`

### `GET /api/locations/:id/children`
Get sub-locations for a location.

**Response 200**
```json
[
  { "id": 11, "project_id": 1, "parent_id": 10, "name": "Floor 1", ... }
]
```

---

## 3. Devices

### `GET /api/devices`
List all devices. Supports optional query filters:
- `?location_id=10` - Filter by location
- `?project_id=1` - Filter by project
- `?status=online` - Filter by status

**Response 200**
```json
[
  {
    "id": 100,
    "name": "Fuel Tank 1",
    "ip": "192.168.1.100",
    "port": 502,
    "status": "offline",
    "location_id": 10,
    "last_seen": "2026-07-06T10:30:00.000Z"
  }
]
```

### `GET /api/locations/:locationId/devices`
List devices under a location.

**Response 200**
```json
[
  {
    "id": 100,
    "name": "Fuel Tank 1",
    "ip": "192.168.1.100",
    "port": 502,
    "status": "offline",
    "location_id": 10,
    "last_seen": "2026-07-06T10:30:00.000Z"
  }
]
```

### `POST /api/devices`
**Body**
```json
{
  "location_id": 10,
  "name": "Fuel Tank 1",
  "ip": "192.168.1.100",
  "port": 502,
  "description": "optional",
  "status": "offline"
}
```
**Response 201** → `{ "success": true, "device": { ... } }`

### `PUT /api/devices/:id`
Update device. Include `last_seen` (ISO-8601 string) to persist a timestamp.

**Body**
```json
{ "name": "New name", "ip": "...", "port": 502, "status": "online", "location_id": 10, "last_seen": "2026-07-06T10:30:00.000Z" }
```
**Oracle mapping:** `last_seen` → `TO_TIMESTAMP_TZ(:last_seen, 'YYYY-MM-DD"T"HH24:MI:SS.FF3"Z"')` stored in `LAST_SEEN` column.
**Response 200** → `{ "success": true }`

### `PATCH /api/devices/:id/last-seen`
Set `LAST_SEEN = SYSDATE` for the device. Call this whenever a successful Modbus connection is established.

**No body required.**

**Oracle query:**
```sql
UPDATE DEVICES SET LAST_SEEN = SYSDATE WHERE ID = :id
```

**Response 200** → `{ "success": true, "last_seen": "2026-07-06T10:30:00.000Z" }`
**Response 404** → `{ "error": "Device not found" }`

### `DELETE /api/devices/:id`
**Response 200** → `{ "success": true }`

---

## 4. Project Tree (Optional)

### `GET /api/project-tree`
Returns full nested tree from `v_project_tree` view.

**Response 200**
```json
[
  {
    "project_id": 1,
    "project_name": "Main Site",
    "location_id": 10,
    "location_name": "Building A",
    "device_id": 100,
    "device_name": "Fuel Tank 1",
    "device_ip": "192.168.1.100",
    "device_status": "offline"
  }
]
```

---

## 5. curl examples

```bash
# Create project
curl -X POST http://localhost:3000/api/projects \
  -H "Content-Type: application/json" \
  -d '{"name":"Main Site","description":"Primary site"}'

# Create location under project 1
curl -X POST http://localhost:3000/api/projects/1/locations \
  -H "Content-Type: application/json" \
  -d '{"name":"Building A","address":"1st floor"}'

# Create device under location 10
curl -X POST http://localhost:3000/api/devices \
  -H "Content-Type: application/json" \
  -d '{"location_id":10,"name":"Fuel Tank 1","ip":"192.168.1.100","port":502}'

# Get devices filtered by location
curl "http://localhost:3000/api/devices?location_id=10"

# Get full tree
curl http://localhost:3000/api/project-tree

# Delete a project (cascades)
curl -X DELETE http://localhost:3000/api/projects/1
```

---

## 6. Implementation notes (backend)

- Use `node-oracledb` with the credentials:
  ```
  ORACLE_USER=modbus_admin
  ORACLE_PASSWORD=modbus1234
  ORACLE_HOST=localhost
  ORACLE_PORT=1521
  ORACLE_SERVICE_NAME=XEPDB1
  ```
- `IDENTITY` columns on Oracle 12c+ auto-generate ids. When inserting, use
  `RETURNING id INTO :out_id` to return the new id.
- Timestamps are `TIMESTAMP` — serialize as ISO-8601 strings.
- `ON DELETE CASCADE` on `locations → projects` means deleting a project deletes its locations automatically. `devices → locations` uses `ON DELETE SET NULL`.
- Enforce the `uq_projects_name` and `uq_locations_proj_name` constraints by returning HTTP `409 Conflict` on ORA-00001 (unique constraint violated).
- Validate body fields server-side (name required, port 1–65535, ip regex).

### `LAST_SEEN` handling in `PUT /api/devices/:id`

The frontend sends `last_seen` as an ISO-8601 string (e.g. `"2026-07-06T10:30:00.000Z"`) when a device connects. The backend must:

1. Accept the optional `last_seen` field in the PUT body.
2. Convert it to an Oracle TIMESTAMP and store it in the `LAST_SEEN` column.
3. Return it as an ISO string in `GET /api/devices`.

Example Oracle update fragment:
```js
// node-oracledb
const sets = ['NAME=:name', 'DEVICE_IP=:ip', 'DEVICE_PORT=:port', 'STATUS=:status'];
const binds = { name, ip, port, status, id };
if (last_seen) {
  sets.push('LAST_SEEN=TO_TIMESTAMP_TZ(:last_seen, \'YYYY-MM-DD"T"HH24:MI:SS.FF3"Z"\')');
  binds.last_seen = last_seen;
}
await conn.execute(`UPDATE DEVICES SET ${sets.join(',')} WHERE ID=:id`, binds);
```

When reading back, map the column:
```js
// node-oracledb returns DATE/TIMESTAMP as JS Date objects by default
// Serialize with: row.LAST_SEEN ? row.LAST_SEEN.toISOString() : null
```
