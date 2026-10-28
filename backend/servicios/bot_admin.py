"""
Bot del administrador: ver cómo trabaja el sistema por dentro.

Comandos:
  /estado            En línea, último deploy, últimos barridos, últimos accesos y agenda.
  /sistema           Detalle técnico: datos, almacenamiento, webhooks, healthchecks.
  /barridos          Últimos barridos; botón para ver el detalle de los que tuvieron problemas.
  /errores           Últimos errores y avisos del log.
  /logs [n]          Últimas n líneas del log (por defecto 20).
  /buscar texto      Busca en el log.
  /auditoria         Actividad de los bots: consultas, PDFs, accesos denegados.
  /barrer            Lanza un barrido completo (pide confirmación).

Avisos automáticos:
  - Al terminar cada barrido (silencioso si salió bien, con sonido si hubo problemas).
  - Al arrancar el servidor (deploy, reinicio o caída).
  - Resumen de errores nuevos del log cada 15 minutos (solo si los hay).
"""
import os
import time
from datetime import datetime
from html import escape

import pytz

from database import database, models
from servicios import contexto_app, healthchecks, registro
from servicios.telegram import botones_inline, notificar_admin
from servicios.telegram_bot import Contexto, callback, comando, estado_webhooks

ZONA_CO = pytz.timezone("America/Bogota")
INICIO_PROCESO = time.time()
EMOJI_ESTADO = {"ok": "✅", "con_alertas": "⚠️", "fallida": "❌", "en_curso": "⏳"}
MAX_TEXTO_PRE = 3300      # un bloque <pre> no se puede partir entre mensajes sin romper el HTML


# ============================================================================ utilidades de formato

def _hora_co(dt_utc, formato="%d/%m %H:%M") -> str:
    if not dt_utc:
        return "—"
    if dt_utc.tzinfo is None:
        dt_utc = pytz.utc.localize(dt_utc)
    return dt_utc.astimezone(ZONA_CO).strftime(formato)


def _hace(dt_utc) -> str:
    if not dt_utc:
        return "nunca"
    segundos = int((datetime.utcnow() - dt_utc.replace(tzinfo=None)).total_seconds())
    return f"hace {_duracion(segundos)}"


def _duracion(segundos) -> str:
    if segundos is None:
        return "—"
    segundos = int(segundos)
    if segundos < 60:
        return f"{segundos} s"
    if segundos < 3600:
        return f"{segundos // 60} min {segundos % 60} s"
    if segundos < 86400:
        return f"{segundos // 3600} h {segundos % 3600 // 60} min"
    return f"{segundos // 86400} d {segundos % 86400 // 3600} h"


def _mb(n_bytes) -> str:
    return f"{n_bytes / 1024 / 1024:.1f} MB"


def _bloque_logs(registros: list, titulo: str) -> str:
    """Formatea líneas del log en un <pre>, recortando para que quepa en un solo mensaje."""
    lineas = []
    for r in reversed(registros):                     # de la más reciente hacia atrás
        try:
            hora = datetime.fromisoformat(r["ts"]).astimezone(ZONA_CO).strftime("%d/%m %H:%M:%S")
        except Exception:
            hora = r.get("ts", "")[:19]
        marca = {"error": "✖", "aviso": "!"}.get(r.get("nivel"), "·")
        texto = r.get("texto", "").replace("\n", " ⏎ ")
        lineas.append(f"{hora} {marca} {texto[:220]}")
        if sum(len(x) + 1 for x in lineas) > MAX_TEXTO_PRE:
            lineas.pop()
            break
    lineas.reverse()                                   # se muestran en orden cronológico
    omitidas = len(registros) - len(lineas)
    pie = f"\n<i>({omitidas} líneas anteriores no caben; usa /buscar para filtrar)</i>" if omitidas > 0 else ""
    return f"<b>{titulo}</b>\n<pre>{escape(chr(10).join(lineas))}</pre>{pie}"


def _linea_barrido(e) -> str:
    emoji = EMOJI_ESTADO.get(e.estado, "•")
    duracion = _duracion((e.fin - e.inicio).total_seconds()) if e.fin and e.inicio else "en curso"
    alcance = "1 placa" if e.id_cliente else f"{e.placas_consultadas or 0} placas"
    return (f"{emoji} <b>#{e.id_ejecucion}</b> {_hora_co(e.inicio)} · {e.origen or ''} · {alcance}\n"
            f"    {duracion} · {e.consultas_ok or 0} ok / {e.consultas_error or 0} error · {e.nuevas or 0} nuevas")


