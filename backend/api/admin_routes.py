"""Rutas del área de administración: métricas, logs de la aplicación y logs de Railway."""
import os
import time
from collections import Counter, defaultdict
from datetime import datetime, timedelta

import pytz
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import database, models
from servicios import railway_api, registro
from servicios.telegram_bot import configurar_webhooks, estado_webhooks

router = APIRouter(prefix="/admin")
ZONA_CO = pytz.timezone("America/Bogota")
INICIO_PROCESO = time.time()


def _tam_dir(ruta):
    total, n = 0, 0
    if ruta and os.path.isdir(ruta):
        for nombre in os.listdir(ruta):
            p = os.path.join(ruta, nombre)
            if os.path.isfile(p):
                total += os.path.getsize(p)
                n += 1
    return total, n


@router.get("/metricas")
def metricas(dias: int = 30, db: Session = Depends(database.get_db)):
    desde = datetime.utcnow() - timedelta(days=dias)

    # ---------------- Barridos
    ejecs = db.query(models.Ejecucion).filter(models.Ejecucion.inicio >= desde).all()
    por_dia = defaultdict(lambda: {"barridos": 0, "fallidos": 0, "nuevas": 0, "errores": 0})
    duraciones = []
    for e in ejecs:
        dia = pytz.utc.localize(e.inicio).astimezone(ZONA_CO).date().isoformat()
        d = por_dia[dia]
        d["barridos"] += 1
        d["nuevas"] += e.nuevas or 0
        d["errores"] += e.consultas_error or 0
        if e.estado == "fallida" or (e.consultas_ok or 0) == 0:
            d["fallidos"] += 1
        if e.fin and e.inicio:
            duraciones.append((e.fin - e.inicio).total_seconds())
    serie = []
    hoy = datetime.now(ZONA_CO).date()
    for i in range(dias - 1, -1, -1):
        dia = (hoy - timedelta(days=i)).isoformat()
        serie.append({"dia": dia, **por_dia.get(dia, {"barridos": 0, "fallidos": 0, "nuevas": 0, "errores": 0})})

    estados = Counter(e.estado for e in ejecs)
    exitosos = sum(1 for e in ejecs if e.estado in ("ok", "con_alertas") and (e.consultas_ok or 0) > 0)
    ultimo = db.query(models.Ejecucion).order_by(models.Ejecucion.inicio.desc()).first()
    ultimo_ok = (db.query(models.Ejecucion).filter(models.Ejecucion.estado.in_(["ok", "con_alertas"]),
                                                  models.Ejecucion.consultas_ok > 0)
                 .order_by(models.Ejecucion.inicio.desc()).first())

    # ---------------- Notificaciones
    notifs = db.query(models.Notificacion).all()
    por_mes = Counter((n.fecha_aviso or "")[:7] for n in notifs if n.fecha_aviso)
    meses = []
    ref = hoy.replace(day=1)
    for _ in range(12):
        meses.append(ref.strftime("%Y-%m"))
        ref = (ref - timedelta(days=1)).replace(day=1)
    meses.reverse()

    # ---------------- Almacenamiento
    db_path = os.getenv("DB_PATH") or database.SEED_DB_PATH
    tam_db = os.path.getsize(db_path) if os.path.exists(db_path) else 0
    from servicios.analizador import _directorio_archivo
    tam_pdfs, n_pdfs = _tam_dir(_directorio_archivo())

    clientes = db.query(models.Cliente).all()
    return {
        "periodo_dias": dias,
        "proceso": {"en_linea_desde": datetime.utcfromtimestamp(INICIO_PROCESO).isoformat() + "Z",
                    "segundos_en_linea": int(time.time() - INICIO_PROCESO)},
        "barridos": {
            "total": len(ejecs), "exitosos": exitosos, "por_estado": dict(estados),
            "tasa_exito": round(exitosos / len(ejecs), 3) if ejecs else None,
            "duracion_media_seg": round(sum(duraciones) / len(duraciones)) if duraciones else None,
            "consultas_error": sum(e.consultas_error or 0 for e in ejecs),
            "nuevas": sum(e.nuevas or 0 for e in ejecs),
            "ultimo": ultimo.inicio.isoformat() + "Z" if ultimo else None,
            "ultimo_estado": ultimo.estado if ultimo else None,
            "ultimo_exitoso": ultimo_ok.inicio.isoformat() + "Z" if ultimo_ok else None,
            "serie": serie,
        },
        "notificaciones": {
            "total": len(notifs),
            "por_mes": [{"mes": m, "cantidad": por_mes.get(m, 0)} for m in meses],
            "por_urgencia": dict(Counter(n.urgencia or "sin_analizar" for n in notifs)),
            "por_estado": dict(Counter(n.estado or "nueva" for n in notifs)),
            "por_fuente": dict(Counter(n.fuente or "avisos" for n in notifs)),
            "pendientes_envio": sum(1 for n in notifs if not n.notificacion_enviada),
            "sin_procesar": sum(1 for n in notifs if not n.procesada),
            "con_resumen_ia": sum(1 for n in notifs if n.resumen),
            "con_copia_pdf": sum(1 for n in notifs if n.archivo_local),
        },
        "clientes": {"total": len(clientes), "activos": sum(1 for c in clientes if c.activo),
                     "con_correo": sum(1 for c in clientes if c.email), "con_nit": sum(1 for c in clientes if c.nit)},
        "almacenamiento": {"base_datos_bytes": tam_db, "pdfs_bytes": tam_pdfs, "pdfs_archivos": n_pdfs,
                           "logs_bytes": registro.tamano_archivos()},
    }


@router.get("/logs")
def logs_aplicacion(despues_de: int = 0, nivel: str = "todos", q: str = None, limite: int = 500):
    return registro.consultar(despues_de=despues_de, nivel=nivel, texto=q, limite=min(limite, 2000))


@router.get("/telegram/estado")
def estado_telegram():
    return estado_webhooks()


@router.post("/telegram/reconfigurar")
def reconfigurar_telegram():
    return configurar_webhooks()


@router.get("/railway/estado")
def estado_railway():
    return railway_api.configuracion()


@router.get("/railway/deployments")
def deployments_railway(cantidad: int = 10):
    try:
        return railway_api.listar_deployments(cantidad)
    except railway_api.ErrorRailway as e:
        raise HTTPException(status_code=502, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"No se pudo consultar Railway: {e}")


@router.get("/railway/logs")
def logs_railway(deployment_id: str = None, tipo: str = "deploy", limite: int = 500, filtro: str = None):
    if tipo not in ("deploy", "build"):
        raise HTTPException(status_code=400, detail="tipo debe ser 'deploy' o 'build'.")
    try:
        return railway_api.obtener_logs(deployment_id, tipo, limite, filtro)
    except railway_api.ErrorRailway as e:
        raise HTTPException(status_code=502, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"No se pudo consultar Railway: {e}")
