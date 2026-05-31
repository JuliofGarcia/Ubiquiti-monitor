FROM python:3.10-slim

WORKDIR /app

# Instalar dependencias del sistema
RUN apt-get update && apt-get install -y \
    curl \
    git \
    && rm -rf /var/lib/apt/lists/*

# Copiar requirements
COPY requirements.txt .

# Instalar dependencias de Python
RUN pip install --no-cache-dir -r requirements.txt

# Copiar código de la aplicación
COPY ubiquiti_backend.py .
COPY config.py .
COPY influx_utils.py .
COPY base_instalaciones.xlsx .
COPY juntas_operacion.xlsx .

# Crear directorio de logs
RUN mkdir -p /app/logs

# Health check (verifica que el proceso siga corriendo)
HEALTHCHECK --interval=60s --timeout=10s --start-period=60s --retries=3 \
    CMD python -c "import os, requests; requests.get(os.getenv('UBIQUITI_API_URL', 'https://juntasub.inred.com.co/nms/api/v2.1') + '/sites', timeout=10)" || exit 1

# Ejecutar la aplicación
CMD ["python", "-u", "ubiquiti_backend.py"]
