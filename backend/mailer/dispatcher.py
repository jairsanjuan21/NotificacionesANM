import os
import sys
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from sqlalchemy.orm import Session
from dotenv import load_dotenv

# Ajuste de ruta para importar módulos desde la raíz
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database.database import SessionLocal
from database.models import Cliente, Notificacion

# Cargar variables del archivo .env
load_dotenv()

SMTP_SERVER = "smtp.gmail.com"
SMTP_PORT = 587
SENDER_EMAIL = os.getenv("EMAIL_SENDER")
SENDER_PASSWORD = os.getenv("EMAIL_PASSWORD")
RECEIVER_EMAIL = os.getenv("EMAIL_RECEIVER")

def enviar_alertas_pendientes():
    print("Iniciando Módulo de Mensajería (Email Dispatcher)...")
    db: Session = SessionLocal()
    
    try:
        # 1. Consultar el Delta (Solo las no enviadas)
        pendientes = db.query(Notificacion).filter(Notificacion.notificacion_enviada == False).all()
        
        if not pendientes:
            print("No hay notificaciones pendientes por enviar.")
            return
            
        print(f"Compilando {len(pendientes)} notificaciones pendientes...")

        # 2. Construir la plantilla HTML del correo
        html_content = """
        <html>
          <body style="font-family: Arial, sans-serif; color: #333;">
            <div style="background-color: #2c3e50; padding: 15px; border-radius: 5px 5px 0 0;">
                <h2 style="color: white; margin: 0;">Nuevas notificaciones ANM Detectadas</h2>
            </div>
            <div style="padding: 15px; border: 1px solid #ddd; border-top: none;">
                <p>Ing. Samir Sanjuan, el motor de extracción automático ha identificado novedades en los siguientes expedientes:</p>
                <table border="1" cellpadding="10" cellspacing="0" style="border-collapse: collapse; width: 100%; text-align: left;">
                  <tr style="background-color: #f2f2f2;">
                    <th>Cliente / Placa</th>
                    <th>Fecha del Boletín</th>
                    <th>Enlace Oficial</th>
                  </tr>
        """
        
        # Inyectar las filas dinámicamente
        for notif in pendientes:
            cliente = db.query(Cliente).filter(Cliente.id_cliente == notif.id_cliente).first()
            html_content += f"""
                  <tr>
                    <td><strong>{cliente.placa}</strong><br><small>{cliente.nombre_empresa}</small></td>
                    <td>{notif.fecha_aviso}</td>
                    <td>
                        <a href="{notif.url_pdf}" style="color: #2980b9; font-weight: bold; text-decoration: none;">
                            📄 Abrir PDF
                        </a>
                    </td>
                  </tr>
            """
            
        html_content += """
                </table>
                <p style="font-size: 12px; color: #7f8c8d; margin-top: 25px;">
                  Este es un mensaje generado automáticamente por el sistema de monitoreo RPA.
                </p>
            </div>
          </body>
        </html>
        """

        # 3. Ensamblar y enviar el paquete SMTP
        msg = MIMEMultipart("alternative")
        msg["Subject"] = f"🔔 Alerta ANM: {len(pendientes)} nuevas notificaciones"
        msg["From"] = SENDER_EMAIL
        msg["To"] = RECEIVER_EMAIL
        msg.attach(MIMEText(html_content, "html"))

        print("Conectando al servidor SMTP de Google...")
        server = smtplib.SMTP(SMTP_SERVER, SMTP_PORT)
        server.starttls()  # Encriptar la conexión
        server.login(SENDER_EMAIL, SENDER_PASSWORD)
        server.sendmail(SENDER_EMAIL, RECEIVER_EMAIL, msg.as_string())
        server.quit()
        
        print("Correo de alerta entregado exitosamente.")

        # 4. Actualizar el estado en la base de datos (Transacción)
        for notif in pendientes:
            notif.notificacion_enviada = True
        db.commit()
        
        print("Estado de registros actualizado a '✅ Enviado'.")

    except Exception as e:
        print(f"[CRITICAL] Falla en el protocolo SMTP o Base de Datos: {str(e)}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    enviar_alertas_pendientes()