from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

# URL para SQLite local (creará un archivo anm_notificaciones.db en la raíz del backend)
SQLALCHEMY_DATABASE_URL = "sqlite:///./anm_notificaciones.db"

# engine es el motor de conexión
engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

# Dependencia para inyectar la sesión de base de datos en nuestras rutas
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()