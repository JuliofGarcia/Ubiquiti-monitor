import os
import sys
import json
import re
import datetime
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from influxdb import InfluxDBClient
from dotenv import load_dotenv
import pytz
import jwt
from functools import wraps

load_dotenv()

app = Flask(__name__, static_folder="dashboard/dist", static_url_path="")
CORS(app)

SECRET_KEY = os.getenv("SECRET_KEY", "fallback-secret-key")

def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = request.headers.get("Authorization")
        if not token:
            return jsonify({"error": "Token faltante"}), 401
        try:
            token = token.split(" ")[1] # Bearer <token>
            jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
        except:
            return jsonify({"error": "Token invalido"}), 401
        return f(*args, **kwargs)
    return decorated

INFLUX_HOST = os.getenv("INFLUXDB_HOST", "influxdb")
INFLUX_PORT = int(os.getenv("INFLUXDB_PORT", 8086))
INFLUX_USER = os.getenv("INFLUXDB_ADMIN_USER", "admin")
INFLUX_PASSWORD = os.getenv("INFLUXDB_ADMIN_PASSWORD", "password")
INFLUX_DATABASE = os.getenv("INFLUXDB_DATABASE", "monitoreo")

# Modelos que son APs/infraestructura, no clientes finales
AP_MODELS = {"R5AC-Lite", "R5AC-Lite-2", "LAP-120", "LAP-GPS", "PBE-5AC", "PBE-M5", "NBE-5AC", "NBE-M5"}


def get_influx_client():
    return InfluxDBClient(
        host=INFLUX_HOST,
        port=INFLUX_PORT,
        username=INFLUX_USER,
        password=INFLUX_PASSWORD,
        database=INFLUX_DATABASE,
        timeout=10,
    )


def query_latest_sites(client):
    """Obtiene el ultimo punto de cada site sin perder tags"""
    result = client.query("SELECT * FROM sites ORDER BY time DESC")
    latest = {}
    if result and "series" in getattr(result, "raw", {}):
        for series in result.raw["series"]:
            columns = series["columns"]
            for values in series.get("values", []):
                row = {}
                for col, val in zip(columns, values):
                    if val is None:
                        row[col] = 0
                    else:
                        row[col] = val
                sid = row.get("site_id", "")
                if sid and sid not in latest:
                    latest[sid] = row
    return list(latest.values())


def query_latest_devices(client):
    """Obtiene el ultimo punto de cada device sin perder tags."""
    # Usamos SELECT * para obtener todos los campos originales sin el prefijo last_
    # Limitado para rendimiento, agrupado por device_id
    result = client.query("SELECT * FROM devices GROUP BY device_id ORDER BY time DESC LIMIT 1")
    latest = []
    if result and "series" in getattr(result, "raw", {}):
        for series in result.raw["series"]:
            columns = series["columns"]
            values = series.get("values", [])[0]
            row = dict(zip(columns, values))
            
            # Asegurar que el ID venga de los tags si no está en columns
            tags = series.get("tags", {})
            if "device_id" not in row or row["device_id"] is None:
                row["device_id"] = tags.get("device_id")
            if "site_id" not in row or row["site_id"] is None:
                row["site_id"] = tags.get("site_id")
                
            latest.append(row)
    return latest









def is_site_online(site):
    """Determina si un site esta online basado en estado y dispositivos"""
    status = site.get("status", "")
    if status == "active":
        return True
    if status in ("unknown",):
        return site.get("devices_available", 0) > 0
    return False


# ---------------------------------------------------------------------------
# ENDPOINTS
# ---------------------------------------------------------------------------

@app.route("/api/login", methods=["POST"])
def login():
    auth = request.get_json()
    if not auth or auth.get("username") != os.getenv("DASHBOARD_USER") or auth.get("password") != os.getenv("DASHBOARD_PASSWORD"):
        return jsonify({"error": "Credenciales inválidas"}), 401
    token = jwt.encode({"user": auth.get("username"), "exp": datetime.datetime.utcnow() + datetime.timedelta(hours=24)}, SECRET_KEY, algorithm="HS256")
    return jsonify({"token": token})


