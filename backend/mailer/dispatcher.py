import os
import smtplib
from collections import defaultdict
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from html import escape

import requests
from dotenv import load_dotenv
from sqlalchemy.orm import Session

from database.models import Cliente, Notificacion
from servicios import plazos
from servicios.telegram import enviar_telegram

load_dotenv()

print("Iniciando Módulo de Mensajería (Email Dispatcher)...")

ORDEN_URGENCIA = {"alta": 0, "revisar": 1, "media": 2, "baja": 3, None: 4}
COLOR_URGENCIA = {"alta": "#dc2626", "revisar": "#7c3aed", "media": "#d97706", "baja": "#16a34a"}
ETIQUETA_URGENCIA = {"alta": "ALTA", "revisar": "REVISAR", "media": "MEDIA", "baja": "BAJA"}
URL_PANEL = os.getenv("URL_PANEL", "https://notificacionesanm-production.up.railway.app")


# ======================================================================= Envío base

def _enviar_via_brevo_o_smtp(remitente: str, destinatario: str, password: str, asunto: str, cuerpo_html: str):
    """
    Envía el correo usando la API HTTP de Brevo (Puerto 443) si BREVO_API_KEY está configurada.
    Si no existe BREVO_API_KEY, utiliza SMTP tradicional (Puerto 465) como respaldo local.
    """
    brevo_api_key = os.getenv("BREVO_API_KEY")
    lista_correos = [c.strip() for c in destinatario.split(",") if c.strip()]

    if brevo_api_key:
        response = requests.post(
            "https://api.brevo.com/v3/smtp/email",
            json={
                "sender": {"name": "Sistema de Monitoreo Minero ANM", "email": remitente},
                "to": [{"email": c} for c in lista_correos],
                "subject": asunto,
                "htmlContent": cuerpo_html,
            },
            headers={"accept": "application/json", "api-key": brevo_api_key, "content-type": "application/json"},
            timeout=20,
        )
        if response.status_code not in (200, 201, 202):
            raise Exception(f"Error API Brevo ({response.status_code}): {response.text}")
        print(f"[DISPATCHER HTTP] Correo enviado vía Brevo a: {', '.join(lista_correos)}")
        return True

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
    print(f"[DISPATCHER SMTP] Correo enviado vía SMTP a: {', '.join(lista_correos)}")
    return True


def enviar_correo(destinatario: str, asunto: str, cuerpo_html: str):
    """Envía un correo con la configuración del sistema. Lanza excepción si falla."""
    remitente = os.getenv("EMAIL_SENDER")
    if not remitente or not destinatario:
        raise Exception("Faltan las variables EMAIL_SENDER o EMAIL_RECEIVER.")
    return _enviar_via_brevo_o_smtp(remitente, destinatario, os.getenv("EMAIL_PASSWORD"), asunto, cuerpo_html)


# ======================================================================= Plantillas

def _plantilla(titulo: str, subtitulo: str, contenido: str) -> str:
    return f"""
    <html><body style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.5;">
      <div style="max-width: 900px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
        <div style="background-color: #1e3a8a; color: #ffffff; padding: 18px 24px;">
          <h2 style="margin: 0; font-size: 20px;">{escape(titulo)}</h2>
          <p style="margin: 4px 0 0; font-size: 13px; opacity: 0.9;">{escape(subtitulo)}</p>
        </div>
        <div style="padding: 24px;">{contenido}
          <p style="margin-top: 24px; font-size: 12px; color: #6b7280;">
            Las fechas límite son estimadas en días hábiles con festivos de Colombia; verifíquelas en el acto administrativo.
            Panel: <a href="{URL_PANEL}">{URL_PANEL}</a>
          </p>
        </div>
      </div>
    </body></html>"""


def _texto_plazo(notif) -> str:
    if not notif.fecha_limite:
        return "—"
    faltan = plazos.dias_habiles_entre(plazos.hoy_co(), notif.fecha_limite)
    if faltan < 0:
        return f"{notif.fecha_limite.isoformat()}<br><span style='color:#6b7280'>vencido</span>"
    color = "#dc2626" if faltan <= 3 else ("#d97706" if faltan <= 7 else "#374151")
    return f"{notif.fecha_limite.isoformat()}<br><span style='color:{color};font-weight:bold'>{faltan} día(s) hábil(es)</span>"


