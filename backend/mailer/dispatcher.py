import os
import smtplib
import requests
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from dotenv import load_dotenv
from sqlalchemy.orm import Session
from database.models import Notificacion, Cliente

load_dotenv()

print("Iniciando Módulo de Mensajería (Email Dispatcher)...")


def _enviar_via_brevo_o_smtp(remitente: str, destinatario: str, password: str, asunto: str, cuerpo_html: str):
    """
    Envía el correo usando la API HTTP de Brevo (Puerto 443) si BREVO_API_KEY está configurada.
    Si no existe BREVO_API_KEY, utiliza SMTP tradicional (Puerto 465) como respaldo local.
    """
    brevo_api_key = os.getenv("BREVO_API_KEY")

    # Soporta uno o varios correos separados por coma en EMAIL_RECEIVER
    lista_correos = [c.strip() for c in destinatario.split(",") if c.strip()]

    # 1. MODO CLOUD / RAILWAY: API HTTP de Brevo (Puerto 443 - Evita [Errno 101] Network is unreachable)
    if brevo_api_key:
        url = "https://api.brevo.com/v3/smtp/email"
        headers = {
            "accept": "application/json",
            "api-key": brevo_api_key,
            "content-type": "application/json"
        }
        payload = {
            "sender": {
                "name": "Sistema de Monitoreo Minero ANM",
                "email": remitente
            },
            "to": [{"email": c} for c in lista_correos],
            "subject": asunto,
            "htmlContent": cuerpo_html
        }

        response = requests.post(url, json=payload, headers=headers, timeout=20)
        if response.status_code not in (200, 201, 202):
            raise Exception(f"Error API Brevo ({response.status_code}): {response.text}")

        print(f"[DISPATCHER HTTP] Correo enviado exitosamente vía Brevo a: {', '.join(lista_correos)}")
        return True

    # 2. MODO LOCAL: SMTP SSL (Puerto 465)
    if not password:
        raise Exception("No se encontró BREVO_API_KEY ni EMAIL_PASSWORD en las variables de entorno.")

    msg = MIMEMultipart("alternative")
    msg["Subject"] = asunto
    msg["From"] = remitente
    msg["To"] = ", ".join(lista_correos)
    msg.attach(MIMEText(cuerpo_html, "html"))

    with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=20) as server:
        server.login(remitente, password)
        server.sendmail(remitente, lista_correos, msg.as_string())

    print(f"[DISPATCHER SMTP] Correo enviado exitosamente vía SMTP local a: {', '.join(lista_correos)}")
    return True


def enviar_alertas_pendientes(db: Session):
    """
    Busca en SQLite todas las notificaciones con notificacion_enviada == False,
    construye el reporte HTML consolidado, lo envía por correo y actualiza el estado.
    """
    pendientes = (
        db.query(Notificacion)
        .join(Cliente, Notificacion.id_cliente == Cliente.id_cliente)
        .filter(Notificacion.notificacion_enviada == False)
        .all()
    )

    if not pendientes:
        print("[DISPATCHER] No hay notificaciones pendientes por enviar.")
        return {"enviadas": 0, "mensaje": "Sin notificaciones pendientes."}

    remitente = os.getenv("EMAIL_SENDER")
    destinatario = os.getenv("EMAIL_RECEIVER")
    password = os.getenv("EMAIL_PASSWORD")

    if not remitente or not destinatario:
        print("[ERROR DISPATCHER] Faltan las variables EMAIL_SENDER o EMAIL_RECEIVER.")
        return {"enviadas": 0, "error": "Credenciales de remitente/destinatario incompletas."}

    # Construcción de las filas de la tabla HTML
    filas_html = ""
    for notif in pendientes:
        cliente = notif.cliente
        placa = getattr(cliente, "placa", "N/A")
        titular = getattr(cliente, "nombre_empresa", None) or "Titular Registrado"
        par = (getattr(cliente, "regional", None) or "ANM").upper()
        nombre_archivo = notif.url_pdf.split("/")[-1] if notif.url_pdf else "Documento PDF"

        filas_html += f"""
        <tr>
            <td style="padding: 10px; border: 1px solid #d1d5db; font-weight: bold; color: #1e293b;">{placa}</td>
            <td style="padding: 10px; border: 1px solid #d1d5db; color: #334155;">{titular}</td>
            <td style="padding: 10px; border: 1px solid #d1d5db; text-align: center; color: #475569;">{par}</td>
            <td style="padding: 10px; border: 1px solid #d1d5db; text-align: center; color: #475569;">{notif.fecha_aviso}</td>
            <td style="padding: 10px; border: 1px solid #d1d5db; text-align: center;">
                <a href="{notif.url_pdf}" target="_blank" style="background-color: #2563eb; color: #ffffff; padding: 6px 12px; text-decoration: none; border-radius: 4px; font-size: 13px;">
                    📄 {nombre_archivo[:30]}
                </a>
            </td>
        </tr>
        """

    asunto = f"🔔 Alerta Minera ANM: {len(pendientes)} Nueva(s) Notificación(es) Detectada(s)"

    cuerpo_html = f"""
    <html>
    <body style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.5;">
        <div style="max-width: 800px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
            <div style="background-color: #1e3a8a; color: #ffffff; padding: 18px 24px;">
                <h2 style="margin: 0; font-size: 20px;">Sistema de Monitoreo Minero ANM</h2>
                <p style="margin: 4px 0 0; font-size: 13px; opacity: 0.9;">Reporte automático de Estados y Resoluciones</p>
            </div>
            <div style="padding: 24px;">
                <p>Se han detectado <strong>{len(pendientes)}</strong> nuevas actuaciones asociadas a los títulos monitoreados:</p>
                <table style="width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 14px;">
                    <thead>
                        <tr style="background-color: #f3f4f6; text-align: left;">
                            <th style="padding: 10px; border: 1px solid #d1d5db;">Placa</th>
                            <th style="padding: 10px; border: 1px solid #d1d5db;">Titular</th>
                            <th style="padding: 10px; border: 1px solid #d1d5db; text-align: center;">PAR</th>
                            <th style="padding: 10px; border: 1px solid #d1d5db; text-align: center;">Fecha Aviso</th>
                            <th style="padding: 10px; border: 1px solid #d1d5db; text-align: center;">Documento</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filas_html}
                    </tbody>
                </table>
            </div>
        </div>
    </body>
    </html>
    """

    try:
        _enviar_via_brevo_o_smtp(
            remitente=remitente,
            destinatario=destinatario,
            password=password,
            asunto=asunto,
            cuerpo_html=cuerpo_html
        )

        # Marcar como enviadas en la base de datos una vez confirmado el envío HTTP/SMTP
        for notif in pendientes:
            notif.notificacion_enviada = True
        db.commit()

        print(f"[SUCCESS] {len(pendientes)} notificaciones marcadas como enviadas en SQLite.")
        return {"enviadas": len(pendientes), "mensaje": "Notificaciones despachadas con éxito."}

    except Exception as e:
        db.rollback()
        print(f"[CRITICAL] Falla en el protocolo de Correo o Base de Datos: {e}")
        return {"enviadas": 0, "error": str(e)}


# Alias de compatibilidad por si acaso
despachar_notificaciones = enviar_alertas_pendientes
ejecutar_dispatcher = enviar_alertas_pendientes
enviar_alertas = enviar_alertas_pendientes