@app.route("/api/health")
@token_required
def health():
    return jsonify({"status": "ok", "timestamp": datetime.datetime.now().isoformat()})


@app.route("/api/stats")
@token_required
def stats():
    """Estadisticas generales: APs online/offline, clientes online/offline"""
    client = get_influx_client()
    try:
        sites = query_latest_sites(client)
        devices = query_latest_devices(client)
        overrides = load_estado_overrides()

        total_aps = len(sites)
        aps_online = sum(1 for s in sites if is_site_online(s))
        aps_offline = total_aps - aps_online

        ops_total = 0
        ops_online = 0
        for s in sites:
            code_match = re.match(r"^(\d+)", s.get("site_name", ""))
            code = code_match.group(1) if code_match else ""
            estado = overrides.get(code) or s.get("estado", "")
            if estado == "Operación":
                ops_total += 1
                if is_site_online(s):
                    ops_online += 1

        total_clients = len(devices)
        clients_online = sum(1 for d in devices if str(d.get("status", "")).lower() == "active")
        clients_offline = total_clients - clients_online

        total_download = sum(s.get("download_capacity", 0) for s in sites)
        total_upload = sum(s.get("upload_capacity", 0) for s in sites)
        avg_sla = (
            sum(s.get("sla", 0) for s in sites) / total_aps if total_aps > 0 else 0
        )

        return jsonify(
            {
                "aps_online": aps_online,
                "aps_offline": aps_offline,
                "aps_total": total_aps,
                "ops_online": ops_online,
                "ops_total": ops_total,
                "clients_online": clients_online,
                "clients_offline": clients_offline,
                "clients_total": total_clients,
                "total_download_mbps": round(total_download, 2),
                "total_upload_mbps": round(total_upload, 2),
                "avg_sla": round(avg_sla, 2),
            }
        )
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        client.close()


@app.route("/api/sites")
@token_required
def sites_list():
    """Lista de APs con filtros: zone, status, search, estado, health"""
    zone = request.args.get("zone")
    status = request.args.get("status")
    search = request.args.get("search", "").lower()
    estado = request.args.get("estado")
    health = request.args.get("health")

    client = get_influx_client()
    try:
        sites = query_latest_sites(client)

        # Aplicar overrides de estado
        overrides = load_estado_overrides()
        for s in sites:
            s["online"] = is_site_online(s)
            code_match = re.match(r"^(\d+)", s.get("site_name", ""))
            if code_match:
                code = code_match.group(1)
                if code in overrides:
                    s["estado"] = overrides[code]
            # Health basado en APs (Rocket 5AC Lite)
            ap_total = s.get("ap_count", 0)
            ap_online = s.get("ap_online", 0)
            if ap_total == 0:
                s["health"] = "sin_aps"
            elif ap_online == 0:
                s["health"] = "caido"
            elif ap_online >= ap_total:
                s["health"] = "total"
            else:
                s["health"] = "parcial"

        if zone:
            sites = [s for s in sites if s.get("zone", "").lower() == zone.lower()]
        if status:
            sites = [s for s in sites if s.get("status", "").lower() == status.lower()]
        if search:
            sites = [s for s in sites if search in s.get("site_name", "").lower()]
        if estado:
            sites = [s for s in sites if s.get("estado", "") == estado]
        if health and health != "all":
            sites = [s for s in sites if s.get("health") == health]

        return jsonify(sites)
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        client.close()


