from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import models
from database.database import engine
from api.routes import router

# Inicializar tablas
models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="API Notificaciones ANM", version="1.0.0")

# Configuración estricta de CORS para el Frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # En producción limitaremos esto a la URL de tu frontend
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Incluir las rutas que acabamos de crear bajo el prefijo /api
app.include_router(router, prefix="/api")

@app.get("/")
def read_root():
    return {"estado": "En línea", "mensaje": "API de scraping y base de datos inicializadas"}