# ============================================================================ /estado

DIAS = ("lun", "mar", "mié", "jue", "vie", "sáb", "dom")


def _fecha_programador(dt) -> str:
    local = dt.astimezone(ZONA_CO)
    return f"{DIAS[local.weekday()]} {local.strftime('%d/%m %H:%M')}"


def _resultado_barrido(e) -> str:
    if e.estado == "en_curso":
        return "⏳ en curso"
    if e.estado == "fallida":
        return "❌ error"
    if (e.consultas_ok or 0) == 0:
        return "❌ ninguna consulta funcionó"
    if e.estado == "con_alertas":
        return "⚠️ con alertas"
    return "✅ todo OK"


def _linea_ultimo_barrido(db, origen: str) -> str:
    e = (db.query(models.Ejecucion).filter(models.Ejecucion.origen == origen)
         .order_by(models.Ejecucion.inicio.desc()).first())
    if e is None:
        return "ninguno registrado"
    alcance = ""
    if e.id_cliente:
        cliente = db.get(models.Cliente, e.id_cliente)
        alcance = f", 1 placa: {escape(cliente.placa)}" if cliente else ", 1 placa"
    return f"{_hace(e.inicio)} · {_resultado_barrido(e)} (#{e.id_ejecucion}{alcance})"


def _linea_acceso(clave: str) -> str:
    from servicios import actividad
    fecha, detalle = actividad.ultima(clave)
    if fecha is None:
        return "sin registro"
    return _hace(fecha) + (f" · {escape(detalle)}" if detalle else "")


def _linea_deployment() -> str:
    """
    Versión que está corriendo y, si hay token de Railway, si el deploy más reciente es otro:
    un deploy que falló deja corriendo la versión anterior, y eso conviene saberlo.
    """
    commit = (os.getenv("RAILWAY_GIT_COMMIT_SHA") or "")[:7]
    mensaje = escape((os.getenv("RAILWAY_GIT_COMMIT_MESSAGE") or "").split("\n")[0][:60])
    version = f"<code>{commit}</code> «{mensaje}»" if commit else "versión local (fuera de Railway)"
    if not os.getenv("RAILWAY_API_TOKEN"):
        return f"{version}\n    activo desde hace {_duracion(time.time() - INICIO_PROCESO)}"
    try:
        from servicios import railway_api
        deploys = railway_api.listar_deployments(5)
        actual = next((d for d in deploys if d.get("actual")), None)
        texto = version
        if actual and actual.get("createdAt"):
            creado = datetime.fromisoformat(actual["createdAt"].replace("Z", "+00:00"))
            texto += f"\n    desplegado {_hace(creado.replace(tzinfo=None))}"
        reciente = deploys[0] if deploys else None
        if reciente and not reciente.get("actual"):
            estado = (reciente.get("status") or "").upper()
            if estado in ("FAILED", "CRASHED"):
                texto += "\n    ⚠️ <b>El deploy más reciente falló</b>: sigue corriendo esta versión"
            elif estado in ("BUILDING", "DEPLOYING", "INITIALIZING", "QUEUED", "WAITING"):
                texto += "\n    🔄 Hay un deploy nuevo en proceso"
        return texto
    except Exception as e:
        return f"{version}\n    (no se pudo consultar Railway: {escape(str(e)[:80])})"


