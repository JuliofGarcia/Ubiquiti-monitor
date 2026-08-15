import os
from dotenv import load_dotenv

load_dotenv()

UBIQUITI_CONFIG = {
    "api_url": os.getenv('UBIQUITI_API_URL', 'https://juntasub.inred.com.co/nms/api/v2.1'),
    "token": os.getenv('UBIQUITI_API_TOKEN', ''),
    "verify_ssl": os.getenv('UBIQUITI_VERIFY_SSL', 'true').lower() == 'true'
}

INFLUXDB_CONFIG = {
    "host": os.getenv('INFLUXDB_HOST', 'influxdb'),
    "port": int(os.getenv('INFLUXDB_PORT', 8086)),
    "username": os.getenv('INFLUXDB_ADMIN_USER', 'admin'),
    "password": os.getenv('INFLUXDB_ADMIN_PASSWORD', 'password'),
    "database": os.getenv('INFLUXDB_DATABASE', 'monitoreo'),
}

MONITORING_CONFIG = {
    "polling_interval": int(os.getenv('POLLING_INTERVAL', 300)),
}

CONFIG = {
    "ubiquiti": UBIQUITI_CONFIG,
    "influxdb": INFLUXDB_CONFIG,
    "monitoring": MONITORING_CONFIG,
}
