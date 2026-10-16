import os
import shutil
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

# Base semilla que viene en el repositorio (/app/backend/anm_notificaciones.db)
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SEED_DB_PATH = os.path.join(BASE_DIR, "anm_notificaciones.db")

# Opción 1: DATABASE_URL (ej. Postgres de Railway)
# Opción 2: DB_PATH apuntando a un Volume persistente (ej. /data/anm_notificaciones.db)
# Opción 3 (por defecto): el archivo del repo, que se REINICIA en cada deploy.
DATABASE_URL = os.getenv("DATABASE_URL")

if DATABASE_URL:
    if DATABASE_URL.startswith("postgres://"):
        DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)
    SQLALCHEMY_DATABASE_URL = DATABASE_URL
    connect_args = {}
    print("[DB INFO] Conectando a base de datos externa (DATABASE_URL).")
else:
    DB_PATH = os.getenv("DB_PATH", SEED_DB_PATH)
    if DB_PATH != SEED_DB_PATH and not os.path.exists(DB_PATH):
        # Primer arranque con Volume vacío: copiar la base semilla del repo
        os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
        if os.path.exists(SEED_DB_PATH):
            shutil.copy2(SEED_DB_PATH, DB_PATH)
            print(f"[DB INFO] Volume vacío: se copió la base semilla a {DB_PATH}")
    if DB_PATH == SEED_DB_PATH:
        print("[DB AVISO] Usando la base del repositorio: los cambios se perderán en el próximo deploy. Configure DB_PATH con un Volume.")
    print(f"[DB INFO] Conectando a SQLite en: {DB_PATH} (Existe: {os.path.exists(DB_PATH)})")
    SQLALCHEMY_DATABASE_URL = f"sqlite:///{DB_PATH}"
    connect_args = {"check_same_thread": False}

engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
