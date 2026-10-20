import os
import sys

sys.path.append(os.path.abspath(os.path.dirname(__file__)))
from database.database import SessionLocal
from database.models import Cliente, Notificacion

db = SessionLocal()

# 1. Actualizar el nombre de HAN-111
cliente_han = db.query(Cliente).filter(Cliente.placa == "HAN-111").first()
if cliente_han:
    cliente_han.nombre_empresa = "CONYSER SAS"
    print("[+] Nombre de HAN-111 actualizado a CONYSER SAS.")

# 2. Purgar notificaciones que no apunten a documentos específicos
# Los boletines generales suelen tener 'file_notificaciones_por_avisos_tablas' en su URL
notifs_antiguas = (
    db.query(Notificacion)
    .filter(
        Notificacion.id_cliente == (cliente_han.id_cliente if cliente_han else -1),
        Notificacion.url_pdf.contains("file_notificaciones_por_avisos_tablas")
    )
    .all()
)

for notif in notifs_antiguas:
    db.delete(notif)

db.commit()
print(f"[+] Se eliminaron {len(notifs_antiguas)} enlaces antiguos de boletines generales.")
db.close()