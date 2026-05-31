# config.py
"""
Configuración centralizada para el sistema de monitoreo de Ubiquiti
"""

import os
from dotenv import load_dotenv

# Cargar variables de entorno desde .env
load_dotenv()

# ============================================================================
# CONFIGURACIÓN DE API UBIQUITI
# ============================================================================
UBIQUITI_CONFIG = {
    "api_url": os.getenv('UBIQUITI_API_URL', 'https://juntasub.inred.com.co/nms/api/v2.1'),
    "token": os.getenv('UBIQUITI_API_TOKEN', ''),
    "request_timeout": int(os.getenv('UBIQUITI_REQUEST_TIMEOUT', 10)),
    "verify_ssl": os.getenv('UBIQUITI_VERIFY_SSL', 'true').lower() == 'true'
}

# ============================================================================
# CONFIGURACIÓN DE INFLUXDB
# ============================================================================
INFLUXDB_CONFIG = {
    "host": os.getenv('INFLUXDB_HOST', 'influxdb'),
    "port": int(os.getenv('INFLUXDB_PORT', 8086)),
    "username": os.getenv('INFLUXDB_ADMIN_USER', 'admin'),
    "password": os.getenv('INFLUXDB_ADMIN_PASSWORD', 'password'),
    "database": os.getenv('INFLUXDB_DATABASE', 'monitoreo'),
    "timeout": int(os.getenv('INFLUXDB_TIMEOUT', 5)),
    "retries": int(os.getenv('INFLUXDB_RETRIES', 3))
}

# ============================================================================
# CONFIGURACIÓN DE MONITOREO
# ============================================================================
MONITORING_CONFIG = {
    "polling_interval": int(os.getenv('POLLING_INTERVAL', 300)),  # segundos
    "batch_size": int(os.getenv('BATCH_SIZE', 100)),  # cantidad de puntos por batch
    "retention_policy": os.getenv('RETENTION_POLICY', '30d'),  # retención en InfluxDB
    "log_file": os.getenv('LOG_FILE', 'ubiquiti_monitor.log'),
    "log_level": os.getenv('LOG_LEVEL', 'INFO')
}

# ============================================================================
# MAPEO DE ZONAS Y DEPARTAMENTOS
# ============================================================================
# Este mapeo vincula los sites (APs) con zonas geográficas y departamentos
# Puedes mapear por:
#   - site_id: UUID del site
#   - site_name: Nombre del site
#   - ip_address: IP del dispositivo
#   - latitude/longitude: Coordenadas (patrón de rango)

ZONE_MAPPING = {
    # FORMATO: "identificador": {"zone": "Nombre Zona", "department": "Departamento"}
    
    # ZONA NORTE - CUNDINAMARCA
    "site-norte-001": {"zone": "Norte", "department": "Cundinamarca"},
    "site-norte-002": {"zone": "Norte", "department": "Cundinamarca"},
    
    # ZONA SUR - BOGOTÁ
    "site-sur-001": {"zone": "Sur", "department": "Bogotá D.C."},
    "site-sur-002": {"zone": "Sur", "department": "Bogotá D.C."},
    
    # ZONA ORIENTE - BOYACÁ
    "site-oriente-001": {"zone": "Oriente", "department": "Boyacá"},
    "site-oriente-002": {"zone": "Oriente", "department": "Boyacá"},
    
    # ZONA OCCIDENTE - CALDAS
    "site-occidente-001": {"zone": "Occidente", "department": "Caldas"},
    "site-occidente-002": {"zone": "Occidente", "department": "Caldas"},
    
    # Por IP (reemplazar con tus IPs reales)
    # "192.168.100.0": {"zone": "Zona Central", "department": "Cundinamarca"},
    # "192.168.101.0": {"zone": "Zona Sur", "department": "Bogotá D.C."},
}

# ============================================================================
# CONFIGURACIÓN DE ALERTAS
# ============================================================================
ALERT_THRESHOLDS = {
    "site": {
        "min_device_availability": 80,  # % mínimo de dispositivos disponibles
        "min_sla": 95,  # % mínimo de SLA
        "max_devices_outage": 10  # máximo de dispositivos caídos
    },
    "device": {
        "min_signal_strength": -75,  # dBm mínimo
        "max_temperature": 65,  # °C máximo
        "max_cpu_usage": 80,  # % máximo
        "max_ram_usage": 85,  # % máximo
        "min_uptime": 3600  # segundos mínimos (1 hora)
    }
}

# ============================================================================
# CONFIGURACIÓN DE MÉTRICAS Y CAMPOS PERSONALIZADOS
# ============================================================================
CUSTOM_FIELDS = {
    "sites": {
        # Campos que se extraerán además de los estándar
        "extra_tags": ["regulatory_domain", "contact_email"],
        "extra_fields": ["elevation", "sla", "latitude", "longitude"]
    },
    "devices": {
        "extra_tags": ["device_model", "ip_address", "mac_address"],
        "extra_fields": ["temperature", "cpu_usage", "ram_usage", "uptime"]
    }
}

# ============================================================================
# CONFIGURACIÓN DE GRAFANA (LEGACY - reemplazado por dashboard React)
# ============================================================================
GRAFANA_CONFIG = {
    "datasource": "InfluxDB-Ubiquiti",
    "default_dashboard_refresh": "30s",
    "dashboard_tags": ["ubiquiti", "network", "monitoring"],
    "panels": {
        "site_status": {
            "type": "stat",
            "title": "Estado de Sites",
            "description": "Número de sites activos vs inactivos"
        },
        "device_availability": {
            "type": "gauge",
            "title": "Disponibilidad de Dispositivos",
            "description": "% de dispositivos conectados vs caídos"
        },
        "traffic_throughput": {
            "type": "timeseries",
            "title": "Tráfico en Tiempo Real",
            "description": "Descarga y carga por site"
        },
        "zone_summary": {
            "type": "table",
            "title": "Resumen por Zona",
            "description": "Estadísticas agregadas por zona/departamento"
        }
    }
}

# ============================================================================
# CONFIGURACIÓN DE NOTIFICACIONES
# ============================================================================
NOTIFICATION_CONFIG = {
    "enabled": True,
    "methods": ["log"],  # ["log", "email", "webhook", "slack"]
    "email": {
        "smtp_server": "smtp.gmail.com",
        "smtp_port": 587,
        "sender": "monitoring@example.com",
        "recipients": ["admin@example.com"]
    },
    "webhook": {
        "url": "https://example.com/webhook",
        "timeout": 5
    },
    "slack": {
        "webhook_url": "https://hooks.slack.com/services/YOUR/WEBHOOK/URL"
    }
}

# ============================================================================
# EXPORTAR TODAS LAS CONFIGURACIONES
# ============================================================================
CONFIG = {
    "ubiquiti": UBIQUITI_CONFIG,
    "influxdb": INFLUXDB_CONFIG,
    "monitoring": MONITORING_CONFIG,
    "zones": ZONE_MAPPING,
    "alerts": ALERT_THRESHOLDS,
    "custom_fields": CUSTOM_FIELDS,
    "grafana": GRAFANA_CONFIG,  # LEGACY
    "notifications": NOTIFICATION_CONFIG
}
