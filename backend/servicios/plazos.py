"""
Cálculo de plazos en días hábiles con festivos de Colombia.

IMPORTANTE: son fechas ESTIMADAS de referencia. Las reglas por defecto siguen
el CPACA (art. 69 aviso publicado en página web: se publica 5 días y la
notificación se entiende surtida al finalizar el día siguiente al retiro;
art. 76: recurso de reposición dentro de los 10 días siguientes). Deben
validarse con el ingeniero/abogado y pueden ajustarse con variables de entorno.
"""
import os
import re
from datetime import date, datetime, timedelta

import holidays
import pytz

ZONA_CO = pytz.timezone("America/Bogota")

DIAS_FIJACION_AVISO = int(os.getenv("DIAS_FIJACION_AVISO", "5"))
DIAS_RECURSO = int(os.getenv("DIAS_RECURSO", "10"))
DIAS_COACTIVO = int(os.getenv("DIAS_COACTIVO", "15"))

_festivos_cache = {}


def _festivos(anio: int):
    if anio not in _festivos_cache:
        _festivos_cache[anio] = holidays.Colombia(years=anio)
    return _festivos_cache[anio]


def es_habil(d: date) -> bool:
    return d.weekday() < 5 and d not in _festivos(d.year)


def sumar_dias_habiles(desde: date, dias: int) -> date:
    """Devuelve el día hábil número `dias` contado a partir del día siguiente a `desde`."""
    d = desde
    contados = 0
    while contados < dias:
        d += timedelta(days=1)
        if es_habil(d):
            contados += 1
    return d


def dias_habiles_entre(desde: date, hasta: date) -> int:
    """Días hábiles que faltan desde `desde` (excluido) hasta `hasta` (incluido). Negativo si ya pasó."""
    if hasta == desde:
        return 0
    signo = 1 if hasta > desde else -1
    a, b = (desde, hasta) if signo == 1 else (hasta, desde)
    n = 0
    d = a
    while d < b:
        d += timedelta(days=1)
        if es_habil(d):
            n += 1
    return n * signo


def hoy_co() -> date:
    return datetime.now(ZONA_CO).date()


def parsear_fecha(texto: str):
    """Acepta YYYY-MM-DD o DD/MM/YYYY (también con guiones). Devuelve date o None."""
    if not texto:
        return None
    t = texto.strip()
    m = re.match(r"^(\d{4})[/-](\d{1,2})[/-](\d{1,2})", t)
    if m:
        a, mes, d = map(int, m.groups())
        return date(a, mes, d)
    m = re.match(r"^(\d{1,2})[/-](\d{1,2})[/-](\d{4})", t)
    if m:
        d, mes, a = map(int, m.groups())
        return date(a, mes, d)
    return None


def normalizar_fecha_iso(texto: str) -> str:
    f = parsear_fecha(texto)
    return f.isoformat() if f else (texto or "").strip()


def calcular_plazos(fecha_publicacion: str, tipo_notificacion: str = None, fuente: str = "avisos",
                    termino_dias: int = None):
    """
    Devuelve (fecha_surtida, fecha_limite, base_plazo).
    fecha_limite puede ser None cuando el tipo de notificación es informativo.
    """
    pub = parsear_fecha(fecha_publicacion)
    if not pub:
        return None, None, "Sin fecha de publicación válida"

    tipo = (tipo_notificacion or "").lower()

    if "liberaci" in tipo:
        return pub, None, "Liberación de área: informativo, sin plazo"

    if fuente == "coactivo":
        surtida = sumar_dias_habiles(pub, 1)
        limite = sumar_dias_habiles(surtida, DIAS_COACTIVO)
        return surtida, limite, f"Cobro coactivo: {DIAS_COACTIVO} días hábiles para pagar o proponer excepciones (estimado)"

    if "estado" in tipo:
        # Notificación por estado: se entiende surtida el mismo día de la publicación
        surtida = pub
        base = "Notificación por estado (surtida el día de publicación)"
    else:
        # Aviso publicado en la página web: fijado N días hábiles (contando el día de publicación);
        # se entiende notificado al finalizar el día hábil siguiente al retiro.
        retiro = pub if DIAS_FIJACION_AVISO <= 1 else sumar_dias_habiles(pub, DIAS_FIJACION_AVISO - 1)
        surtida = sumar_dias_habiles(retiro, 1)
        base = f"Aviso fijado {DIAS_FIJACION_AVISO} días hábiles; notificado el día hábil siguiente al retiro"

    if termino_dias:
        limite = sumar_dias_habiles(surtida, termino_dias)
        base += f"; término del acto: {termino_dias} días (contados como hábiles)"
    else:
        limite = sumar_dias_habiles(surtida, DIAS_RECURSO)
        base += f"; recurso de reposición: {DIAS_RECURSO} días hábiles"

    return surtida, limite, base + " — fecha estimada, verificar"
