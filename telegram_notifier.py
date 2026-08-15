"""
Notificador Telegram: envia alertas de juntas caidas a un grupo de Telegram.
Se ejecuta como un proceso independiente que consulta la API cada 5 min.

Configurar en .env:
  TELEGRAM_BOT_TOKEN=tu_token
  TELEGRAM_CHAT_ID=tu_chat_id

Para crear un bot y obtener el token:
  1. Habla con @BotFather en Telegram
  2. /newbot -> elige nombre -> obtienes token

Para obtener el chat_id del grupo:
  1. Agrega el bot al grupo
  2. Envia un mensaje al grupo
  3. Visita: https://api.telegram.org/bot<TOKEN>/getUpdates
  4. Busca "chat":{"id": -123456789}
"""

import os
import json
import time
import logging
import requests
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger("telegram")

TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
CHAT_ID = os.getenv("TELEGRAM_CHAT_ID", "")
API_URL = os.getenv("DASHBOARD_API_URL", "http://dashboard:5000")
CHECK_INTERVAL = int(os.getenv("TELEGRAM_CHECK_INTERVAL", "300"))
ALERTS_FILE = "/app/data/telegram_sent_alerts.json"


def load_sent_alerts():
    """Carga las alertas ya enviadas para no duplicar"""
    if os.path.exists(ALERTS_FILE):
        try:
            with open(ALERTS_FILE) as f:
                data = json.load(f)
                # Migrar formato antiguo (solo timestamp) al nuevo (dict con name/time)
                for k, v in list(data.items()):
                    if not isinstance(v, dict):
                        data[k] = {"name": k, "time": v}
                return data
        except Exception:
            pass
    return {}


def save_sent_alerts(sent):
    os.makedirs(os.path.dirname(ALERTS_FILE), exist_ok=True)
    with open(ALERTS_FILE, "w") as f:
        json.dump(sent, f)


def send_telegram_message(text):
    """Envia un mensaje al grupo de Telegram"""
    if not TOKEN or not CHAT_ID:
        logger.warning("Telegram no configurado. Falta TOKEN o CHAT_ID en .env")
        return False

    url = f"https://api.telegram.org/bot{TOKEN}/sendMessage"
    try:
        r = requests.post(
            url,
            json={
                "chat_id": CHAT_ID,
                "text": text,
                "parse_mode": "HTML",
            },
            timeout=10,
        )
        if r.status_code == 200:
            logger.info("Mensaje enviado a Telegram")
            return True
        else:
            logger.error(f"Error Telegram: {r.status_code} {r.text}")
            return False
    except Exception as e:
        logger.error(f"Error enviando a Telegram: {e}")
        return False


def format_alert_message(alerts):
    """Formatea las alertas para Telegram"""
    total = len(alerts)
    if total == 1:
        a = alerts[0]
        name = a.get("site_name", "?")
        dept = a.get("department", "?")
        aps = f"{a.get('ap_online', 0)}/{a.get('ap_total', 0)}"
        hours = a.get("hours_down")
        return f"<b>🚨 JUNTA SIN CONECTIVIDAD</b>\n\n<b>{name}</b>\n📍 Depto: {dept}\n📡 Access Point: {aps}"
    
    lines = [f"<b>🚨 {total} JUNTAS SIN CONECTIVIDAD</b>\n"]
    for a in alerts[:10]:
        name = a.get("site_name", "?")
        dept = a.get("department", "?")
        aps = f"{a.get('ap_online', 0)}/{a.get('ap_total', 0)}"
        hours = a.get("hours_down")
        down_str = f" · {hours}h caída" if isinstance(hours, (int, float)) else ""
        lines.append(f"• <b>{name}</b> ({dept}) APs: {aps}{down_str}")

    if total > 10:
        lines.append(f"\n... y {total - 10} más")

    return "\n".join(lines)


def check_and_notify():
    """Consulta la API de alertas y envia notificaciones nuevas"""
    if not TOKEN or not CHAT_ID:
        logger.warning("Telegram no configurado")
        return

    # Autenticación para acceder a la API
    headers = {}
    
    # Intenta obtener un token de login si es necesario, 
    # o usa una credencial hardcodeada si existe en el entorno
    # Como no tenemos el login automatizado aquí, asumo que necesitamos 
    # usar las mismas credenciales que usa el dashboard internamente
    
    # Alternativa: pasar usuario/pass en el login y obtener token
    try:
        # Esto asume que el backend tiene una ruta de login
        login_res = requests.post(f"{API_URL}/api/login", json={
            "username": os.getenv("DASHBOARD_USER"),
            "password": os.getenv("DASHBOARD_PASSWORD")
        }, timeout=10)
        
        if login_res.status_code == 200:
            token = login_res.json().get("token")
            headers = {"Authorization": f"Bearer {token}"}
        else:
            logger.error(f"Error autenticando notificador: {login_res.status_code}")
            return
            
    except Exception as e:
        logger.error(f"Error en login de notificador: {e}")
        return

    try:
        r = requests.get(f"{API_URL}/api/alerts", headers=headers, timeout=30)
        if r.status_code != 200:
            logger.error(f"Error consultando alertas: {r.status_code} {r.text}")
            return
        alerts = r.json()
    except Exception as e:
        logger.error(f"Error consultando API: {e}")
        return

    if not alerts:
        return

    sent = load_sent_alerts()
    new_alerts = []
    recovered = []

    current_ids = set()
    for a in alerts:
        sid = a.get("site_id", "")
        name = a.get("site_name", sid)
        current_ids.add(sid)
        if sid not in sent:
            new_alerts.append(a)
            sent[sid] = {"name": name, "time": time.time()}

    # Detectar sitios recuperados (estaban caidos, ya no)
    recovered = []
    for sid in list(sent.keys()):
        if sid not in current_ids:
            entry = sent[sid]
            recovered.append({"site_id": sid, "name": entry.get("name", sid), "down_since": entry.get("time", 0)})
            del sent[sid]

    if new_alerts:
        msg = format_alert_message(new_alerts)
        send_telegram_message(msg)

    if recovered:
        lines = ["<b>✅ JUNTAS RECUPERADAS:</b>\n"]
        for r in recovered:
            name = r["name"]
            down_duration = ""
            if r["down_since"]:
                hours = round((time.time() - r["down_since"]) / 3600, 1)
                down_duration = f" (caída {hours}h)"
            lines.append(f"• <b>{name}</b> vuelve a estar en línea{down_duration}")
        send_telegram_message("\n".join(lines))

    save_sent_alerts(sent)


def main():
    if not TOKEN:
        logger.error("TELEGRAM_BOT_TOKEN no configurado en .env")
        logger.info("Agrega al .env: TELEGRAM_BOT_TOKEN=tu_token")
        logger.info("Agrega al .env: TELEGRAM_CHAT_ID=tu_chat_id")
        return

    logger.info(f"Iniciando notificador Telegram (intervalo: {CHECK_INTERVAL}s)")
    logger.info(f"Chat ID: {CHAT_ID}")

    while True:
        try:
            check_and_notify()
        except Exception as e:
            logger.error(f"Error en ciclo: {e}")
        time.sleep(CHECK_INTERVAL)


if __name__ == "__main__":
    main()
