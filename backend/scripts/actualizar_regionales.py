import os
import sys

sys.path.append(os.path.abspath(os.path.dirname(__file__)))
from database.database import SessionLocal, engine
from database.models import Cliente
from sqlalchemy import text

# Asegurar que la columna 'regional' exista en la tabla SQLite
with engine.connect() as con:
    try:
        con.execute(text("ALTER TABLE clientes ADD COLUMN regional VARCHAR DEFAULT 'bucaramanga'"))
        con.commit()
    except Exception:
        # La columna ya existe
        pass

db = SessionLocal()

# 1. Establecer todas las placas actuales por defecto en 'bucaramanga'
db.query(Cliente).update({Cliente.regional: "bucaramanga"})

# 2. Mapeo específico de las placas enviadas
mapeo_regionales = {
    "PLH-08141": "cartagena",
    "JG1-15281": "cartagena",
    "PLH-08041": "bogota,cartagena",  # Consulta ambas sedes
    "503378": "bogota",
    "505753": "bogota",
    "0-181": "cartagena",
    "19465": "cartagena",
    "20010": "cartagena",
    "EB-0002": "cartagena",
    "SGB-12591": "cartagena",
    "0057": "cartagena",
    "503488": "bogota",
    "ICQ-10511": "cucuta",
}

actualizados = 0
for placa, regional in mapeo_regionales.items():
    cliente = db.query(Cliente).filter(Cliente.placa == placa).first()
    if cliente:
        cliente.regional = regional
        actualizados += 1
        print(f"  [+] Placa {placa} asignada a: {regional}")
    else:
        print(f"  [-] Placa {placa} no encontrada en BD.")

db.commit()
db.close()
print(f"\n[OK] Regionales actualizadas: {actualizados} placas reasignadas. El resto quedó en Bucaramanga.")