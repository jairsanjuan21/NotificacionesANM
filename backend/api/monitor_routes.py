"""
Rutas para el monitor del VPS (repositorio MetricasVPS).

El monitor corre en el mismo servidor y llega por la red interna de Docker
(http://notificaciones-anm:8000). No usa la sesión del panel: se identifica con
`Authorization: Bearer <MONITOR_TOKEN>`. Sin MONITOR_TOKEN definido, estas rutas no existen (404).
Desde internet Caddy las bloquea (deploy/proxy/sitios/anm.caddy).
"""
import hmac
import os
from datetime import datetime, timedelta

import pytz
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from database import database, models
from scraper.anm_scraper import BarridoEnCurso, barrido_en_curso, iniciar_barrido_en_segundo_plano
from servicios import contexto_app, plazos

router = APIRouter(prefix="/monitor")
ZONA_CO = pytz.timezone("America/Bogota")


def verificar_token(request: Request):
    esperado = os.getenv("MONITOR_TOKEN", "")
    if not esperado:
        raise HTTPException(status_code=404)
    recibido = request.headers.get("authorization", "").removeprefix("Bearer ").strip()
    if not hmac.compare_digest(recibido.encode(), esperado.encode()):
        raise HTTPException(status_code=401, detail="Token inválido.")


def _iso(dt):
    return dt.isoformat() + "Z" if dt else None


@router.get("/resumen", dependencies=[Depends(verificar_token)])
def resumen(db: Session = Depends(database.get_db)):
    ahora_utc = datetime.utcnow()
    hoy = plazos.hoy_co()
    inicio_hoy_utc = ZONA_CO.localize(datetime.combine(hoy, datetime.min.time())).astimezone(pytz.utc).replace(tzinfo=None)

    # Barridos: el último y la duración normal (mediana de los últimos 20 terminados)
    ultimos = (db.query(models.Ejecucion).filter(models.Ejecucion.fin != None)
               .order_by(models.Ejecucion.inicio.desc()).limit(20).all())
    duraciones = sorted((e.fin - e.inicio).total_seconds() for e in ultimos if e.inicio and e.fin)
    mediana = duraciones[len(duraciones) // 2] if duraciones else None
    ultimo = ultimos[0] if ultimos else None
    en_curso = barrido_en_curso()

    proximo = None
    sch = contexto_app.scheduler
    if sch:
        tiempos = [j.next_run_time for j in sch.get_jobs() if j.id.startswith("barrido") and j.next_run_time]
        if tiempos:
            proximo = min(tiempos).astimezone(pytz.utc).isoformat().replace("+00:00", "Z")

    nuevas_hoy = (db.query(models.Notificacion)
                  .filter(models.Notificacion.fecha_registro >= inicio_hoy_utc).count())
    dias_con_nuevas = 14
    nuevas_14d = (db.query(models.Notificacion)
                  .filter(models.Notificacion.fecha_registro >= inicio_hoy_utc - timedelta(days=dias_con_nuevas)).count())

    # Vencimientos de las próximas 2 semanas (y los vencidos de los últimos 3 días) sin responder
    pendientes = (db.query(models.Notificacion)
                  .filter(models.Notificacion.fecha_limite != None,
                          models.Notificacion.fecha_limite >= hoy - timedelta(days=3),
                          models.Notificacion.fecha_limite <= hoy + timedelta(days=21),
                          models.Notificacion.estado != "respondida")
                  .order_by(models.Notificacion.fecha_limite.asc()).limit(60).all())

    return {
        "ahora": _iso(ahora_utc),
        "barrido": {
            "en_curso": en_curso is not None,
            "ultimo_inicio": _iso(ultimo.inicio) if ultimo else None,
            "ultimo_estado": ultimo.estado if ultimo else None,
            "ultimo_duracion_seg": round((ultimo.fin - ultimo.inicio).total_seconds()) if ultimo and ultimo.inicio else None,
            "ultimo_nuevas": ultimo.nuevas if ultimo else None,
            "ultimo_errores": ultimo.consultas_error if ultimo else None,
            "duracion_normal_seg": round(mediana) if mediana else None,
            "proximo": proximo,
            "recientes": [{"inicio": _iso(e.inicio), "duracion_seg": round((e.fin - e.inicio).total_seconds()),
                           "estado": e.estado, "nuevas": e.nuevas or 0} for e in reversed(ultimos[:10]) if e.inicio],
        },
        "notificaciones": {
            "nuevas_hoy": nuevas_hoy,
            "promedio_diario": round(nuevas_14d / dias_con_nuevas, 1),
            "pendientes_envio": db.query(models.Notificacion).filter(models.Notificacion.notificacion_enviada == False).count(),
        },
        "placas": db.query(models.Cliente).count(),
        "vencimientos": [{
            "id": n.id_notificacion,
            "placa": n.cliente.placa if n.cliente else None,
            "acto": n.tipo_acto or n.tipo_notificacion,
            "urgencia": n.urgencia,
            "fecha_limite": n.fecha_limite.isoformat(),
            "dias_habiles": n.dias_habiles_restantes,
            "estado": n.estado,
        } for n in pendientes],
    }


@router.post("/barrer", dependencies=[Depends(verificar_token)], status_code=202)
def barrer():
    try:
        return {"id_ejecucion": iniciar_barrido_en_segundo_plano(origen="manual")}
    except BarridoEnCurso:
        actual = barrido_en_curso()
        raise HTTPException(status_code=409, detail="Ya hay un barrido en curso.",
                            headers={"X-Ejecucion": str(actual.id_ejecucion if actual else "")})