@app.route("/api/traffic")
@token_required
def traffic():
    """Serie temporal de trafico Rx/Tx. Soporta ?site_id, ?hours, ?from, ?to, ?zone, ?estado"""
    site_id = request.args.get("site_id")
    hours = request.args.get("hours")
    date_from = request.args.get("from")
    date_to = request.args.get("to")
    zone = request.args.get("zone")
    estado = request.args.get("estado")

    client = get_influx_client()
    try:
        if date_from and date_to:
            time_filter = f"time >= '{date_from}' AND time <= '{date_to}'"
        elif hours:
            time_filter = f"time > now() - {hours}h"
        else:
            time_filter = "time > now() - 24h"

        site_filter = f"AND site_id = '{site_id}'" if site_id else ""
        zone_filter = f"AND zone = '{zone}'" if zone else ""
        estado_filter = f"AND estado = '{estado}'" if estado else ""

        query = f"""
            SELECT SUM(download_capacity) AS download,
                   SUM(upload_capacity) AS upload
            FROM sites
            WHERE {time_filter} {site_filter} {zone_filter} {estado_filter}
            GROUP BY TIME(5m)
        """
        result = client.query(query)
        points = []
        if result and "series" in getattr(result, "raw", {}):
            for series in result.raw["series"]:
                tags = series.get("tags", {})
                for value in series.get("values", []):
                    point = {
                        "time": value[0],
                        "download": value[1] if value[1] is not None else 0,
                        "upload": value[2] if value[2] is not None else 0,
                    }
                    if date_from:
                        point[site_id or "site"] = tags.get("site_id", "")
                    points.append(point)
        return jsonify(points)
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        client.close()


@app.route("/api/devices")
@token_required
def devices_list():
    """Lista de dispositivos cliente con filtros"""
    site_id = request.args.get("site_id")
    status = request.args.get("status")
    search = request.args.get("search", "").lower()
    
    client = get_influx_client()
    try:
        devices = query_latest_devices(client)
        
        if site_id:
            # Filtro robusto: convertir ambos a cadena para asegurar coincidencia
            devices = [d for d in devices if str(d.get("site_id")) == str(site_id)]
            
        if status:
            devices = [
                d for d in devices if str(d.get("status", "")).lower() == status.lower()
            ]
        if search:
            devices = [
                d
                for d in devices
                if search in str(d.get("device_name", "")).lower()
            ]
        
        return jsonify(devices)
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        client.close()




@app.route("/api/activity")
@token_required
def activity():
    """Actividad historica: clientes online/offline en el tiempo.
    Toma el ultimo punto de cada site por hora para evitar duplicados."""
    site_id = request.args.get("site_id")
    hours = request.args.get("hours")
    date_from = request.args.get("from")
    date_to = request.args.get("to")
    zone = request.args.get("zone")
    estado = request.args.get("estado")

    client = get_influx_client()
    try:
        site_filter = f"AND site_id = '{site_id}'" if site_id else ""
        zone_filter = f"AND zone = '{zone}'" if zone else ""
        estado_filter = f"AND estado = '{estado}'" if estado else ""

        if date_from and date_to:
            time_filter = f"time >= '{date_from}' AND time <= '{date_to}'"
        elif hours:
            time_filter = f"time > now() - {hours}h"
        else:
            time_filter = "time > now() - 168h"

        query = f"""
            SELECT * FROM sites
            WHERE {time_filter} {site_filter} {zone_filter} {estado_filter}
            GROUP BY site_id
        """
        result = client.query(query)

        hour_site_latest = {}

        if result and "series" in getattr(result, "raw", {}):
            for series in result.raw["series"]:
                tags = series.get("tags", {})
                sid = tags.get("site_id", "")
                columns = series["columns"]

                try:
                    time_idx = columns.index("time")
                    dc_idx = columns.index("device_count")
                    da_idx = columns.index("devices_available")
                except ValueError:
                    continue

                for values in series.get("values", []):
                    ts = values[time_idx]
                    dc = values[dc_idx] if values[dc_idx] is not None else 0
                    da = values[da_idx] if values[da_idx] is not None else 0
                    hour_key = ts[:13] + ":00:00Z"
                    key = f"{hour_key}|{sid}"
                    hour_site_latest[key] = {
                        "hour": hour_key,
                        "total": int(float(dc)),
                        "online": int(float(da)),
                    }

        points = {}
        for key, val in hour_site_latest.items():
            h = val["hour"]
            if h not in points:
                points[h] = {"total": 0, "online": 0}
            points[h]["total"] += val["total"]
            points[h]["online"] += val["online"]

        result_list = sorted(
            [
                {
                    "time": h,
                    "total": v["total"],
                    "online": v["online"],
                    "offline": v["total"] - v["online"],
                }
                for h, v in points.items()
            ],
            key=lambda x: x["time"],
        )

        return jsonify(result_list)
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        client.close()