def _tabla_notificaciones(notifs) -> str:
    th = "padding: 8px; border: 1px solid #d1d5db; text-align: left;"
    td = "padding: 8px; border: 1px solid #d1d5db; vertical-align: top;"
    filas = ""
    for n in notifs:
        c = n.cliente
        nombre_archivo = escape(n.url_pdf.split("/")[-1][:40]) if n.url_pdf else "Documento"
        color = COLOR_URGENCIA.get(n.urgencia, "#6b7280")
        etiqueta = ETIQUETA_URGENCIA.get(n.urgencia, "—")
        detalle = escape(n.resumen) if n.resumen else (escape(n.motivo_urgencia) if n.motivo_urgencia else "")
        tipo = " · ".join(escape(x) for x in [n.tipo_notificacion, n.tipo_acto, n.numero and f"No. {n.numero}"] if x)
        filas += f"""
        <tr>
          <td style="{td} font-weight: bold;">{escape(c.placa if c else 'N/A')}<br>
              <span style="font-weight: normal; color: #475569; font-size: 12px;">{escape((c.nombre_empresa if c else '') or '')}</span></td>
          <td style="{td}"><span style="background:{color};color:#fff;padding:2px 6px;border-radius:4px;font-size:11px;font-weight:bold;">{etiqueta}</span></td>
          <td style="{td} font-size: 13px;">{tipo or '—'}<br><span style="color:#6b7280;font-size:12px;">{detalle}</span></td>
          <td style="{td} text-align: center;">{escape(n.fecha_aviso or '')}</td>
          <td style="{td} text-align: center; font-size: 13px;">{_texto_plazo(n)}</td>
          <td style="{td} text-align: center;">
            <a href="{escape(n.url_pdf)}" target="_blank" style="background-color: #2563eb; color: #ffffff; padding: 5px 10px; text-decoration: none; border-radius: 4px; font-size: 12px;">📄 {nombre_archivo}</a>
          </td>
        </tr>"""
    return f"""
    <table style="width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 14px;">
      <thead><tr style="background-color: #f3f4f6;">
        <th style="{th}">Placa / Titular</th><th style="{th}">Urgencia</th><th style="{th}">Tipo y detalle</th>
        <th style="{th}">Publicación</th><th style="{th}">Fecha límite (estimada)</th><th style="{th}">Documento</th>
      </tr></thead>
      <tbody>{filas}</tbody>
    </table>"""


def _ordenar(notifs):
    return sorted(notifs, key=lambda n: (ORDEN_URGENCIA.get(n.urgencia, 4),
                                         n.fecha_limite.isoformat() if n.fecha_limite else "9999",
                                         n.cliente.placa if n.cliente else ""))


def _linea_telegram(n) -> str:
    c = n.cliente
    etiqueta = ETIQUETA_URGENCIA.get(n.urgencia, "—")
    limite = f" · vence {n.fecha_limite.isoformat()}" if n.fecha_limite else ""
    tipo = n.tipo_notificacion or n.tipo_acto or "Notificación"
    return (f"• <b>{escape(c.placa if c else '')}</b> [{etiqueta}] {escape(tipo)}{limite}\n"
            f"  <a href=\"{escape(n.url_pdf)}\">Ver documento</a>")


# ======================================================================= Notificaciones nuevas

