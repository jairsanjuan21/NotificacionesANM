from database.database import SessionLocal
from database.models import Notificacion

db = SessionLocal()

# Actualiza todas las notificaciones existentes de vuelta a False
db.query(Notificacion).update({"notificacion_enviada": False})
db.commit()

print("Estado de notificaciones revertido a '⏳ Pendiente'.")
db.close()