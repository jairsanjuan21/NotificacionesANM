import os
import sys

# Agregar la raíz de 'backend' al path para poder importar database, servicios, etc.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from database.database import SessionLocal
from database.models import Cliente

db = SessionLocal()

# 1. Corregir 13922 (dejándole solo bogota o bucaramanga, según corresponda)
c_13922 = db.query(Cliente).filter(Cliente.placa == "13922").first()
if c_13922:
    c_13922.regional = "bogota"  # O la regional que le corresponda
    print(f"[+] Placa 13922 corregida: regional = '{c_13922.regional}'")

# 2. Asegurar asignación limpia para las placas de Bogotá
placas_bogota = ["503378", "503488", "505753"]
for p in placas_bogota:
    cli = db.query(Cliente).filter(Cliente.placa == p).first()
    if cli:
        cli.regional = "bogota"
        print(f"[+] Placa {p} asegurada en: bogota")

db.commit()
db.close()