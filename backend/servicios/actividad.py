"""
Última actividad de cada tipo de acceso:

  web_admin     Panel web con rol administrador
  web_usuario   Panel web con rol usuario (el ingeniero)
  tg_cliente    Bot de Telegram del cliente
  tg_admin      Bot de Telegram del administrador

Se mide actividad y no inicios de sesión: la sesión del panel dura 30 días, así que el
último login puede ser de hace semanas aunque el panel se use a diario.

El panel hace muchas peticiones por minuto. Por eso el valor se actualiza en memoria en
cada acceso, pero se guarda en la base de datos como máximo una vez por minuto y clave
(throttling). Así sobrevive a los reinicios sin escribir en cada petición.
"""
import threading
import time
from datetime import datetime

from database import database, models

INTERVALO_GUARDADO = 60          # segundos

_memoria = {}                    # clave -> (fecha_utc, detalle)
_ultimo_guardado = {}            # clave -> time.time() del último guardado
_lock = threading.Lock()


def registrar(clave: str, detalle: str = None):
    """Nunca lanza excepciones: medir la actividad no puede romper una petición."""
    try:
        ahora = datetime.utcnow()
        with _lock:
            _memoria[clave] = (ahora, detalle)
            if time.time() - _ultimo_guardado.get(clave, 0) < INTERVALO_GUARDADO:
                return
            _ultimo_guardado[clave] = time.time()
        # En un hilo: el middleware del panel es async y no debe esperar a la base de datos
        threading.Thread(target=_guardar_seguro, args=(clave, ahora, detalle), daemon=True).start()
    except Exception as e:
        print(f"[ACTIVIDAD] [!] No se pudo registrar {clave}: {e}")


def _guardar_seguro(clave: str, fecha, detalle):
    try:
        _guardar(clave, fecha, detalle)
    except Exception as e:
        print(f"[ACTIVIDAD] [!] No se pudo guardar {clave}: {e}")


def _guardar(clave: str, fecha, detalle):
    db = database.SessionLocal()
    try:
        fila = db.get(models.Actividad, clave)
        if fila is None:
            db.add(models.Actividad(clave=clave, fecha=fecha, detalle=detalle))
        else:
            fila.fecha, fila.detalle = fecha, detalle
        db.commit()
    finally:
        db.close()


def ultima(clave: str):
    """Devuelve (fecha_utc, detalle) o (None, None). La memoria manda: es igual o más reciente que la BD."""
    with _lock:
        if clave in _memoria:
            return _memoria[clave]
    db = database.SessionLocal()
    try:
        fila = db.get(models.Actividad, clave)
        return (fila.fecha, fila.detalle) if fila else (None, None)
    except Exception:
        return (None, None)
    finally:
        db.close()