def enviar_alertas_pendientes(db: Session):
    """
    Envía el reporte de todas las notificaciones con notificacion_enviada == False
    (ordenado por urgencia), una copia a cada titular que tenga correo registrado
    y un resumen por Telegram. Marca como enviadas solo si el correo principal sale bien.
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

    destinatario = os.getenv("EMAIL_RECEIVER")
    if not os.getenv("EMAIL_SENDER") or not destinatario:
        print("[ERROR DISPATCHER] Faltan las variables EMAIL_SENDER o EMAIL_RECEIVER.")
        return {"enviadas": 0, "error": "Credenciales de remitente/destinatario incompletas."}

    pendientes = _ordenar(pendientes)
    altas = sum(1 for n in pendientes if n.urgencia == "alta")
    asunto = f"🔔 Alerta Minera ANM: {len(pendientes)} nueva(s) notificación(es)"
    if altas:
        asunto += f" — {altas} de urgencia ALTA"

    contenido = (f"<p>Se detectaron <strong>{len(pendientes)}</strong> nuevas actuaciones en los títulos monitoreados"
                 + (f", <strong style='color:#dc2626'>{altas} de urgencia alta</strong>" if altas else "") + ".</p>"
                 + _tabla_notificaciones(pendientes))

    try:
        enviar_correo(destinatario, asunto,
                      _plantilla("Sistema de Monitoreo Minero ANM", "Reporte automático de notificaciones", contenido))
    except Exception as e:
        db.rollback()
        print(f"[CRITICAL] Falla en el protocolo de Correo: {e}")
        return {"enviadas": 0, "error": str(e)}

    for n in pendientes:
        n.notificacion_enviada = True
    db.commit()
    print(f"[SUCCESS] {len(pendientes)} notificaciones marcadas como enviadas.")

    # Copia a cada titular con correo registrado (los fallos no afectan el envío principal)
    copias_ok, copias_error = 0, 0
    por_cliente = defaultdict(list)
    for n in pendientes:
        if n.cliente and n.cliente.email:
            por_cliente[n.cliente.id_cliente].append(n)
    for notifs in por_cliente.values():
        c = notifs[0].cliente
        try:
            enviar_correo(
                c.email, f"Notificación ANM para su título {c.placa}",
                _plantilla(f"Notificaciones ANM — {c.placa}", c.nombre_empresa or "",
                           f"<p>La ANM publicó {len(notifs)} notificación(es) asociadas a su título minero.</p>"
                           + _tabla_notificaciones(notifs)))
            copias_ok += 1
        except Exception as e:
            copias_error += 1
            print(f"[DISPATCHER] No se pudo enviar copia a {c.placa}: {e}")

    enviar_telegram(f"🔔 <b>{len(pendientes)} nueva(s) notificación(es) ANM</b>"
                    + (f" — {altas} urgentes" if altas else "") + "\n\n"
                    + "\n".join(_linea_telegram(n) for n in pendientes[:30]))

    return {"enviadas": len(pendientes), "copias_titulares": copias_ok, "copias_con_error": copias_error,
            "mensaje": "Notificaciones despachadas con éxito."}


# ======================================================================= Recordatorios de vencimiento

UMBRALES_RECORDATORIO = [int(x) for x in os.getenv("UMBRALES_RECORDATORIO", "5,3,1,0").split(",") if x.strip()]


def enviar_recordatorios(db: Session):
    """Avisa de las notificaciones no respondidas que vencen en 5, 3, 1 o 0 días hábiles."""
    hoy = plazos.hoy_co()
    candidatas = (db.query(Notificacion)
                  .filter(Notificacion.fecha_limite != None, Notificacion.fecha_limite >= hoy,
                          Notificacion.estado != "respondida").all())
    a_recordar = []
    for n in candidatas:
        faltan = plazos.dias_habiles_entre(hoy, n.fecha_limite)
        ya = {x for x in (n.recordatorios_enviados or "").split(",") if x}
        # El umbral más pequeño alcanzado que aún no se haya avisado
        alcanzados = [u for u in UMBRALES_RECORDATORIO if faltan <= u and str(u) not in ya]
        if alcanzados:
            a_recordar.append((n, faltan, alcanzados))

    if not a_recordar:
        print("[RECORDATORIOS] Nada por recordar hoy.")
        return {"recordatorios": 0}

    notifs = _ordenar([n for n, _, _ in a_recordar])
    contenido = ("<p>Estas notificaciones <strong>no están marcadas como respondidas</strong> y se acerca su fecha "
                 "límite estimada:</p>" + _tabla_notificaciones(notifs))
    try:
        enviar_correo(os.getenv("EMAIL_RECEIVER"), f"⏰ Vencimientos ANM: {len(notifs)} notificación(es) por vencer",
                      _plantilla("Recordatorio de vencimientos", "Notificaciones ANM pendientes de gestión", contenido))
    except Exception as e:
        print(f"[RECORDATORIOS] Error enviando correo: {e}")
        return {"recordatorios": 0, "error": str(e)}

    for n, _, alcanzados in a_recordar:
        ya = {x for x in (n.recordatorios_enviados or "").split(",") if x}
        ya.update(str(u) for u in alcanzados)
        n.recordatorios_enviados = ",".join(sorted(ya, key=int, reverse=True))
    db.commit()

    enviar_telegram(f"⏰ <b>{len(notifs)} notificación(es) por vencer</b>\n\n"
                    + "\n".join(_linea_telegram(n) for n in notifs[:30]))
    return {"recordatorios": len(notifs)}


# ======================================================================= Alertas del sistema

def enviar_alerta_sistema(asunto: str, detalle: str):
    """Avisa de un problema del propio sistema (barrido fallido, cambio en el portal, etc.)."""
    contenido = (f"<p style='color:#dc2626;font-weight:bold'>{escape(asunto)}</p>"
                 f"<pre style='white-space:pre-wrap;background:#f3f4f6;padding:12px;border-radius:6px;font-size:13px'>{escape(detalle)}</pre>"
                 "<p>Revise la pestaña <strong>Monitoreo</strong> del panel y los logs de Railway.</p>")
    destino = os.getenv("ALERTAS_EMAIL") or os.getenv("EMAIL_RECEIVER")
    try:
        enviar_correo(destino, f"⚠️ Sistema ANM: {asunto}",
                      _plantilla("Alerta del sistema de monitoreo", "Aviso automático de salud", contenido))
    except Exception as e:
        print(f"[ALERTA SISTEMA] No se pudo enviar el correo de alerta: {e}")
    enviar_telegram(f"⚠️ <b>Sistema ANM: {escape(asunto)}</b>\n{escape(detalle[:1500])}")


# Alias de compatibilidad
despachar_notificaciones = enviar_alertas_pendientes
ejecutar_dispatcher = enviar_alertas_pendientes
enviar_alertas = enviar_alertas_pendientes
