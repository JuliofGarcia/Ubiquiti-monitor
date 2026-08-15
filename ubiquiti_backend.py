import requests
import time
import logging
from datetime import datetime
from typing import Dict, List, Tuple, Optional
from dataclasses import dataclass
from influxdb import InfluxDBClient
import pytz
from config import CONFIG as GlobalConfig

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
    Retorna dict: codigo_inred -> {department, centro_poblado, lat, lon}
    """
    mapping = {}
    try:
        from openpyxl import load_workbook

        wb = load_workbook(filepath, read_only=True)
        ws = wb.active
        
        # Saltamos el encabezado y usamos índices
        for row in ws.iter_rows(min_row=2, values_only=True):
            if not row or not row[1]:
                continue
            
            code = str(row[1]).strip()
            # Indices basados en el análisis de df.columns:
            # 1: CODIGO INRED, 3: DEPARTAMENTO, 5: CENTRO POBLADO, 6: LAT, 7: LON
            mapping[code] = {
                "department": str(row[3]).strip() if row[3] else "",
                "centro_poblado": str(row[5]).strip() if row[5] else "",
                "latitude": float(row[6] or 0),
                "longitude": float(row[7] or 0),
                "estado": "Implementación",
                "fecha_inicio": "",
            }
        wb.close()
        logger.info(f"Mapeo Excel cargado: {len(mapping)} codigos INRED")
    except Exception as e:
        logger.warning(f"No se pudo cargar Excel de mapeo: {e}")

    return mapping


def load_operational_sites(filepath: str = "base_operacion.xlsx") -> Dict:
    """Carga el Excel de juntas en operacion y retorna mapeo por codigo INRED.
    Retorna dict: codigo_inred -> {department, fecha_inicio, estado}
    """
    ops = {}
    try:
        from openpyxl import load_workbook

        wb = load_workbook(filepath, data_only=True)
        ws = wb.active
        for row in ws.iter_rows(min_row=2, values_only=True):
            if not row or not row[1]:
                continue
            code = str(row[1]).strip()
            dept = str(row[3]).strip() if row[3] else ""
            fecha = row[14]
            if fecha:
                try:
                    fecha_str = str(fecha)[:10]
                except Exception:
                    fecha_str = ""
            else:
                fecha_str = ""

            ops[code] = {
                "department": dept,
                "fecha_inicio": fecha_str,
                "estado": "Operación",
            }
        wb.close()
        logger.info(f"Juntas en operacion cargadas: {len(ops)}")
    except Exception as e:
        logger.warning(f"No se pudo cargar Excel de operacion: {e}")

    return ops

# ============================================================================
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
    department: Optional[str] = None
    estado: str = "Implementación"
    fecha_inicio: str = ""
    contact_email: str = ""
    inred_code: Optional[str] = None
    
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
        logger.info("Obteniendo devices...")
        return self._make_request("/devices") or []

# ============================================================================
# PROCESADOR DE DATOS
# ============================================================================
class DataProcessor:
    """Procesa datos de la API en objetos estructurados"""
    
    def __init__(self, department_mapping: Dict = None):
        self.department_mapping = department_mapping or {}
    
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
    
    def get_site_mapping(self, site_id: str, site_name: str, ip_address: str) -> Tuple[Dict, Optional[str]]:
        """Obtiene el mapeo completo y el código INRED encontrado"""
        empty = {"department": None, "estado": "Implementación", "fecha_inicio": ""}
        
        if site_id in self.department_mapping:
            return self.department_mapping[site_id], site_id
        if ip_address in self.department_mapping:
            return self.department_mapping[ip_address], ip_address

        # Intentar encontrar el código INRED en cualquier parte del nombre del sitio
        for code in self.department_mapping.keys():
            if code and str(code) in site_name:
                return self.department_mapping[code], code


        if "-" in site_name:
            parts = site_name.split("-")
            if len(parts) >= 2:
                empty["department"] = parts[1].strip()

        return empty, None
    
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
            mapping, inred_code = self.get_site_mapping(site_id, site_name, ip_address)
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
                last_seen=overview.get("lastSeen", ""),
                created_at=identification.get("updated", datetime.now().isoformat()),
                sla=sla,
                department=department,
                estado=estado,
                fecha_inicio=fecha_inicio,
                contact_email=contact_email,
                inred_code=inred_code
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
                downlink_utilization=downlink_util,
                uplink_utilization=uplink_util,
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
                    "department": site.department or "unknown",
                    "estado": site.estado or "Implementación",
                    "fecha_inicio": site.fecha_inicio or "",
                    "inred_code": site.inred_code or "unknown",
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
                    "longitude": float(site.location.get("longitude", 0.0)),
                    "last_seen": site.last_seen
                },
                "time": self._parse_timestamp(site.last_seen) or int(time.time() * 1e9)
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
                "time": self._parse_timestamp(device.last_seen) or int(time.time() * 1e9)
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
        """Escribe datos agregados por departamento"""
        points = []
        
        # Agrupar por departamento
        dept_summary = {}
        for site in sites:
            key = site.department or "unknown"
            if key not in dept_summary:
                dept_summary[key] = {
                    "site_count": 0,
                    "total_devices": 0,
                    "active_devices": 0,
                    "failed_devices": 0,
                    "total_download": 0,
                    "total_upload": 0,
                    "average_sla": 0,
                    "sla_count": 0
                }
            
            dept_summary[key]["site_count"] += 1
            dept_summary[key]["total_devices"] += site.device_count
            dept_summary[key]["active_devices"] += (site.device_count - site.device_outage_count)
            dept_summary[key]["failed_devices"] += site.device_outage_count
            dept_summary[key]["total_download"] += site.download_capacity
            dept_summary[key]["total_upload"] += site.upload_capacity
            dept_summary[key]["average_sla"] += site.sla
            dept_summary[key]["sla_count"] += 1
        
        # Crear puntos de datos agregados
        for department, summary in dept_summary.items():
            average_sla = summary["average_sla"] / summary["sla_count"] if summary["sla_count"] > 0 else 0
            
            point = {
                "measurement": "dept_summary",
                "tags": {
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
    def _parse_timestamp(timestamp_str: str) -> Optional[int]:
        """Convierte timestamp ISO a nanosegundos (UTC), retorna None si no es valido"""
        try:
            if isinstance(timestamp_str, str) and timestamp_str.strip():
                ts = timestamp_str.replace("Z", "+00:00")
                dt = datetime.fromisoformat(ts)
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=pytz.UTC)
                return int(dt.timestamp() * 1e9)
            return None
        except Exception:
            return None

# ============================================================================
# MONITOR PRINCIPAL
# ============================================================================
class UbiquitiMonitor:
    """Orquestador principal del sistema de monitoreo"""
    
    def __init__(self, config_dict: Dict):
        self.config = config_dict
        ubiq = config_dict["ubiquiti"]
        influx = config_dict["influxdb"]

        self.api_client = UbiquitiAPIClient(ubiq["api_url"], ubiq["token"], ubiq["verify_ssl"])
        self.data_processor = DataProcessor(self.config["departments"])
        self.influx_manager = InfluxDBManager(
            influx["host"],
            influx["port"],
            influx["username"],
            influx["password"],
            influx["database"]
        )

    def fetch_and_process(self):
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
        
        logger.info(f"Ciclo completado: {len(sites)} sites reales")
        
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
                            f"Dept: {site.department}"
                        )
                else:
                    logger.warning("No se obtuvieron datos de la API")
                
                logger.info(f"Próxima ejecución en {self.config['monitoring']['polling_interval']}s")
                time.sleep(self.config['monitoring']['polling_interval'])
                
            except KeyboardInterrupt:
                logger.info("Monitor detenido por el usuario")
                break
            except Exception as e:
                logger.error(f"Error en ciclo de monitoreo: {e}", exc_info=True)
                logger.info(f"Reintentando en {self.config['monitoring']['polling_interval']}s...")
                time.sleep(self.config['monitoring']['polling_interval'])

# ============================================================================
# PUNTO DE ENTRADA
# ============================================================================
if __name__ == "__main__":
    # Cargar mapeo desde Excel de instalaciones
    excel_mapping = load_excel_mapping("base_instalaciones.xlsx")
    operaciones = load_operational_sites("base_operacion.xlsx")

    # Merge: priorizar info de operacion pero rellenar departamentos faltantes desde instalaciones
    final_mapping = excel_mapping.copy()
    
    for code, op_data in operaciones.items():
        if code in final_mapping:
            # Actualizar estado y fecha de inicio
            final_mapping[code]["estado"] = op_data["estado"]
            final_mapping[code]["fecha_inicio"] = op_data.get("fecha_inicio", "")
            
            # Si el departamento en instalaciones está vacío, usar el de operaciones
            if not final_mapping[code].get("department") and op_data.get("department"):
                final_mapping[code]["department"] = op_data["department"]
        else:
            # Junta que solo existe en base_operacion
            # Intentar asignar departamento si existe en op_data
            final_mapping[code] = {
                "department": op_data.get("department", ""),
                "centro_poblado": "",
                "latitude": 0,
                "longitude": 0,
                "estado": op_data["estado"],
                "fecha_inicio": op_data.get("fecha_inicio", ""),
            }
    
    # Inyectar el mapeo final en la configuración global
    GlobalConfig["departments"] = final_mapping
    
    # Crear y ejecutar monitor
    monitor = UbiquitiMonitor(GlobalConfig)
    monitor.run()