@app.route("/api/site-devices")
@token_required
def site_devices():
    """Conteo de dispositivos por modelo para un site. Incluye APs y CPEs."""
    site_id = request.args.get("site_id", "")

    if not site_id:
        return jsonify({"error": "site_id requerido"}), 400

    client = get_influx_client()
    try:
        result = client.query("SELECT * FROM devices ORDER BY time DESC")
        latest = {}
        if result and "series" in getattr(result, "raw", {}):
            for series in result.raw["series"]:
                columns = series["columns"]
                for values in series.get("values", []):
                    row = {}
                    for col, val in zip(columns, values):
                        row[col] = val if val is not None else 0
                    did = row.get("device_id", "")
                    sid = row.get("site_id", "")
                    if did and sid == site_id and did not in latest:
                        latest[did] = row

        lb5_total = 0
        lb5_online = 0
        ap_total = 0
        ap_online = 0

        for device in latest.values():
            model = str(device.get("device_model", "")).strip()
            status = str(device.get("status", "")).lower()
            is_online = status == "active"

            if model == "LB5":
                lb5_total += 1
                if is_online:
                    lb5_online += 1
            elif model in AP_MODELS:
                ap_total += 1
                if is_online:
                    ap_online += 1

        return jsonify(
            {
                "site_id": site_id,
                "hogares_total": lb5_total,
                "hogares_online": lb5_online,
                "hogares_offline": lb5_total - lb5_online,
                "aps_total": ap_total,
                "aps_online": ap_online,
                "aps_offline": ap_total - ap_online,
            }
        )
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        client.close()


@app.route("/api/alerts")
@token_required
def alerts():
    """Sites con todos los dispositivos caidos, solo juntas en operacion"""
    client = get_influx_client()
    try:
        sites = query_latest_sites(client)
        offline_sites = []
        overrides = load_estado_overrides()
        for s in sites:
            code_match = re.match(r"^(\d+)", s.get("site_name", ""))
            code = code_match.group(1) if code_match else ""
            estado = overrides.get(code) or s.get("estado", "")
            if estado != "Operación":
                continue
            ap_total = s.get("ap_count", 0)
            ap_online = s.get("ap_online", 0)
            if ap_total > 0 and ap_online == 0:
                sid = s.get("site_id", "")
                # Buscar ultima vez que tuvo APs online
                last_online = None
                hours_down = None
                try:
                    q = f"SELECT ap_online FROM sites WHERE site_id = '{sid}' AND ap_online > 0 ORDER BY time DESC LIMIT 1"
                    r = client.query(q)
                    if r and "series" in getattr(r, "raw", {}) and r.raw["series"]:
                        last_ts = r.raw["series"][0]["values"][0][0]
                        last_online = last_ts
                        last_dt = datetime.fromisoformat(last_ts.replace("Z", "+00:00"))
                        now_utc = datetime.now(pytz.UTC)
                        hours_down = round((now_utc - last_dt).total_seconds() / 3600, 1)
                except Exception:
                    pass

                offline_sites.append(
                    {
                        "site_id": sid,
                        "site_name": s.get("site_name", ""),
                        "zone": s.get("zone", ""),
                        "ap_total": ap_total,
                        "ap_online": ap_online,
                        "device_count": s.get("device_count", 0),
                        "estado": estado,
                        "fecha_inicio": s.get("fecha_inicio", ""),
                        "last_online": last_online or "",
                        "hours_down": hours_down if hours_down is not None else "sin registro",
                    }
                )
        return jsonify(offline_sites)
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        client.close()


