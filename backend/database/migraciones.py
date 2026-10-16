"""
Migración automática y segura: agrega a las tablas existentes las columnas
nuevas del modelo, sin borrar datos. Se ejecuta al iniciar el servidor.
"""
from sqlalchemy import inspect, text, Boolean

from .database import engine, Base
from . import models  # noqa: F401  (registra los modelos en Base)

# Valores iniciales para filas existentes
VALORES_INICIALES = {
    ("notificaciones", "fuente"): "'avisos'",
    ("notificaciones", "estado"): "'nueva'",
    ("notificaciones", "recordatorios_enviados"): "''",
}


def migrar():
    Base.metadata.create_all(bind=engine)  # crea tablas que no existan (ej. ejecuciones)
    insp = inspect(engine)
    dialecto = engine.dialect

    with engine.begin() as conn:
        for tabla in Base.metadata.sorted_tables:
            if not insp.has_table(tabla.name):
                continue
            existentes = {c["name"] for c in insp.get_columns(tabla.name)}
            for col in tabla.columns:
                if col.name in existentes:
                    continue
                tipo_sql = col.type.compile(dialect=dialecto)
                conn.execute(text(f'ALTER TABLE {tabla.name} ADD COLUMN {col.name} {tipo_sql}'))
                inicial = VALORES_INICIALES.get((tabla.name, col.name))
                if inicial is None and isinstance(col.type, Boolean):
                    inicial = "false" if dialecto.name == "postgresql" else "0"
                if inicial is not None:
                    conn.execute(text(f"UPDATE {tabla.name} SET {col.name} = {inicial} WHERE {col.name} IS NULL"))
                print(f"[MIGRACIÓN] Columna agregada: {tabla.name}.{col.name}")