@comando("admin", "estado", "Estado general: deploy, barridos, accesos y agenda")
def cmd_estado(ctx: Contexto):
    ctx.accion()


    problemas = healthchecks.autodiagnostico()
    en_linea = f"hace {_duracion(time.time() - INICIO_PROCESO)} (desde {_hora_co(datetime.utcfromtimestamp(INICIO_PROCESO))})"
    linea_salud = ("🟢 En línea " + en_linea) if not problemas else \
        ("🔴 En línea con problemas " + en_linea + "\n" + "\n".join(f"    • {escape(p)}" for p in problemas))

    db = database.SessionLocal()
    try:
        en_curso = db.query(models.Ejecucion).filter(models.Ejecucion.estado == "en_curso").first()
        automatico = _linea_ultimo_barrido(db, "automatico")
        manual = _linea_ultimo_barrido(db, "manual")
    finally:
        db.close()

    partes = [
        f"🖥️ <b>Estado en línea del sistema</b>\n{linea_salud}",
        f"🚀 <b>Último deployment en Railway</b>\n{_linea_deployment()}",
        (f"⏳ <b>Barrido #{en_curso.id_ejecucion} en curso</b> desde {_hora_co(en_curso.inicio, '%H:%M')}\n\n" if en_curso else "")
        + f"🤖 <b>Último barrido automático</b>\n{automatico}\n\n"
        f"🖐️ <b>Último barrido manual</b>\n{manual}",
        f"👤 <b>Último acceso admin</b> (panel)\n{_linea_acceso('web_admin')}\n\n"
        f"👷 <b>Último acceso usuario</b> (panel)\n{_linea_acceso('web_usuario')}\n\n"
        f"💬 <b>Último acceso Telegram cliente</b>\n{_linea_acceso('tg_cliente')}\n\n"
        f"🛠️ <b>Último acceso Telegram admin</b>\n{_linea_acceso('tg_admin')}",
    ]

    if contexto_app.scheduler is not None:
        tareas = sorted((j for j in contexto_app.scheduler.get_jobs() if j.next_run_time), key=lambda j: j.next_run_time)
        # Los jobs de cada pocos minutos (latido, resumen de errores) no aportan en la agenda
        tareas = [j for j in tareas if j.id not in ("latido", "resumen_errores")]
        lineas = [f"{_fecha_programador(j.next_run_time)} · {escape(j.name.split('(')[0].strip())}" for j in tareas[:5]]
        detenido = "" if contexto_app.scheduler.running else " ⛔ DETENIDO"
        partes.append(f"🗓️ <b>Próximos eventos del programador</b>{detenido}\n" + "\n".join(lineas))

    ctx.responder("\n\n".join(partes) + "\n\n<i>Detalle técnico: /sistema</i>")


# ============================================================================ /sistema

@comando("admin", "sistema", "Detalle técnico: datos, almacenamiento, webhooks")
def cmd_sistema(ctx: Contexto):
    ctx.accion()

    db = database.SessionLocal()
    try:
        total = db.query(models.Notificacion).count()
        sin_enviar = db.query(models.Notificacion).filter(models.Notificacion.notificacion_enviada == False).count()  # noqa: E712
        sin_procesar = db.query(models.Notificacion).filter(
            (models.Notificacion.procesada == False) | (models.Notificacion.procesada == None)).count()  # noqa: E711,E712
        placas = db.query(models.Cliente).filter(models.Cliente.activo == True).count()  # noqa: E712
        ultimo_ok = (db.query(models.Ejecucion)
                     .filter(models.Ejecucion.estado.in_(["ok", "con_alertas"]), models.Ejecucion.consultas_ok > 0)
                     .order_by(models.Ejecucion.inicio.desc()).first())
    finally:
        db.close()

    partes = ["🔧 <b>Detalle técnico</b>",
              f"<b>Datos</b>\n{placas} placas activas · {total} notificaciones\n"
              f"{sin_enviar} pendientes de envío · {sin_procesar} sin procesar\n"
              f"Último barrido con consultas exitosas: {_hace(ultimo_ok.inicio) if ultimo_ok else 'ninguno'}"]

    try:
        db_path = os.getenv("DB_PATH") or database.SEED_DB_PATH
        tam_db = os.path.getsize(db_path) if os.path.exists(db_path) and not os.getenv("DATABASE_URL") else 0
        from servicios.analizador import _directorio_archivo
        dir_pdf = _directorio_archivo()
        pdfs = [os.path.join(dir_pdf, f) for f in os.listdir(dir_pdf)] if os.path.isdir(dir_pdf) else []
        tam_pdf = sum(os.path.getsize(p) for p in pdfs if os.path.isfile(p))
        partes.append(f"<b>Almacenamiento</b>\nBase de datos {_mb(tam_db) if tam_db else '(externa)'} · "
                      f"PDFs {_mb(tam_pdf)} ({len(pdfs)}) · logs {_mb(registro.tamano_archivos())}")
    except Exception as e:
        partes.append(f"<b>Almacenamiento</b>\nNo se pudo medir: {escape(str(e))}")

    lineas = []
    for canal, info in estado_webhooks().items():
        if info is None:
            lineas.append(f"{canal}: sin configurar")
        else:
            error = f" · ⚠️ {escape(info['ultimo_error'])}" if info.get("ultimo_error") else ""
            lineas.append(f"{canal}: {'✅' if info['activo'] else '❌'} {info['pendientes']} pendientes{error}")
    partes.append("<b>Webhooks de Telegram</b>\n" + "\n".join(lineas))

    hc = healthchecks.estado()
    partes.append("<b>healthchecks.io</b>\n" + " · ".join(f"{'✅' if v else '—'} {k}" for k, v in hc.items()))
    ctx.responder("\n\n".join(partes))


