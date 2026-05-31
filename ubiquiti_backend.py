import requests
import time
import logging
import json
import os
import re
from datetime import datetime
from typing import Dict, List, Tuple, Optional
from dataclasses import dataclass
from influxdb import InfluxDBClient
import pytz
from functools import lru_cache
from dotenv import load_dotenv

# Cargar variables de entorno desde .env
load_dotenv()

# CONFIGURACIÓN DE LOGGING
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('ubiquiti_monitor.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)


# ============================================================================
# CARGA DE MAPEO DESDE EXCEL
# ============================================================================
def load_excel_mapping(filepath: str = "base_instalaciones.xlsx") -> Dict:
    """Carga el archivo Excel de instalaciones y genera mapeo por codigo INRED.
    Retorna dict: codigo_inred -> {zone, department, centro_poblado, lat, lon}
    """
    mapping = {}
    try:
        from openpyxl import load_workbook

        wb = load_workbook(filepath, read_only=True)
        ws = wb.active
        headers = None
        for row in ws.iter_rows(values_only=True):
            if headers is None:
                headers = [str(h).strip() if h else "" for h in row]
                continue
            data = dict(zip(headers, row))
            code = str(data.get("CODIGO INRED") or data.get("CÓDIGO INRED", "")).strip()
            if not code:
                continue
            mapping[code] = {
                "zone": str(data.get("DEPARTAMENTO - ANEXO 1", "")).strip(),
                "department": str(data.get("DEPARTAMENTO - ANEXO 1", "")).strip(),
                "centro_poblado": str(data.get("CENTRO POBLADO", "")).strip(),
                "latitude": float(data.get("LATITUD - FINAL NODO", 0) or 0),
                "longitude": float(data.get("LONGITUD - FINAL NODO", 0) or 0),
                "estado": "Implementación",
                "fecha_inicio": "",
            }
        wb.close()
        logger.info(f"Mapeo Excel cargado: {len(mapping)} codigos INRED")
    except Exception as e:
        logger.warning(f"No se pudo cargar Excel de mapeo: {e}")

    return mapping


def load_operational_sites(filepath: str = "juntas_operacion.xlsx") -> Dict:
    """Carga el Excel de juntas en operacion y retorna mapeo por codigo INRED.
    Retorna dict: codigo_inred -> {fecha_inicio, estado}
    """
    ops = {}
    try:
        from openpyxl import load_workbook

        wb = load_workbook(filepath, data_only=True)
        ws = wb.active
        for row in ws.iter_rows(min_row=3, values_only=True):
            if not row or not row[0]:
                continue
            code = str(row[0]).strip()
            fecha = row[6]
            if fecha:
                try:
                    fecha_str = str(fecha)[:10]
                except Exception:
                    fecha_str = ""
            else:
                fecha_str = ""

            ops[code] = {
                "fecha_inicio": fecha_str,
                "estado": "Operación",
            }
        wb.close()
        logger.info(f"Juntas en operacion cargadas: {len(ops)}")
    except Exception as e:
        logger.warning(f"No se pudo cargar Excel de operacion: {e}")

    return ops

# ============================================================================
# CONFIGURACIÓN
# ============================================================================
class Config:
    # API Ubiquiti
    API_BASE_URL = os.getenv('UBIQUITI_API_URL', 'https://juntasub.inred.com.co/nms/api/v2.1')
    API_TOKEN = os.getenv('UBIQUITI_API_TOKEN', '')
    
    # InfluxDB
    INFLUX_HOST = os.getenv('INFLUXDB_HOST', 'influxdb')
    INFLUX_PORT = int(os.getenv('INFLUXDB_PORT', 8086))
    INFLUX_USER = os.getenv('INFLUXDB_ADMIN_USER', 'admin')
    INFLUX_PASSWORD = os.getenv('INFLUXDB_ADMIN_PASSWORD', 'password')
    INFLUX_DATABASE = os.getenv('INFLUXDB_DATABASE', 'monitoreo')
    VERIFY_SSL = os.getenv('UBIQUITI_VERIFY_SSL', 'true').lower() == 'true'
    
    # Intervalo de consulta (segundos)
    POLLING_INTERVAL = int(os.getenv('POLLING_INTERVAL', 300))  # 5 minutos
    
    # Configuración de zonas/departamentos (personalizar según tu estructura)
    ZONE_MAPPING = {
        # Mapea IP de site o nombre a zona/departamento
        # Ej: "192.168.1.0": {"zone": "Norte", "department": "Cundinamarca"}
    }

# ============================================================================
# DATACLASSES
# ============================================================================
@dataclass
class SiteData:
    """Datos principales de un Site (AP)"""
    site_id: str
    site_name: str
    site_status: str
    location: Dict
    elevation: float
    device_count: int
    device_outage_count: int
    download_capacity: float
    upload_capacity: float
    last_seen: str
    created_at: str
    sla: float
    ap_count: int = 0
    ap_online: int = 0
    zone: Optional[str] = None
    department: Optional[str] = None
    estado: str = "Implementación"
    fecha_inicio: str = ""
    contact_email: str = ""
    
@dataclass
class DeviceData:
    """Datos de un Device (Hogar/Cliente)"""
    device_id: str
    device_name: str
    device_model: str
    device_status: str
    ip_address: str
    mac_address: str
    site_id: str
    site_name: str
    signal_strength: float
    traffic_summary: float
    rx_capacity: float
    tx_capacity: float
    rx_throughput: float
    tx_throughput: float
    downlink_utilization: float
    uplink_utilization: float
    last_seen: str
    uptime: int
    temperature: Optional[float] = None
    cpu_usage: Optional[float] = None
    ram_usage: Optional[float] = None

# ============================================================================
# CLIENTE API UBIQUITI
# ============================================================================
class UbiquitiAPIClient:
    """Cliente para interactuar con la API de Ubiquiti"""
    
    def __init__(self, base_url: str, token: str, verify_ssl: bool = True):
        self.base_url = base_url
        self.token = token
        self.verify_ssl = verify_ssl
        self.headers = {
            "accept": "application/json",
            "x-auth-token": token,
            "Content-Type": "application/json"
        }
        self.session = requests.Session()
        self.session.headers.update(self.headers)
        self.session.verify = verify_ssl
    
    def _make_request(self, endpoint: str, method: str = "GET", data: Dict = None) -> Dict:
        """Realiza una solicitud HTTP a la API"""
        url = f"{self.base_url}{endpoint}"
        try:
            if method == "GET":
                response = self.session.get(url, timeout=60)
            else:
                response = self.session.request(method, url, json=data, timeout=10)
            
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            logger.error(f"Error en API request {endpoint}: {e}")
            return {}
    
    def get_sites(self) -> List[Dict]:
        """Obtiene todos los sites (APs)"""
        logger.info("Obteniendo sites...")
        return self._make_request("/sites") or []
    
    def get_devices(self) -> List[Dict]:
        """Obtiene todos los devices"""
        logger.info("Obteniendo devices...")
        # Cambiamos endpoint si es necesario para obtener detalles completos,
        # pero asumimos que /devices ya trae lo que necesitamos.
        # ¿La API soporta parámetros para traer más detalles?
        return self._make_request("/devices") or []
    
    def get_device_statistics(self, device_id: str) -> Dict:
        """Obtiene estadísticas detalladas de un device"""
        return self._make_request(f"/devices/{device_id}/statistics") or {}
    
    def get_site_details(self, site_id: str) -> Dict:
        """Obtiene detalles específicos de un site"""
        return self._make_request(f"/sites/{site_id}") or {}

# ============================================================================
# PROCESADOR DE DATOS
# ============================================================================
class DataProcessor:
    """Procesa datos de la API en objetos estructurados"""
    
    def __init__(self, zone_mapping: Dict = None):
        self.zone_mapping = zone_mapping or {}
    
    @staticmethod
    def safe_float(value, default: float = 0.0) -> float:
        """Convierte un valor a float de forma segura, manejando None"""
        if value is None:
            return default
        try:
            return float(value)
        except (ValueError, TypeError):
            return default
    
    @staticmethod
    def safe_int(value, default: int = 0) -> int:
        """Convierte un valor a int de forma segura, manejando None"""
        if value is None:
            return default
        try:
            return int(value)
        except (ValueError, TypeError):
            return default
    
    def get_site_mapping(self, site_id: str, site_name: str, ip_address: str) -> Dict:
        """Obtiene el mapeo completo para un site (zone, dept, estado, fecha_inicio)"""
        empty = {"zone": None, "department": None, "estado": "Implementación", "fecha_inicio": ""}

        if site_id in self.zone_mapping:
            return self.zone_mapping[site_id]
        if ip_address in self.zone_mapping:
            return self.zone_mapping[ip_address]

        code_match = re.match(r"^(\d+)", site_name.strip())
        if code_match:
            code = code_match.group(1)
            if code in self.zone_mapping:
                return self.zone_mapping[code]

        if "-" in site_name:
            parts = site_name.split("-")
            if len(parts) >= 2:
                empty["zone"] = parts[0].strip()
                empty["department"] = parts[1].strip()

        return empty
    
    def process_site(self, site_data: Dict) -> Optional[SiteData]:
        """Procesa datos de un site"""
        try:
            # PROTECCIÓN 1: Usar 'or {}' garantiza que si la API devuelve 'null', 
            # Python asigne un diccionario vacío en lugar de None
            identification = site_data.get("identification") or {}
            description = site_data.get("description") or {}
            overview = site_data.get("overview") or {}
            
            site_id = identification.get("id", "")
            site_name = identification.get("name", "unknown")
            site_status = identification.get("status", "unknown")
            
            # Ubicación
            location = description.get("location") or {}
            
            # PROTECCIÓN 2: Usar tus funciones self.safe_float y self.safe_int
            download_capacity = self.safe_float(overview.get("downlinkCapacity"))
            upload_capacity = self.safe_float(overview.get("uplinkCapacity"))
            
            # Dispositivos
            device_count = self.safe_int(description.get("deviceCount"))
            device_outage_count = self.safe_int(description.get("deviceOutageCount"))
            
            # Contacto
            contact = description.get("contact") or {}
            contact_email = contact.get("email", "")
            
            # SLA
            sla = self.safe_float(description.get("sla"))
            
            # Obtener zona y departamento protegiendo la lista de IPs
            ip_addresses = description.get("ipAddresses") or [""]
            ip_address = ip_addresses[0] if ip_addresses else ""
            mapping = self.get_site_mapping(site_id, site_name, ip_address)
            zone = mapping.get("zone")
            department = mapping.get("department")
            estado = mapping.get("estado", "Implementación")
            fecha_inicio = mapping.get("fecha_inicio", "")

            site_obj = SiteData(
                site_id=site_id,
                site_name=site_name,
                site_status=site_status,
                location=location,
                elevation=self.safe_float(description.get("elevation")),
                device_count=device_count,
                device_outage_count=device_outage_count,
                download_capacity=download_capacity,
                upload_capacity=upload_capacity,
                last_seen=overview.get("lastSeen", datetime.now().isoformat()),
                created_at=identification.get("updated", datetime.now().isoformat()),
                sla=sla,
                zone=zone,
                department=department,
                estado=estado,
                fecha_inicio=fecha_inicio,
                contact_email=contact_email
            )
            
            return site_obj
        except Exception as e:
            logger.error(f"Error procesando site: {e}")
            return None
    
    def process_device(self, device_data: Dict, sites_map: Dict[str, SiteData]) -> Optional[DeviceData]:
        """Procesa datos de un device"""
        try:
            # PROTECCIÓN 1
            identification = device_data.get("identification") or {}
            overview = device_data.get("overview") or {}
            meta = device_data.get("meta") or {}
            
            device_id = identification.get("id", "")
            device_name = identification.get("name", "unknown")
            device_model = identification.get("model", "unknown")
            device_status = overview.get("status") or identification.get("status", "unknown")
            # --- CAMBIO: Buscamos en 'ipAddress' o 'ipAddressList' ---
            ip_address = device_data.get("ipAddress") or (device_data.get("ipAddressList", [])[0] if device_data.get("ipAddressList") else "")
            mac_address = identification.get("mac", "")
            
            # Site padre
            site_info = identification.get("site") or {}
            site_id = site_info.get("id", "")
            site_name = site_info.get("name", "unknown")
            
            # PROTECCIÓN 2: Reemplazo masivo de float() por self.safe_float()
            downlink = self.safe_float(overview.get("downlinkCapacity"))
            uplink = self.safe_float(overview.get("uplinkCapacity"))
            
            # El tráfico real es la utilización (throughput en bps/Bps según dispositivo)
            # Solo si el dispositivo está activo reportamos tráfico, evitando datos stale de la API
            is_active = str(device_status).lower() == "active"
            
            if is_active:
                downlink_util = self.safe_float(overview.get("downlinkUtilization"))
                uplink_util = self.safe_float(overview.get("uplinkUtilization"))
            else:
                downlink_util = 0.0
                uplink_util = 0.0

            traffic_summary = downlink_util + uplink_util
            rx_capacity = downlink
            tx_capacity = uplink
            rx_throughput = downlink_util
            tx_throughput = uplink_util
            downlink_util_val = downlink_util
            uplink_util_val = uplink_util
            
            # Calidad de señal (con valor por defecto -100)
            signal_strength = self.safe_float(overview.get("signal"), -100.0)
            
            # Uso de recursos
            cpu_usage = self.safe_float(overview.get("cpu"))
            ram_usage = self.safe_float(overview.get("ram"))
            temperature = self.safe_float(overview.get("temperature"))
            uptime = self.safe_int(overview.get("uptime"))
            
            device_obj = DeviceData(
                device_id=device_id,
                device_name=device_name,
                device_model=device_model,
                device_status=device_status,
                ip_address=ip_address,
                mac_address=mac_address,
                site_id=site_id,
                site_name=site_name,
                signal_strength=signal_strength,
                traffic_summary=traffic_summary,
                rx_capacity=rx_capacity,
                tx_capacity=tx_capacity,
                rx_throughput=rx_throughput,
                tx_throughput=tx_throughput,
                downlink_utilization=downlink_util_val,
                uplink_utilization=uplink_util_val,
                last_seen=overview.get("lastSeen", datetime.now().isoformat()),
                uptime=uptime,
                temperature=temperature,
                cpu_usage=cpu_usage,
                ram_usage=ram_usage
            )
            # print(f"DEBUG: Processed device {device_name} with IP {ip_address}")
            return device_obj
        except Exception as e:
            logger.error(f"Error procesando device: {e}")
            return None
# ============================================================================
# GESTOR DE INFLUXDB
# ============================================================================
class InfluxDBManager:
    """Gestiona la conexión y escritura de datos en InfluxDB"""
    
    def __init__(self, host: str, port: int, user: str, password: str, database: str):
        self.client = InfluxDBClient(
            host=host,
            port=port,
            username=user,
            password=password,
            database=database,
            timeout=5
        )
        self.database = database
        self._ensure_database()
    
    def _ensure_database(self):
        """Crea la base de datos si no existe"""
        try:
            databases = self.client.get_list_database()
            if self.database not in [db['name'] for db in databases]:
                self.client.create_database(self.database)
                logger.info(f"Base de datos '{self.database}' creada")
        except Exception as e:
            logger.error(f"Error verificando/creando base de datos: {e}")
    
    def write_site_data(self, sites: List[SiteData]) -> int:
        """Escribe datos de sites en InfluxDB"""
        points = []
        
        for site in sites:
            point = {
                "measurement": "sites",
                "tags": {
                    "site_id": site.site_id,
                    "site_name": site.site_name,
                    "status": site.site_status,
                    "zone": site.zone or "unknown",
                    "department": site.department or "unknown",
                    "estado": site.estado or "Implementación",
                    "fecha_inicio": site.fecha_inicio or "",
                },
                "fields": {
                    "device_count": site.device_count,
                    "device_outage_count": site.device_outage_count,
                    "devices_available": site.device_count - site.device_outage_count,
                    "ap_count": site.ap_count,
                    "ap_online": site.ap_online,
                    "download_capacity": float(site.download_capacity),
                    "upload_capacity": float(site.upload_capacity),
                    "elevation": float(site.elevation),
                    "sla": float(site.sla),
                    # AQUI ESTABA EL ERROR (0 -> 0.0)
                    "latitude": float(site.location.get("latitude", 0.0)),
                    "longitude": float(site.location.get("longitude", 0.0))
                },
                "time": int(datetime.now(pytz.UTC).timestamp() * 1e9)
            }
            points.append(point)
        
        try:
            self.client.write_points(points, time_precision='n')
            logger.info(f"Escritos {len(points)} registros de sites")
            return len(points)
        except Exception as e:
            logger.error(f"Error escribiendo sites: {e}")
            return 0
    
    def write_device_data(self, devices: List[DeviceData]) -> int:
        """Escribe datos de devices en InfluxDB"""
        points = []
        
        for device in devices:
            point = {
                "measurement": "devices",
                "tags": {
                    "device_id": device.device_id,
                    "device_name": device.device_name,
                    "device_model": device.device_model,
                    "status": device.device_status,
                    "site_id": device.site_id,
                    "site_name": device.site_name,
                    "ip_address": device.ip_address,
                    "mac_address": device.mac_address
                },
               "fields": {
                    "signal_strength": float(device.signal_strength),
                    "traffic_summary": float(device.traffic_summary),
                    "rx_capacity": float(device.rx_capacity),
                    "tx_capacity": float(device.tx_capacity),
                    "rx_throughput": float(device.rx_throughput),
                    "tx_throughput": float(device.tx_throughput),
                    "downlink_utilization": float(device.downlink_utilization),
                    "uplink_utilization": float(device.uplink_utilization),
                    "uptime": int(device.uptime),
                    "temperature": float(device.temperature or 0.0),
                    "cpu_usage": float(device.cpu_usage or 0.0),
                    "ram_usage": float(device.ram_usage or 0.0),
                    "last_seen": device.last_seen
                },
                "time": int(datetime.now(pytz.UTC).timestamp() * 1e9)
            }
            points.append(point)
        
        try:
            self.client.write_points(points, time_precision='n')
            logger.info(f"Escritos {len(points)} registros de devices")
            return len(points)
        except Exception as e:
            logger.error(f"Error escribiendo devices: {e}")
            return 0
    
    def write_aggregated_data(self, sites: List[SiteData]) -> int:
        """Escribe datos agregados por zona/departamento"""
        points = []
        
        # Agrupar por zona y departamento
        zone_summary = {}
        for site in sites:
            key = (site.zone or "unknown", site.department or "unknown")
            if key not in zone_summary:
                zone_summary[key] = {
                    "site_count": 0,
                    "total_devices": 0,
                    "active_devices": 0,
                    "failed_devices": 0,
                    "total_download": 0,
                    "total_upload": 0,
                    "average_sla": 0,
                    "sla_count": 0
                }
            
            zone_summary[key]["site_count"] += 1
            zone_summary[key]["total_devices"] += site.device_count
            zone_summary[key]["active_devices"] += (site.device_count - site.device_outage_count)
            zone_summary[key]["failed_devices"] += site.device_outage_count
            zone_summary[key]["total_download"] += site.download_capacity
            zone_summary[key]["total_upload"] += site.upload_capacity
            zone_summary[key]["average_sla"] += site.sla
            zone_summary[key]["sla_count"] += 1
        
        # Crear puntos de datos agregados
        for (zone, department), summary in zone_summary.items():
            average_sla = summary["average_sla"] / summary["sla_count"] if summary["sla_count"] > 0 else 0
            
            point = {
                "measurement": "zone_summary",
                "tags": {
                    "zone": zone,
                    "department": department
                },
              "fields": {
                    "site_count": summary["site_count"],
                    "total_devices": summary["total_devices"],
                    "active_devices": summary["active_devices"],
                    "failed_devices": summary["failed_devices"],
                    # AQUI ESTABA EL ERROR (0 -> 0.0)
                    "device_availability_percent": float((summary["active_devices"] / summary["total_devices"] * 100) if summary["total_devices"] > 0 else 0.0),
                    "total_download": float(summary["total_download"]),
                    "total_upload": float(summary["total_upload"]),
                    "average_sla": float(average_sla)
                },
                "time": int(datetime.now(pytz.UTC).timestamp() * 1e9)
            }
            points.append(point)
        
        try:
            self.client.write_points(points, time_precision='n')
            logger.info(f"Escritos {len(points)} registros agregados")
            return len(points)
        except Exception as e:
            logger.error(f"Error escribiendo datos agregados: {e}")
            return 0
    
    @staticmethod
    def _parse_timestamp(timestamp_str: str) -> int:
        """Convierte timestamp ISO a nanosegundos (UTC)"""
        try:
            if isinstance(timestamp_str, str):
                ts = timestamp_str.replace("Z", "+00:00")
                dt = datetime.fromisoformat(ts)
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=pytz.UTC)
            else:
                dt = datetime.now(pytz.UTC)

            return int(dt.timestamp() * 1e9)
        except Exception:
            return int(datetime.now(pytz.UTC).timestamp() * 1e9)

