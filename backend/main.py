import os
import base64
import secrets
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from contextlib import asynccontextmanager
from datetime import datetime
import pytz
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from database import models, database
from api import routes
from scraper.anm_scraper import ejecutar_scraper

# Crear tablas en la base de datos si no existen
models.Base.metadata.create_all(bind=database.engine)

# Definir zona horaria de Colombia
ZONA_HORARIA_CO = pytz.timezone("America/Bogota")

# Instanciar el programador en segundo plano
scheduler = BackgroundScheduler(timezone=ZONA_HORARIA_CO)


def tarea_programada_scraper():
    ahora = datetime.now(ZONA_HORARIA_CO).strftime("%Y-%m-%d %H:%M:%S")
    print(f"\n[CRON {ahora}] Iniciando barrido automático programado en la ANM...")
    try:
        nuevas = ejecutar_scraper()
        print(f"[CRON] Ejecución automática finalizada. Nuevas notificaciones: {nuevas}")
    except Exception as e:
        print(f"[CRON ERROR] Fallo durante la ejecución programada: {str(e)}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # --- AL INICIAR EL SERVIDOR ---
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

# Autenticación básica: se activa definiendo ADMIN_USER y ADMIN_PASSWORD.
# El navegador muestra su ventana de usuario/contraseña y reutiliza las credenciales.
ADMIN_USER = os.getenv("ADMIN_USER")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD")


@app.middleware("http")
async def autenticacion_basica(request: Request, call_next):
    if not (ADMIN_USER and ADMIN_PASSWORD) or request.method == "OPTIONS":
        return await call_next(request)
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Basic "):
        try:
            usuario, _, clave = base64.b64decode(auth[6:]).decode("utf-8").partition(":")
            if secrets.compare_digest(usuario, ADMIN_USER) and secrets.compare_digest(clave, ADMIN_PASSWORD):
                return await call_next(request)
        except Exception:
            pass
    return Response(
        "Acceso restringido", status_code=401,
        headers={"WWW-Authenticate": 'Basic realm="Monitoreo ANM", charset="UTF-8"'}
    )

# Registrar las rutas de la API
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