# ============================================================================ /barridos

@comando("admin", "barridos", "Últimos barridos y su resultado")
def cmd_barridos(ctx: Contexto):
    db = database.SessionLocal()
    try:
        ejecs = db.query(models.Ejecucion).order_by(models.Ejecucion.inicio.desc()).limit(10).all()
        if not ejecs:
            ctx.responder("Todavía no hay barridos registrados.")
            return
        con_problemas = [e for e in ejecs if e.alertas]
        botones = botones_inline([[(f"🔍 Detalle #{e.id_ejecucion}", f"ejec:{e.id_ejecucion}")]
                                  for e in con_problemas[:5]]) if con_problemas else None
        ctx.responder("<b>Últimos barridos</b> (hora de Colombia)\n\n" + "\n".join(_linea_barrido(e) for e in ejecs),
                      botones=botones)
    finally:
        db.close()


@callback("admin", "ejec")
def cb_detalle_barrido(ctx: Contexto):
    db = database.SessionLocal()
    try:
        e = db.get(models.Ejecucion, int(ctx.datos_callback.split(":")[1]))
        if e is None:
            ctx.responder("Ese barrido ya no existe.")
            return
        detalle = escape((e.alertas or "Sin alertas registradas.")[:3000])
        ctx.responder(f"{_linea_barrido(e)}\n\n<pre>{detalle}</pre>")
    finally:
        db.close()


# ============================================================================ logs y auditoría

@comando("admin", "errores", "Últimos errores y avisos del log")
def cmd_errores(ctx: Contexto):
    datos = registro.consultar(nivel="aviso", limite=40)["registros"]
    if not datos:
        ctx.responder("✅ No hay errores ni avisos en el log reciente.")
        return
    ctx.responder(_bloque_logs(datos, "Errores y avisos recientes"))


@comando("admin", "logs", "Últimas líneas del log (ej: /logs 40)")
def cmd_logs(ctx: Contexto):
    try:
        n = max(1, min(int(ctx.argumentos or 20), 80))
    except ValueError:
        n = 20
    datos = registro.consultar(limite=n)["registros"]
    ctx.responder(_bloque_logs(datos, f"Últimas {len(datos)} líneas del log") if datos else "El log está vacío.")


@comando("admin", "buscar", "Buscar en el log (ej: /buscar HAN-111)")
def cmd_buscar(ctx: Contexto):
    if not ctx.argumentos:
        ctx.responder("Escribe qué buscar, por ejemplo: <code>/buscar timeout</code>")
        return
    datos = registro.consultar(texto=ctx.argumentos, limite=60)["registros"]
    ctx.responder(_bloque_logs(datos, f"Coincidencias de «{escape(ctx.argumentos)}»") if datos
                  else f"Sin coincidencias para «{escape(ctx.argumentos)}» en el log reciente.")


@comando("admin", "auditoria", "Actividad de los bots: consultas y accesos")
def cmd_auditoria(ctx: Contexto):
    datos = registro.consultar(texto="[BOT:", limite=60)["registros"]
    ctx.responder(_bloque_logs(datos, "Actividad de los bots") if datos
                  else "No hay actividad de los bots en el log reciente.")


# ============================================================================ /barrer

@comando("admin", "barrer", "Lanzar un barrido completo ahora")
def cmd_barrer(ctx: Contexto):
    ctx.responder("¿Iniciar un barrido completo de todas las placas activas?",
                  botones=botones_inline([[("✅ Sí, iniciar", "barrer:si"), ("Cancelar", "barrer:no")]]))


