"""
Captura de logs de la aplicación para verlos desde el área de administración.

Todo lo que se imprime (print) y lo que se registra con `logging` se guarda en
memoria (últimas líneas) y en un archivo dentro del Volume, así los logs
sobreviven a reinicios y redeploys.
"""
import collections
import json
import logging
import os
import re
import sys
import threading
from datetime import datetime, timezone

MAX_EN_MEMORIA = 5000
MAX_BYTES_ARCHIVO = 3 * 1024 * 1024  # al superar 3 MB se rota a app.log.1

_registros = collections.deque(maxlen=MAX_EN_MEMORIA)
_lock = threading.RLock()
_siguiente_id = [1]
_archivo = [None]
_instalado = [False]

# Peticiones que no vale la pena registrar (el propio visor de logs consultando cada pocos segundos)
_RUIDO = re.compile(r'"(GET|HEAD) /(api/admin/logs|assets/|favicon)')


def _directorio_logs() -> str:
    d = os.getenv("LOG_DIR")
    if not d:
        db = os.getenv("DB_PATH")
        d = os.path.dirname(db) if db else os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    os.makedirs(d, exist_ok=True)
    return d


# Palabras completas (\b): "AVISO" no debe coincidir con "Avisos" (la fuente de la ANM que se
# consulta en cada barrido), ni "ERROR" con "Resumen de errores" o "consultas_con_error".
_PATRON_ERROR = re.compile(r"\b(ERROR|CRITICAL|TRACEBACK|EXCEPTION|FALLO|FALLÓ|FALLIDA|FALLIDO)\b")
_PATRON_AVISO = re.compile(r"\[!\]|⚠|\b(WARN|WARNING|AVISO|ALERTA)\b")


def _nivel_de(texto: str) -> str:
    t = texto.upper()
    if _PATRON_ERROR.search(t):
        return "error"
    if _PATRON_AVISO.search(t):
        return "aviso"
    return "info"


def agregar(texto: str, nivel: str = None, origen: str = "app"):
    texto = texto.rstrip()
    if not texto.strip() or _RUIDO.search(texto):
        return
    with _lock:
        reg = {"id": _siguiente_id[0], "ts": datetime.now(timezone.utc).isoformat(timespec="seconds"),
               "nivel": nivel or _nivel_de(texto), "origen": origen, "texto": texto[:4000]}
        _siguiente_id[0] += 1
        _registros.append(reg)
        _escribir_archivo(reg)


def _escribir_archivo(reg: dict):
    try:
        ruta = _archivo[0]
        if not ruta:
            return
        if os.path.exists(ruta) and os.path.getsize(ruta) > MAX_BYTES_ARCHIVO:
            os.replace(ruta, ruta + ".1")
        with open(ruta, "a", encoding="utf-8") as f:
            f.write(json.dumps({k: reg[k] for k in ("ts", "nivel", "origen", "texto")}, ensure_ascii=False) + "\n")
    except Exception:
        pass  # el registro nunca debe tumbar la aplicación


class _Duplicador:
    """Reemplaza sys.stdout/sys.stderr: escribe en la consola original (logs de Railway) y en el registro."""

    def __init__(self, original):
        self.original = original
        self.pendiente = ""

    def write(self, s):
        try:
            self.original.write(s)
        except Exception:
            pass
        self.pendiente += s
        while "\n" in self.pendiente:
            linea, self.pendiente = self.pendiente.split("\n", 1)
            agregar(linea)
        return len(s)

    def flush(self):
        try:
            self.original.flush()
        except Exception:
            pass

    def __getattr__(self, nombre):
        return getattr(self.original, nombre)


class _ManejadorLogging(logging.Handler):
    MAPA = {logging.DEBUG: "info", logging.INFO: "info", logging.WARNING: "aviso",
            logging.ERROR: "error", logging.CRITICAL: "error"}

    def emit(self, record):
        try:
            origen = "servidor" if record.name.startswith("uvicorn") else record.name.split(".")[0]
            agregar(self.format(record), self.MAPA.get(record.levelno, "info"), origen)
        except Exception:
            pass


def instalar():
    """Activa la captura. Llamar lo antes posible al iniciar la aplicación."""
    if _instalado[0]:
        return
    _instalado[0] = True
    ruta = os.path.join(_directorio_logs(), "app.log")
    _archivo[0] = ruta

    # Recuperar las últimas líneas de ejecuciones anteriores
    try:
        lineas = []
        for r in (ruta + ".1", ruta):
            if os.path.exists(r):
                with open(r, encoding="utf-8") as f:
                    lineas.extend(f.readlines()[-MAX_EN_MEMORIA:])
        for linea in lineas[-MAX_EN_MEMORIA:]:
            try:
                d = json.loads(linea)
                _registros.append({"id": _siguiente_id[0], **d})
                _siguiente_id[0] += 1
            except Exception:
                continue
    except Exception:
        pass

    sys.stdout = _Duplicador(sys.stdout)
    sys.stderr = _Duplicador(sys.stderr)

    manejador = _ManejadorLogging()
    manejador.setFormatter(logging.Formatter("%(message)s"))
    # "uvicorn.error" propaga a "uvicorn": basta con el padre para no duplicar líneas
    for nombre in ("uvicorn", "uvicorn.access", "apscheduler"):
        logging.getLogger(nombre).addHandler(manejador)
    agregar("[REGISTRO] Captura de logs activada", "info", "app")


def consultar(despues_de: int = 0, nivel: str = None, texto: str = None, limite: int = 500):
    with _lock:
        datos = list(_registros)
    if despues_de:
        datos = [r for r in datos if r["id"] > despues_de]
    if nivel and nivel != "todos":
        niveles = {"error": {"error"}, "aviso": {"error", "aviso"}}.get(nivel, {nivel})
        datos = [r for r in datos if r["nivel"] in niveles]
    if texto:
        t = texto.lower()
        datos = [r for r in datos if t in r["texto"].lower()]
    ultimo = _registros[-1]["id"] if _registros else 0
    return {"registros": datos[-limite:], "ultimo_id": ultimo, "total_en_memoria": len(_registros)}


def tamano_archivos() -> int:
    ruta = _archivo[0]
    if not ruta:
        return 0
    return sum(os.path.getsize(r) for r in (ruta, ruta + ".1") if os.path.exists(r))
