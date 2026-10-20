import os
from dotenv import load_dotenv

load_dotenv()

# La captura de logs se instala antes que todo lo demás, para no perder nada del arranque
from servicios import registro
registro.instalar()

from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from contextlib import asynccontextmanager
from datetime import datetime
import pytz
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from database import models, database
from database.migraciones import migrar
from api import routes, auth_routes, admin_routes
from servicios import auth
from scraper.anm_scraper import ejecutar_scraper, cerrar_barridos_huerfanos
from mailer.dispatcher import enviar_recordatorios, enviar_alerta_sistema

# Crear tablas y agregar columnas nuevas sin perder datos
migrar()

# Definir zona horaria de Colombia
ZONA_HORARIA_CO = pytz.timezone("America/Bogota")

# Instanciar el programador en segundo plano
scheduler = BackgroundScheduler(timezone=ZONA_HORARIA_CO)


def tarea_programada_scraper():
    ahora = datetime.now(ZONA_HORARIA_CO).strftime("%Y-%m-%d %H:%M:%S")
    print(f"\n[CRON {ahora}] Iniciando barrido automático programado en la ANM...")
    try:
        nuevas = ejecutar_scraper(origen="automatico", esperar=True)
        print(f"[CRON] Ejecución automática finalizada. Nuevas notificaciones: {nuevas}")
    except Exception as e:
        print(f"[CRON ERROR] Fallo durante la ejecución programada: {str(e)}")


def tarea_recordatorios():
    db = database.SessionLocal()
    try:
        print(f"[CRON] Recordatorios de vencimiento: {enviar_recordatorios(db)}")
    except Exception as e:
        print(f"[CRON ERROR] Recordatorios: {e}")
    finally:
        db.close()


DIAS_SIN_BARRIDO_OK = int(os.getenv("DIAS_SIN_BARRIDO_OK", "3"))


def tarea_vigilante():
    """Alerta si hace varios días no hay un barrido exitoso (servidor dormido, errores repetidos, etc.)."""
    db = database.SessionLocal()
    try:
        ultimo_ok = (db.query(models.Ejecucion).filter(models.Ejecucion.estado.in_(["ok", "con_alertas"]),
                                                       models.Ejecucion.consultas_ok > 0)
                     .order_by(models.Ejecucion.inicio.desc()).first())
        if ultimo_ok is None:
            hay_alguna = db.query(models.Ejecucion).count() > 0
            if hay_alguna:
                enviar_alerta_sistema("Ningún barrido exitoso registrado",
                                      "Todos los barridos registrados han fallado. Revise los logs de Railway.")
            return
        dias = (datetime.utcnow() - ultimo_ok.inicio).days
        if dias >= DIAS_SIN_BARRIDO_OK:
            enviar_alerta_sistema(f"{dias} días sin un barrido exitoso",
                                  f"El último barrido correcto fue el {ultimo_ok.inicio:%Y-%m-%d %H:%M} UTC.")
    except Exception as e:
        print(f"[CRON ERROR] Vigilante: {e}")
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # --- AL INICIAR EL SERVIDOR ---
    # 0. Un barrido que quedó 'en_curso' fue cortado por un reinicio o deploy
    huerfanos = cerrar_barridos_huerfanos()
    if huerfanos:
        print(f"[BARRIDO] {huerfanos} barrido(s) interrumpido(s) por el reinicio quedaron como fallidos.")

    # 1. Regla Lunes a Viernes: 8:30 AM y 5:30 PM (17:30)
    scheduler.add_job(
        tarea_programada_scraper,
        CronTrigger(day_of_week="mon-fri", hour="8,17", minute=30, timezone=ZONA_HORARIA_CO),
        id="barrido_lun_vie",
        name="Barrido ANM Lunes a Viernes (8:30 AM y 5:30 PM)",
        replace_existing=True,
        max_instances=1,
        coalesce=True
    )

    # 2. Regla Domingos: 6:00 PM (18:00)
    scheduler.add_job(
        tarea_programada_scraper,
        CronTrigger(day_of_week="sun", hour=18, minute=0, timezone=ZONA_HORARIA_CO),
        id="barrido_domingo",
        name="Barrido ANM Domingos (6:00 PM)",
        replace_existing=True,
        max_instances=1,
        coalesce=True
    )

    # 3. Recordatorios de vencimiento: todos los días a las 7:20 AM
    scheduler.add_job(tarea_recordatorios, CronTrigger(hour=7, minute=20, timezone=ZONA_HORARIA_CO),
                      id="recordatorios", name="Recordatorios de vencimiento (7:20 AM)",
                      replace_existing=True, max_instances=1, coalesce=True)

    # 4. Vigilante de salud: todos los días a las 9:10 AM
    scheduler.add_job(tarea_vigilante, CronTrigger(hour=9, minute=10, timezone=ZONA_HORARIA_CO),
                      id="vigilante", name="Vigilante de salud del sistema (9:10 AM)",
                      replace_existing=True, max_instances=1, coalesce=True)

    scheduler.start()
    print("\n=======================================================")
    print(" [SCHEDULER ACTIVO] Zona Horaria: America/Bogota")
    for job in scheduler.get_jobs():
        print(f" -> {job.name} | Próxima ejecución: {job.next_run_time}")
    print("=======================================================\n")

    yield

    # --- AL APAGAR EL SERVIDOR ---
    scheduler.shutdown()
    print("[SCHEDULER] Programador de tareas detenido.")


