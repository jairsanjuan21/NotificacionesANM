import os
import sys
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from sqlalchemy.orm import Session
from dotenv import load_dotenv

sys.path.append(os.path.abspath(os.path.dirname(__file__)))

from database.database import SessionLocal
from database.models import Cliente, Notificacion

load_dotenv()

SMTP_SERVER = "smtp.gmail.com"
SMTP_PORT = 587
SENDER_EMAIL = os.getenv("EMAIL_SENDER")
SENDER_PASSWORD = os.getenv("EMAIL_PASSWORD")
RECEIVER_EMAIL = os.getenv("EMAIL_RECEIVER")

CANTIDAD_PRUEBA = 3  # Máximo de notificaciones para la prueba

def enviar_prueba_acotada():
    print(f"Iniciando envío de prueba acotado (máximo {CANTIDAD_PRUEBA} notificaciones)...")
    db: Session = SessionLocal()

    try:
        # 1. Buscar primero pendientes reales
        notificaciones_muestra = (
            db.query(Notificacion)
            .filter(Notificacion.notificacion_enviada == False)
            .limit(CANTIDAD_PRUEBA)
            .all()
        )

        # Si no hay pendientes (porque todo se marcó como leído), tomamos las últimas N registradas
        if not notificaciones_muestra:
            print("No hay pendientes; tomando las últimas registradas para fines de prueba...")
            notificaciones_muestra = (
                db.query(Notificacion)
                .order_by(Notificacion.fecha_registro.desc())
                .limit(CANTIDAD_PRUEBA)
                .all()
            )

        if not notificaciones_muestra:
            print("[!] No hay notificaciones en la base de datos para enviar.")
            return

        # 2. Generar el correo HTML
        html_content = f"""
        <html>
          <body style="font-family: Arial, sans-serif; color: #333; line-height: 1.5;">
            <div style="background-color: #1f3a52; padding: 16px; border-radius: 6px 6px 0 0;">
                <h2 style="color: #ffffff; margin: 0;">Prueba de Monitoreo ANM - Alertas de Expedientes</h2>
            </div>
            <div style="padding: 16px; border: 1px solid #ddd; border-top: none; border-radius: 0 0 6px 6px;">
                <p>Hola, este es un correo de prueba del sistema de monitoreo automatizado de resoluciones mineras de la ANM.</p>
                <p>Muestra de novedades detectadas ({len(notificaciones_muestra)} registros):</p>
                
                <table border="1" cellpadding="9" cellspacing="0" style="border-collapse: collapse; width: 100%; text-align: left; font-size: 14px;">
                  <tr style="background-color: #f4f6f8;">
                    <th>Placa</th>
                    <th>Titular / Empresa</th>
                    <th>Fecha del Aviso</th>
                    <th>Documento Oficial</th>
                  </tr>
        """

        for notif in notificaciones_muestra:
            cliente = db.query(Cliente).filter(Cliente.id_cliente == notif.id_cliente).first()
            placa = cliente.placa if cliente else "N/A"
            empresa = cliente.nombre_empresa if cliente else "Sin asignar"

            html_content += f"""
                  <tr>
                    <td><strong>{placa}</strong></td>
                    <td>{empresa}</td>
                    <td>{notif.fecha_aviso}</td>
                    <td>
                        <a href="{notif.url_pdf}" target="_blank" style="color: #1a73e8; font-weight: bold; text-decoration: none;">
                            📄 Abrir Resolución
                        </a>
                    </td>
                  </tr>
            """

        html_content += """
                </table>
                <p style="font-size: 12px; color: #666; margin-top: 24px;">
                  Mensaje emitido automáticamente por el despachador RPA de Notificaciones ANM.
                </p>
            </div>
          </body>
        </html>
        """

        # 3. Ensamblar y despachar por SMTP
        msg = MIMEMultipart("alternative")
        msg["Subject"] = f"🔔 [DEMO] Resumen ANM: {len(notificaciones_muestra)} resoluciones detectadas"
        msg["From"] = SENDER_EMAIL
        msg["To"] = RECEIVER_EMAIL
        msg.attach(MIMEText(html_content, "html"))

        print(f"Enviando correo desde {SENDER_EMAIL} hacia {RECEIVER_EMAIL}...")
        server = smtplib.SMTP(SMTP_SERVER, SMTP_PORT)
        server.starttls()
        server.login(SENDER_EMAIL, SENDER_PASSWORD)
        server.sendmail(SENDER_EMAIL, RECEIVER_EMAIL, msg.as_string())
        server.quit()

        print("[OK] Correo de demostración entregado con éxito.")

    except Exception as e:
        print(f"[ERROR] Error al procesar el envío: {str(e)}")
    finally:
        db.close()

if __name__ == "__main__":
    enviar_prueba_acotada()