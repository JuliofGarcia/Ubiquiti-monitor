# influx_utils.py
"""
Utilidades para gestionar InfluxDB
Incluye: creación de índices, políticas de retención, consultas
"""

from influxdb import InfluxDBClient
import logging

logger = logging.getLogger(__name__)

class InfluxDBUtils:
    """Utilidades de InfluxDB"""
    
    def __init__(self, host, port, user, password, database):
        self.client = InfluxDBClient(
            host=host, 
            port=port, 
            username=user, 
            password=password, 
            database=database
        )
        self.database = database
    
    # ========================================================================
    # POLÍTICAS DE RETENCIÓN
    # ========================================================================
    def create_retention_policy(self, policy_name: str, duration: str = "30d", 
                                replication: int = 1, default: bool = False):
        """
        Crea una política de retención
        
        Ejemplos de duration:
        - "1h"   : 1 hora
        - "24h"  : 1 día
        - "7d"   : 7 días
        - "30d"  : 30 días
        - "52w"  : 1 año
        - "0"    : Sin límite (infinito)
        """
        try:
            self.client.create_retention_policy(
                policy_name,
                duration,
                replication,
                database=self.database,
                default=default
            )
            logger.info(f"Política de retención '{policy_name}' creada: {duration}")
            return True
        except Exception as e:
            logger.error(f"Error creando política de retención: {e}")
            return False
    
    def list_retention_policies(self):
        """Lista todas las políticas de retención"""
        try:
            result = self.client.get_list_retention_policies()
            logger.info(f"Políticas de retención: {result}")
            return result
        except Exception as e:
            logger.error(f"Error listando políticas: {e}")
            return []
    
    def setup_default_retention(self):
        """Configura políticas de retención por defecto"""
        policies = [
            ("raw_data", "7d", 1, False),      # Datos sin procesar: 7 días
            ("aggregated", "30d", 1, False),   # Datos agregados: 30 días
            ("long_term", "1y", 1, True),      # Almacenamiento largo: 1 año (default)
        ]
        
        for policy_name, duration, replication, default in policies:
            self.create_retention_policy(policy_name, duration, replication, default)
    
    # ========================================================================
    # CONSULTAS ANALÍTICAS
    # ========================================================================
    def get_site_status_summary(self, limit: int = 10):
        """Obtiene resumen del estado de sites"""
        query = f"""
            SELECT last("device_count") as total_devices,
                   last("device_outage_count") as failed_devices,
                   last("devices_available") as available_devices,
                   last("download_capacity") as download,
                   last("upload_capacity") as upload,
                   last("sla") as sla
            FROM sites
            GROUP BY site_name
            LIMIT {limit}
        """
        try:
            result = self.client.query(query)
            return result
        except Exception as e:
            logger.error(f"Error en consulta de resumen de sites: {e}")
            return None
    
    def get_zone_summary(self):
        """Obtiene resumen por zona/departamento"""
        query = """
            SELECT last("site_count") as sites,
                   last("total_devices") as devices,
                   last("active_devices") as devices_active,
                   last("failed_devices") as devices_failed,
                   last("device_availability_percent") as availability,
                   last("average_sla") as sla
            FROM zone_summary
            GROUP BY zone, department
        """
        try:
            result = self.client.query(query)
            return result
        except Exception as e:
            logger.error(f"Error en consulta de resumen por zona: {e}")
            return None
    
    def get_device_status_by_site(self, site_id: str):
        """Obtiene estado de dispositivos por site"""
        query = f"""
            SELECT "device_name",
                   "status",
                   last("signal_strength") as signal,
                   last("uptime") as uptime,
                   last("temperature") as temperature,
                   last("cpu_usage") as cpu
            FROM devices
            WHERE site_id = '{site_id}'
            GROUP BY device_name
        """
        try:
            result = self.client.query(query)
            return result
        except Exception as e:
            logger.error(f"Error obteniendo dispositivos del site {site_id}: {e}")
            return None
    
    def get_traffic_trends(self, time_range: str = "24h"):
        """Obtiene tendencias de tráfico en las últimas X horas"""
        query = f"""
            SELECT mean("download_capacity") as avg_download,
                   max("download_capacity") as max_download,
                   mean("upload_capacity") as avg_upload,
                   max("upload_capacity") as max_upload
            FROM sites
            WHERE time > now() - {time_range}
            GROUP BY site_name, TIME(5m)
        """
        try:
            result = self.client.query(query)
            return result
        except Exception as e:
            logger.error(f"Error obteniendo tendencias de tráfico: {e}")
            return None
    
    def get_device_issues(self, threshold_signal: int = -75):
        """Identifica dispositivos con problemas (mala señal, temperatura alta, etc)"""
        query = f"""
            SELECT signal_strength, temperature, cpu_usage, ram_usage
            FROM (
                SELECT last("signal_strength") AS signal_strength,
                       last("temperature") AS temperature,
                       last("cpu_usage") AS cpu_usage,
                       last("ram_usage") AS ram_usage,
                       last("device_name") AS device_name,
                       last("site_name") AS site_name
                FROM devices
                GROUP BY device_id
            )
            WHERE signal_strength < {threshold_signal}
               OR temperature > 65
               OR cpu_usage > 80
        """
        try:
            result = self.client.query(query)
            return result
        except Exception as e:
            logger.error(f"Error identificando dispositivos con problemas: {e}")
            return None
    
    def get_availability_history(self, site_name: str, days: int = 7):
        """Obtiene histórico de disponibilidad de un site"""
        query = f"""
            SELECT last("devices_available") as devices_available,
                   last("device_count") as device_count,
                   (last("devices_available") / last("device_count") * 100) as availability_percent
            FROM sites
            WHERE site_name = '{site_name}' 
              AND time > now() - {days}d
            GROUP BY TIME(1h)
        """
        try:
            result = self.client.query(query)
            return result
        except Exception as e:
            logger.error(f"Error obteniendo histórico de disponibilidad: {e}")
            return None
    
    # ========================================================================
    # LIMPIEZA Y MANTENIMIENTO
    # ========================================================================
    def get_database_size(self):
        """Obtiene el tamaño aproximado de la base de datos"""
        try:
            query = f"SELECT COUNT(DISTINCT site_id) FROM sites"
            sites = self.client.query(query)
            
            query = f"SELECT COUNT(DISTINCT device_id) FROM devices"
            devices = self.client.query(query)
            
            return {
                "total_sites": len(sites.raw.get("series", [{}])[0].get("values", [])),
                "total_devices": len(devices.raw.get("series", [{}])[0].get("values", []))
            }
        except Exception as e:
            logger.error(f"Error obteniendo tamaño de BD: {e}")
            return {}
    
    def delete_old_data(self, days: int = 90):
        """Elimina datos más antiguos que X días"""
        try:
            query = f"DELETE FROM sites WHERE time < now() - {days}d"
            self.client.query(query)
            
            query = f"DELETE FROM devices WHERE time < now() - {days}d"
            self.client.query(query)
            
            logger.info(f"Datos más antiguos de {days} días eliminados")
            return True
        except Exception as e:
            logger.error(f"Error eliminando datos antiguos: {e}")
            return False
    
    # ========================================================================
    # INFORMACIÓN Y DIAGNÓSTICO
    # ========================================================================
    def get_measurements(self):
        """Lista todas las mediciones en la BD"""
        try:
            result = self.client.get_list_measurements()
            logger.info(f"Mediciones: {[m['name'] for m in result]}")
            return result
        except Exception as e:
            logger.error(f"Error listando mediciones: {e}")
            return []
    
    def get_tag_keys(self, measurement: str):
        """Lista las tag keys de una medición"""
        try:
            query = f"SHOW TAG KEYS FROM {measurement}"
            result = self.client.query(query)
            logger.info(f"Tag keys de {measurement}: {result}")
            return result
        except Exception as e:
            logger.error(f"Error obteniendo tag keys: {e}")
            return None
    
    def get_field_keys(self, measurement: str):
        """Lista las field keys de una medición"""
        try:
            query = f"SHOW FIELD KEYS FROM {measurement}"
            result = self.client.query(query)
            logger.info(f"Field keys de {measurement}: {result}")
            return result
        except Exception as e:
            logger.error(f"Error obteniendo field keys: {e}")
            return None
    
    # ========================================================================
    # ESTADÍSTICAS
    # ========================================================================
    def get_statistics_summary(self):
        """Obtiene resumen de estadísticas globales"""
        stats = {}
        
        # Número de sites únicos
        try:
            result = self.client.query("SELECT COUNT(DISTINCT site_id) FROM sites")
            stats['unique_sites'] = result.raw.get('series', [{}])[0].get('values', [[0]])[0][1] if result else 0
        except:
            pass
        
        # Número de devices únicos
        try:
            result = self.client.query("SELECT COUNT(DISTINCT device_id) FROM devices")
            stats['unique_devices'] = result.raw.get('series', [{}])[0].get('values', [[0]])[0][1] if result else 0
        except:
            pass
        
        # Total de puntos de datos
        try:
            result = self.client.query("SELECT COUNT(device_count) FROM sites")
            stats['total_points_sites'] = result.raw.get('series', [{}])[0].get('values', [[0]])[0][1] if result else 0
        except:
            pass
        
        logger.info(f"Estadísticas: {stats}")
        return stats


# ============================================================================
# SCRIPT DE INICIALIZACIÓN
# ============================================================================
if __name__ == "__main__":
    import sys
    from config import INFLUXDB_CONFIG
    
    logging.basicConfig(level=logging.INFO)
    
    # Crear gestor
    utils = InfluxDBUtils(
        host=INFLUXDB_CONFIG["host"],
        port=INFLUXDB_CONFIG["port"],
        user=INFLUXDB_CONFIG["username"],
        password=INFLUXDB_CONFIG["password"],
        database=INFLUXDB_CONFIG["database"]
    )
    
    # Ejecutar inicialización
    print("Inicializando InfluxDB...")
    utils.setup_default_retention()
    utils.get_measurements()
    
    print("\n✓ InfluxDB inicializado correctamente")