@app.route("/api/report")
@token_required
def report():
    """Reporte resumen por zona/departamento"""
    client = get_influx_client()
    try:
        sites = query_latest_sites(client)

        zones = {}
        for s in sites:
            zone = s.get("zone") or "Sin zona"
            dept = s.get("department") or "Sin depto"
            key = f"{zone}|{dept}"

            if key not in zones:
                zones[key] = {
                    "zone": zone,
                    "department": dept,
                    "total_sites": 0,
                    "sites_online": 0,
                    "total_clients": 0,
                    "clients_online": 0,
                    "sites": [],
                }

            zones[key]["total_sites"] += 1
            if is_site_online(s):
                zones[key]["sites_online"] += 1
            zones[key]["total_clients"] += s.get("device_count", 0)
            zones[key]["clients_online"] += s.get("devices_available", 0)
            zones[key]["sites"].append(
                {
                    "name": s.get("site_name", ""),
                    "status": s.get("status", ""),
                    "online": is_site_online(s),
                    "clients": s.get("device_count", 0),
                    "clients_online": s.get("devices_available", 0),
                    "download": round(s.get("download_capacity", 0), 4),
                    "upload": round(s.get("upload_capacity", 0), 4),
                }
            )

        result = sorted(zones.values(), key=lambda z: -z["total_clients"])
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        client.close()


@app.route("/api/toggle-estado", methods=["POST"])
@token_required
def toggle_estado():
    """Cambia el estado de una junta entre Operacion e Implementacion"""
    data = request.get_json() or {}
    code = data.get("code", "").strip()
    nuevo_estado = data.get("estado", "").strip()

    if not code or not nuevo_estado:
        return jsonify({"error": "code y estado requeridos"}), 400

    overrides = load_estado_overrides()
    overrides[code] = nuevo_estado
    save_estado_overrides(overrides)

    return jsonify({"ok": True, "code": code, "estado": nuevo_estado})


def get_estado_overrides_path():
    return os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "estado_overrides.json")


def load_estado_overrides():
    path = get_estado_overrides_path()
    if os.path.exists(path):
        with open(path) as f:
            return json.load(f)
    return {}


def save_estado_overrides(data):
    path = get_estado_overrides_path()
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        json.dump(data, f)


@app.route("/api/zones")
@token_required
def zones():
    """Zonas disponibles para filtros"""
    client = get_influx_client()
    try:
        result = client.query("SHOW TAG VALUES FROM sites WITH KEY = zone")
        zones = []
        if result and "series" in getattr(result, "raw", {}):
            for series in result.raw["series"]:
                for value in series.get("values", []):
                    if value[1] and value[1] != "unknown":
                        zones.append(value[1])
        return jsonify(sorted(set(zones)))
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        client.close()


# ---------------------------------------------------------------------------
# SERVIR REACT BUILD
# ---------------------------------------------------------------------------

@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def serve_react(path):
    if path and os.path.exists(os.path.join(app.static_folder, path)):
        return send_from_directory(app.static_folder, path)
    return send_from_directory(app.static_folder, "index.html")


# ---------------------------------------------------------------------------
# ENTRY POINT
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    if not os.path.exists(os.path.join(app.static_folder, "index.html")):
        print(
            "WARNING: React build no encontrado. Ejecuta: cd dashboard && npm run build",
            file=sys.stderr,
        )

    port = int(os.getenv("DASHBOARD_PORT", 5000))
    debug = os.getenv("ENVIRONMENT", "production") == "development"
    app.run(host="0.0.0.0", port=port, debug=debug)
