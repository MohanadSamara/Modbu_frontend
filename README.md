# Modbus Frontend Dashboard

React + Vite + Tailwind app for managing Modbus devices (connect, start/stop generators, monitor fuel, view events).

## Backend Requirements
- Backend at `http://localhost:3000` (Modbus server with OracleDB).
- Run: `cd ../Modbus && npm run dev`

## Quick Start
```bash
cd Modbus-front
npm install
npm run dev
```
Open http://localhost:5173

## Features
- Dashboard: Fuel gauge, start/stop controls, stats charts
- Devices: List + auto/manual connect  
- Events: Action logs table
- Connectivity: Manual IP connect + status

All API calls proxied to backend automatically.

## Pages
- /dashboard
- /devices  
- /events
- /connect

