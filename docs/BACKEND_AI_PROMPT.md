# 🚀 AI Prompt for Backend Developer — Generate REST API Endpoints

**Copy-paste this entire prompt into ChatGPT, Claude, or Gemini to generate your backend API.**

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
