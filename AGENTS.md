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
├── UbiquitiAPIClient    — GET /sites, /devices
├── DataProcessor        — raw JSON → typed dataclasses (SiteData, DeviceData)
│   └── safe_float() / safe_int()  — null-safe coercion
└── InfluxDBManager      — writes 3 measurements: sites, devices, dept_summary

api.py (Flask REST API → sirve dashboard React)
├── GET /api/stats       — APs online/offline, clientes online/offline
├── GET /api/sites       — lista de APs con filtros (department, status, search)
├── GET /api/traffic     — serie temporal Rx/Tx (hours param)
├── GET /api/devices     — dispositivos cliente con filtros
├── GET /api/site-devices — conteo de hogares/APs por site
├── GET /api/hogares-bajos — juntas en operación con <33% hogares online
├── GET /api/departments — departamentos disponibles para filtros
├── GET /api/activity    — actividad histórica online/offline
├── GET /api/alerts      — sitios con todos sus dispositivos caídos
├── GET /api/report      — reporte avanzado con filtros y estados
├── GET /api/report/excel/detailed — reporte Excel detallado
├── GET /api/report/excel — reporte Excel de un site individual
├── GET /api/preventivos — datos de mantenimiento preventivo (chart)
├── GET /api/preventivos/list — lista de preventivos con filtros
├── GET /api/preventivos/excel — exportar preventivos filtrados a Excel
├── POST /api/preventivos/update — cambiar estado de un preventivo
├── GET /api/tickets*    — reportes de tickets (stats, list, months, excel, juntas, detail, upload)
├── POST /api/toggle-estado     — cambiar estado Operación/Implementación (admin)
├── GET/POST /api/users, DELETE /api/users/<u> — CRUD de usuarios (admin)
└── static /                   — React build servido como SPA

dashboard/ (React + Vite + Recharts + Leaflet)
├── OverviewPage         — panel principal: stats, tráfico, actividad, tabla, mapa
├── SiteDetailPage       — detalle de sitio: tráfico, actividad, dispositivos
├── ReportsPage          — reporte departamental con mapa y export Excel
├── PreventivosPage      — gestión de mantenimientos preventivos
├── TicketsPage          — reportes de tickets y paradas de reloj
├── LoginPage            — autenticación JWT
├── UserManagementPage   — admin de usuarios
├── StatsCards           — 4 KPIs
├── TrafficChart         — gráfica Rx/Tx
├── ActivityChart        — gráfica de actividad
├── SitesTable           — tabla de APs
├── DevicesTable         — tabla de dispositivos
└── SiteModal            — modal de detalle de sitio
```

Supporting files:
- `config.py` — dicts de configuración usados por `ubiquiti_backend.py`
- `telegram_notifier.py` — bot que envía alertas a Telegram
- `requirements.txt` — 8 pinned deps (`pip install -r requirements.txt`)
- `Dockerfile` — `python:3.10-slim`, backend colector
- `Dockerfile.dashboard` — multi-stage (Node.js build + Python Flask)
- `Dockerfile.telegram` — `python:3.10-slim`, notificador Telegram

## Gotchas

- **InfluxDB v1.x only.** Todas las queries son InfluxQL, no Flux. Cliente `influxdb==5.3.1`. No migrar a 2.x sin reescribir queries y cliente.
- **Dual config systems.** `config.py` define dicts que importa `ubiquiti_backend.py`. La app principal SOLO usa `ubiquiti`, `influxdb`, y `monitoring` del CONFIG. El resto (ZONE_MAPPING, ALERTS, etc.) fueron eliminados por no usarse.
- **DEPARTMENT_MAPPING se carga desde Excel.** `ubiquiti_backend.py` lee `base_operacion.xlsx` y `base_instalaciones.xlsx` en `__main__` para construir el mapeo.
- **Null safety pattern.** Campos `null` de la API se manejan con `data.get("key") or {}` y `safe_float()`/`safe_int()` que retornan `0.0`/`0`.
- **Hardcoded region.** URL default apunta a `juntasub.inred.com.co`. Timezone en dashboard usa `es-CO`.
- **Auth en InfluxDB habilitada.** `docker-compose.yml` define `INFLUXDB_HTTP_AUTH_ENABLED: "true"` y todos los servicios usan credenciales desde `.env`.
- **Sin restart backoff.** El loop duerme `POLLING_INTERVAL` completo (default 300s) incluso tras errores de API.
- **Timestamps de sites = hora del ciclo.** El colector escribe la medición `sites` con la hora del polling (no `last_seen`) para que juntas caídas >24h sigan visibles en el dashboard y alertas. `devices` sí usa `last_seen` (los caídos viejos se ocultan de la ventana de 24h a propósito).
- **4 Docker services**: `influxdb:1.8`, `ubiquiti-backend` (colector), `dashboard` (Flask + React build), `telegram-notifier`. Red `monitoring` (bridge).
- **React build se genera en Docker.** El `Dockerfile.dashboard` usa multi-stage: Stage 1 compila con Node, Stage 2 corre Flask con los estáticos.
- **get_site_details() y get_device_statistics()** fueron eliminados de `UbiquitiAPIClient` por no ser llamados en ningún lado.
- **axios y lucide-react** fueron eliminados de package.json por no usarse.
