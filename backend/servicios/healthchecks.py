"""
Vigilancia externa con healthchecks.io ("dead man's switch").

La idea: una alerta de "el servidor se cayó" no puede depender del servidor. Aquí el sistema
solo REPORTA que está vivo; es healthchecks.io quien avisa (por su propia integración de
Telegram) cuando los reportes dejan de llegar o llegan como fallidos.

Chequeos (cada variable acepta la URL de ping completa o solo el UUID):
  HC_BARRIDO_SEMANA    Barridos automáticos de lunes a viernes (cron 30 8,17 * * 1-5).
  HC_BARRIDO_DOMINGO   Barrido automático del domingo (cron 0 18 * * 0).
  HC_LATIDO            Latido cada 10 minutos, con un autodiagnóstico de la base de datos.

Solo los barridos AUTOMÁTICOS hacen ping: un barrido manual a deshoras no debe tapar
uno programado que no se ejecutó.
"""
import os
import uuid

import requests

BASE_PING = "https://hc-ping.com/"
CHEQUEOS = {"semana": "HC_BARRIDO_SEMANA", "domingo": "HC_BARRIDO_DOMINGO", "latido": "HC_LATIDO"}
MAX_CUERPO = 10_000      # healthchecks guarda hasta 100 kB por ping; con 10 kB sobra
MIN_ESPACIO_LIBRE = float(os.getenv("HC_MIN_ESPACIO_LIBRE", "0.10"))   # 10 %


def _url(chequeo: str) -> str:
    valor = (os.getenv(CHEQUEOS.get(chequeo, ""), "") or "").strip()
    if not valor:
        return ""
    return valor.rstrip("/") if valor.startswith("http") else BASE_PING + valor


def configurado(chequeo: str) -> bool:
    return bool(_url(chequeo))


def estado() -> dict:
    return {c: configurado(c) for c in CHEQUEOS}


def _ping(chequeo: str, sufijo: str = "", rid: str = None, cuerpo: str = None):
    """Envía un ping. Nunca lanza excepciones: la vigilancia no puede tumbar lo vigilado."""
    url = _url(chequeo)
    if not url:
        return
    destino = url + sufijo
    params = {"rid": rid} if rid else None
    for intento in (1, 2):
        try:
            r = requests.post(destino, params=params, data=(cuerpo or "")[:MAX_CUERPO].encode("utf-8"),
                              timeout=10)
            if r.status_code == 200:
                return
            print(f"[HEALTHCHECKS] [!] Ping '{chequeo}{sufijo}' respondió {r.status_code}")
            return
        except Exception as e:
            if intento == 2:
                print(f"[HEALTHCHECKS] [!] No se pudo hacer ping '{chequeo}{sufijo}': {e}")


# ============================================================================ barridos

def inicio(chequeo: str):
    """Avisa que arrancó un barrido. Devuelve el run ID (UUID) para emparejar el cierre."""
    if not chequeo or not configurado(chequeo):
        return None
    rid = str(uuid.uuid4())
    _ping(chequeo, "/start", rid)
    return rid


def fin(chequeo: str, rid: str, exito: bool, detalle: str = ""):
    if not chequeo or not configurado(chequeo):
        return
    _ping(chequeo, "" if exito else "/fail", rid, detalle)


def resultado_barrido(ejec) -> tuple:
    """
    Traduce el estado de una ejecución a (éxito, detalle) para healthchecks.
    'con_alertas' cuenta como éxito si al menos una consulta salió bien: el sistema funcionó,
    y el detalle de las alertas ya le llega al administrador por su bot.
    """
    exito = ejec.estado in ("ok", "con_alertas") and (ejec.consultas_ok or 0) > 0
    detalle = (f"Barrido #{ejec.id_ejecucion}: {ejec.estado}\n"
               f"Placas: {ejec.placas_consultadas} · consultas bien: {ejec.consultas_ok} · "
               f"con falla: {ejec.consultas_error} · nuevas: {ejec.nuevas}\n\n{ejec.alertas or ''}")
    return exito, detalle


# ============================================================================ latido

def autodiagnostico() -> list:
    """Problemas detectables desde adentro. Lista vacía = todo bien."""
    problemas = []
    try:
        from sqlalchemy import text
        from database.database import engine
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
    except Exception as e:
        problemas.append(f"La base de datos no responde: {e}")
    # El Volume se va llenando con los PDF archivados y los logs
    try:
        import shutil
        ruta = os.path.dirname(os.getenv("DB_PATH") or "") or os.getenv("LOG_DIR") or "."
        uso = shutil.disk_usage(ruta)
        libre = uso.free / uso.total
        if libre < MIN_ESPACIO_LIBRE:
            problemas.append(f"Queda {libre:.0%} de espacio libre en {ruta} "
                             f"({uso.free / 1024 / 1024:.0f} MB de {uso.total / 1024 / 1024:.0f} MB).")
    except Exception as e:
        problemas.append(f"No se pudo medir el espacio en disco: {e}")
    return problemas


def latido():
    """Se llama cada 10 minutos. Si el autodiagnóstico encuentra algo, el latido llega como falla."""
    if not configurado("latido"):
        return
    problemas = autodiagnostico()
    if problemas:
        print("[HEALTHCHECKS] [!] Latido con problemas: " + " | ".join(problemas))
        _ping("latido", "/fail", cuerpo="\n".join(problemas))
    else:
        _ping("latido")