# ============================================================================
# MONITOR PRINCIPAL
# ============================================================================
class UbiquitiMonitor:
    """Orquestador principal del sistema de monitoreo"""
    
    def __init__(self, config: Config):
        self.config = config
        self.api_client = UbiquitiAPIClient(config.API_BASE_URL, config.API_TOKEN, config.VERIFY_SSL)
        self.data_processor = DataProcessor(config.ZONE_MAPPING)
        self.influx_manager = InfluxDBManager(
            config.INFLUX_HOST,
            config.INFLUX_PORT,
            config.INFLUX_USER,
            config.INFLUX_PASSWORD,
            config.INFLUX_DATABASE
        )
    
    def fetch_and_process(self) -> Tuple[List[SiteData], List[DeviceData]]:
        """Obtiene y procesa datos de la API"""
        logger.info("=" * 60)
        logger.info("Iniciando ciclo de recolección de datos")
        logger.info("=" * 60)
        
        # Obtener datos de la API
        raw_sites = self.api_client.get_sites()
        raw_devices = self.api_client.get_devices()
        
        # Procesar sites
        sites = []
        sites_map = {}
        for raw_site in raw_sites:
            site = self.data_processor.process_site(raw_site)
            if site:
                sites.append(site)
                sites_map[site.site_id] = site
        
        logger.info(f"Procesados {len(sites)} sites")
        
        # Procesar devices
        devices = []
        for raw_device in raw_devices:
            device = self.data_processor.process_device(raw_device, sites_map)
            if device:
                devices.append(device)

        # Recomputar tráfico por site desde utilización de devices
        for site in sites:
            site.download_capacity = 0.0
            site.upload_capacity = 0.0
            site.ap_count = 0
            site.ap_online = 0
        for device in devices:
            site = sites_map.get(device.site_id)
            if site:
                site.download_capacity += device.downlink_utilization
                site.upload_capacity += device.uplink_utilization
                # Contar APs (modelos R5AC-Lite, etc.)
                model = (device.device_model or "").strip()
                if model in ("R5AC-Lite", "LAP-120", "LAP-GPS"):
                    site.ap_count += 1
                    if (device.device_status or "").lower() == "active":
                        site.ap_online += 1

        logger.info(f"Procesados {len(devices)} devices")
        
        return sites, devices
    
    def write_to_influx(self, sites: List[SiteData], devices: List[DeviceData]) -> bool:
        """Escribe datos a InfluxDB"""
        try:
            # Escribir datos de sites
            sites_count = self.influx_manager.write_site_data(sites)
            
            # Escribir datos de devices
            devices_count = self.influx_manager.write_device_data(devices)
            
            # Escribir datos agregados
            aggregated_count = self.influx_manager.write_aggregated_data(sites)
            
            logger.info(f"Total escritas: {sites_count} sites + {devices_count} devices + {aggregated_count} agregados")
            return True
        except Exception as e:
            logger.error(f"Error escribiendo en InfluxDB: {e}")
            return False
    
    def run(self):
        """Ejecuta el monitor en forma continua"""
        logger.info("Iniciando monitor de Ubiquiti...")
        
        cycle = 0
        while True:
            try:
                cycle += 1
                logger.info(f"\n>>> Ciclo #{cycle} - {datetime.now().isoformat()}")
                
                # Obtener y procesar datos
                sites, devices = self.fetch_and_process()
                
                if sites or devices:
                    # Escribir a InfluxDB
                    self.write_to_influx(sites, devices)
                    
                    # Resumen
                    logger.info(f"Resumen: {len(sites)} sites, {len(devices)} devices")
                    
                    # Mostrar algunos detalles
                    for site in sites[:3]:  # Mostrar primeros 3 sites
                        logger.info(
                            f"  Site: {site.site_name} | Status: {site.site_status} | "
                            f"Devices: {site.device_count} ({site.device_outage_count} caídos) | "
                            f"Zone: {site.zone} | Dept: {site.department}"
                        )
                else:
                    logger.warning("No se obtuvieron datos de la API")
                
                logger.info(f"Próxima ejecución en {self.config.POLLING_INTERVAL}s")
                time.sleep(self.config.POLLING_INTERVAL)
                
            except KeyboardInterrupt:
                logger.info("Monitor detenido por el usuario")
                break
            except Exception as e:
                logger.error(f"Error en ciclo de monitoreo: {e}", exc_info=True)
                logger.info(f"Reintentando en {self.config.POLLING_INTERVAL}s...")
                time.sleep(self.config.POLLING_INTERVAL)

# ============================================================================
# PUNTO DE ENTRADA
# ============================================================================
if __name__ == "__main__":
    # Crear configuración
    config = Config()
    
    # Cargar mapeo desde Excel de instalaciones
    excel_mapping = load_excel_mapping("base_instalaciones.xlsx")
    operaciones = load_operational_sites("juntas_operacion.xlsx")

    # Merge: juntas en operacion sobrescriben estado y fecha_inicio
    for code, op_data in operaciones.items():
        if code in excel_mapping:
            excel_mapping[code]["estado"] = op_data["estado"]
            excel_mapping[code]["fecha_inicio"] = op_data.get("fecha_inicio", "")
        else:
            excel_mapping[code] = {
                "zone": "",
                "department": "",
                "centro_poblado": "",
                "latitude": 0,
                "longitude": 0,
                "estado": op_data["estado"],
                "fecha_inicio": op_data.get("fecha_inicio", ""),
            }

    config.ZONE_MAPPING = excel_mapping
    
    # Crear y ejecutar monitor
    monitor = UbiquitiMonitor(config)
    monitor.run()
