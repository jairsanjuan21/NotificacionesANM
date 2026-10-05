from fastapi import FastAPI
from database import models
from database.database import engine

# Esta línea es la que crea las tablas en la BD si no existen
models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="API Notificaciones ANM")

@app.get("/")
def read_root():
    return {"estado": "En línea", "mensaje": "API de scraping y BD inicializadas"}