@callback("admin", "barrer")
def cb_barrer(ctx: Contexto):
    if ctx.datos_callback != "barrer:si":
        ctx.responder("Cancelado.")
        return
    from scraper.anm_scraper import BarridoEnCurso, iniciar_barrido_en_segundo_plano
    try:
        id_ejecucion = iniciar_barrido_en_segundo_plano(origen="manual")
        print(f"[BOT:admin] Barrido #{id_ejecucion} lanzado desde Telegram")
        ctx.responder(f"🚀 Barrido #{id_ejecucion} iniciado. Te aviso cuando termine.")
    except BarridoEnCurso:
        ctx.responder("⏳ Ya hay un barrido en curso. Te aviso cuando termine.")


# ============================================================================ avisos automáticos

def notificar_fin_barrido(id_ejecucion: int):
    """Se llama al terminar cada barrido. Los barridos de una sola placa solo se avisan si fallan."""
    db = database.SessionLocal()
    try:
        e = db.get(models.Ejecucion, id_ejecucion)
        if e is None:
            return
        if e.id_cliente and e.estado == "ok":
            return
        titulo = {"ok": "Barrido OK", "con_alertas": "Barrido con alertas",
                  "fallida": "Barrido FALLIDO"}.get(e.estado, f"Barrido {e.estado}")
        texto = f"{EMOJI_ESTADO.get(e.estado, '•')} <b>{titulo}</b>\n{_linea_barrido(e)}"
        if e.alertas:
            texto += f"\n\n<pre>{escape(e.alertas[:1500])}</pre>"
        botones = botones_inline([[("🔍 Ver detalle completo", f"ejec:{e.id_ejecucion}")]]) \
            if e.alertas and len(e.alertas) > 1500 else None
        notificar_admin(texto, botones=botones, silencioso=(e.estado == "ok"))
    finally:
        db.close()


def aviso_arranque(barridos_interrumpidos: int = 0, webhooks: dict = None):
    """Aviso de que el servidor arrancó: deja rastro de cada deploy, reinicio o caída."""
    commit = (os.getenv("RAILWAY_GIT_COMMIT_SHA") or "")[:7]
    mensaje = (os.getenv("RAILWAY_GIT_COMMIT_MESSAGE") or "").split("\n")[0][:80]
    texto = "🔄 <b>Servidor iniciado</b>"
    if commit:
        texto += f"\nVersión <code>{commit}</code> {escape(mensaje)}"
    if webhooks:
        texto += "\nWebhooks: " + ", ".join(f"{c} {escape(str(v))}" for c, v in webhooks.items())
    if barridos_interrumpidos:
        texto += (f"\n\n⚠️ {barridos_interrumpidos} barrido(s) quedaron interrumpidos por el reinicio "
                  "y se marcaron como fallidos.")
    notificar_admin(texto, silencioso=not barridos_interrumpidos)


# El resumen de errores revisa el log cada 15 minutos en vez de avisar en cada línea:
#   - agrupa una racha de errores en un solo mensaje,
#   - y evita un bucle: si Telegram falla, ese fallo se registra como error, que dispararía
#     otro envío, que fallaría... Por eso además se ignoran las líneas del propio módulo de Telegram.
_ultimo_id_revisado = [None]
MAX_LINEAS_RESUMEN = 10


def iniciar_resumen_errores():
    """Toma como punto de partida el log actual, para no reenviar errores viejos tras un reinicio."""
    _ultimo_id_revisado[0] = registro.consultar(limite=1)["ultimo_id"]


def resumen_errores():
    if _ultimo_id_revisado[0] is None:
        iniciar_resumen_errores()
        return
    datos = registro.consultar(despues_de=_ultimo_id_revisado[0], nivel="error", limite=500)
    _ultimo_id_revisado[0] = datos["ultimo_id"]
    # Se ignoran los fallos del propio Telegram (bucle) y los cierres de barrido (ya avisan solos)
    errores = [r for r in datos["registros"]
               if "[TELEGRAM" not in r.get("texto", "") and "[BARRIDO #" not in r.get("texto", "")]
    if not errores:
        return
    texto = _bloque_logs(errores[-MAX_LINEAS_RESUMEN:], f"🧯 {len(errores)} error(es) nuevo(s) en el log")
    notificar_admin(texto + "\n\nUsa /errores para ver el contexto.")