app = FastAPI(
    title="API de Monitoreo Minero ANM",
    version="2.0.0",
    lifespan=lifespan
)

# Configuración CORS: el frontend en producción se sirve desde el mismo dominio,
# así que solo se permite el servidor de desarrollo de Vite.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Sesiones: se activan definiendo ADMIN_USER/ADMIN_PASSWORD (administrador) y
# PANEL_USER/PANEL_PASSWORD (usuario del panel). Sin usuarios configurados, el acceso es libre.
if not auth.autenticacion_activa():
    print("[AUTH AVISO] No hay usuarios configurados: el panel está abierto sin contraseña.")


@app.middleware("http")
async def control_de_acceso(request: Request, call_next):
    ruta = request.url.path
    protegida = ruta.startswith("/api/") or auth.requiere_admin(ruta)
    if request.method == "OPTIONS" or not protegida or not auth.autenticacion_activa() \
            or ruta in auth.RUTAS_PUBLICAS:
        return await call_next(request)
    sesion = auth.leer_token(request.cookies.get(auth.NOMBRE_COOKIE, ""))
    if not sesion:
        return JSONResponse({"detail": "Su sesión expiró. Inicie sesión de nuevo."}, status_code=401)
    if auth.requiere_admin(ruta) and sesion["rol"] != "admin":
        return JSONResponse({"detail": "Esta sección es solo para el administrador."}, status_code=403)
    request.state.sesion = sesion
    return await call_next(request)

# Registrar las rutas de la API
app.include_router(auth_routes.router, prefix="/api")
app.include_router(admin_routes.router, prefix="/api")
app.include_router(routes.router, prefix="/api")

@app.get("/api/scheduler/estado")
def obtener_estado_scheduler():
    jobs_info = []
    for job in scheduler.get_jobs():
        jobs_info.append({
            "id": job.id,
            "descripcion": job.name,
            "proxima_ejecucion": job.next_run_time.strftime("%Y-%m-%d %H:%M:%S %Z") if job.next_run_time else None
        })
    return {
        "activo": scheduler.running,
        "zona_horaria": "America/Bogota",
        "tareas_programadas": jobs_info
    }
FRONTEND_DIST = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "frontend", "dist")

if os.path.exists(FRONTEND_DIST):
    app.mount("/assets", StaticFiles(directory=os.path.join(FRONTEND_DIST, "assets")), name="assets")

    @app.get("/{full_path:path}")
    async def servir_spa_react(full_path: str):
        archivo_solicitado = os.path.join(FRONTEND_DIST, full_path)
        if full_path and os.path.isfile(archivo_solicitado):
            return FileResponse(archivo_solicitado)
        return FileResponse(os.path.join(FRONTEND_DIST, "index.html"))
