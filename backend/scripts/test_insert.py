import os
import sys

# Agregar la raíz de 'backend' al path para poder importar database, servicios, etc.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database.database import SessionLocal
from database.models import Cliente

db = SessionLocal()
cliente_prueba = Cliente(placa="HAN-111", nombre_empresa="Prueba Tío", activo=True)
db.add(cliente_prueba)
db.commit()
print("Cliente insertado correctamente.")
db.close()