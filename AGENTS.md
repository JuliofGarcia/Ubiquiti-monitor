# AGENTS.md

## Project

Network monitoring backend that polls the Ubiquiti NMS API, stores data in InfluxDB, and exposes a React dashboard. Runs as Docker services.

## Commands

```bash
# Start the stack
docker-compose up -d

# View logs
docker-compose logs -f ubiquiti-backend
docker-compose logs -f dashboard

# Rebuild after code changes
docker-compose up -d --build ubiquiti-backend
docker-compose up -d --build dashboard

# Dashboard dev mode (hot reload)
cd dashboard && npm install && npm run dev
# API must run separately: python api.py

# Install Python deps locally (for IDE support, no virtualenv manager)
pip install -r requirements.txt
```

There are **no tests, linter, formatter, typechecker, CI pipelines, or lockfile**. Do not generate config for these unless asked.

## Architecture

```
ubiquiti_backend.py (entry point, infinite loop)
├── UbiquitiAPIClient    — GET /sites, /devices, /devices/{id}/statistics
├── DataProcessor        — raw JSON → typed dataclasses (SiteData, DeviceData)
│   └── safe_float() / safe_int()  — null-safe coercion, not standard library
└── InfluxDBManager      — writes 3 measurements: sites, devices, zone_summary

api.py (Flask REST API → sirve dashboard React)
├── GET /api/stats       — APs online/offline, clientes online/offline
├── GET /api/sites       — lista de APs con filtros (zone, status, search)
├── GET /api/traffic     — serie temporal Rx/Tx (hours param)
├── GET /api/devices     — dispositivos cliente con filtros
├── GET /api/zones       — zonas disponibles para filtros
└── static /             — React build servido como SPA

dashboard/ (React + Vite + Recharts)
├── StatsCards           — 4 KPIs: APs online/offline, clientes online/caídos
├── TrafficChart         — gráfica Rx/Tx con selector de rango (1h-72h)
├── FilterBar            — filtros: zona, estado, búsqueda, rango de tráfico
├── SitesTable           — tabla de APs clickeable (selecciona para filtrar devices)
└── DevicesTable         — tabla de dispositivos con barra de señal
```

Supporting files:
- `config.py` — dicts de configuración; **NO lo usa la app principal**, solo `influx_utils.py` y como referencia
- `influx_utils.py` — utilidades standalone para InfluxDB (retención, consultas, limpieza)
- `grafana_dashboards.py` — **LEGACY**. Ya no se usa; el dashboard es React
- `requirements.txt` — 8 pinned deps (`pip install -r requirements.txt`)
- `Dockerfile` — `python:3.10-slim`, backend colector
- `Dockerfile.dashboard` — multi-stage (Node.js build + Python Flask)

## Gotchas

- **InfluxDB v1.x only.** Todas las queries son InfluxQL, no Flux. Cliente `influxdb==5.3.1`. No migrar a 2.x sin reescribir queries y cliente.
- **Dual config systems.** `config.py` define un dict `Config`. `ubiquiti_backend.py` define su propia clase `Config` (line 31) que lee env vars directo. La app principal ignora `config.py`.
- **ZONE_MAPPING empieza vacío.** El mapeo en `ubiquiti_backend.py:620` es `{}`. Debe llenarse manualmente.
- **Null safety pattern.** Campos `null` de la API se manejan con `data.get("key") or {}` y `safe_float()`/`safe_int()` que retornan `0.0`/`0`. Todos los fields en un punto InfluxDB deben ser del mismo tipo (no mezclar int y float).
- **Hardcoded region.** URL default apunta a `juntasub.inred.com.co`. Timezone en dashboard usa `es-CO`. ZONE_MAPPING referencia departamentos colombianos.
- **No auth en InfluxDB dev.** `INFLUXDB_HTTP_AUTH_ENABLED: "false"` a pesar de tener credenciales configuradas.
- **setup.sh** es solo bash (Linux/macOS/WSL). Usa brace expansion `{1..30}`.
- **Sin restart backoff.** El loop duerme `POLLING_INTERVAL` completo (default 300s) incluso tras errores de API.
- **3 Docker services**: `influxdb:1.8`, `ubiquiti-backend` (colector), `dashboard` (Flask + React build). Red `monitoring` (bridge).
- **React build se genera en Docker.** El `Dockerfile.dashboard` usa multi-stage: Stage 1 compila con Node, Stage 2 corre Flask con los estáticos. En desarrollo local, `npm run dev` con proxy a `localhost:5000`.
