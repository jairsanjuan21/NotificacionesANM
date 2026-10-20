"""
Comandos del bot del cliente (el ingeniero):

  /placa HAN-111   Últimas notificaciones de una placa, con botón para recibir cada PDF.
                   También funciona escribiendo solo la placa.
  /vencimientos    Notificaciones sin responder cuya fecha límite se acerca.
  /ultimas         Lo último que llegó de todas las placas.

Los PDF se envían desde la copia archivada en el Volume. La primera vez se sube el archivo
y Telegram devuelve un file_id; se guarda y las siguientes veces se reenvía al instante.
"""
import os
import re
from html import escape

from database import database, models
from servicios import plazos
from servicios.telegram import botones_inline, llamar
from servicios.telegram_bot import Contexto, callback, comando, texto_libre

POR_PAGINA = 5
MAX_COINCIDENCIAS = 8
EMOJI_URGENCIA = {"alta": "🔴", "revisar": "🟣", "media": "🟠", "baja": "🟢"}
ETIQUETA_ESTADO = {"nueva": "nueva", "revisada": "revisada", "en_tramite": "en trámite", "respondida": "respondida ✅"}


# ============================================================================ utilidades

def solo_alnum(texto: str) -> str:
    """'han 111' / 'HAN-111' / 'han111' -> 'HAN111' (para comparar placas sin importar cómo se escriban)."""
    return re.sub(r"[^A-Z0-9]", "", (texto or "").upper())


def parece_placa(texto: str) -> bool:
    """Un mensaje suelto se trata como placa si es una sola 'palabra' con letras y números."""
    limpio = solo_alnum(texto)
    return (len(texto.split()) <= 2 and 4 <= len(limpio) <= 15
            and any(c.isdigit() for c in limpio) and any(c.isalpha() for c in limpio))


def buscar_placas(db, consulta: str) -> list:
    """Coincidencia exacta primero; si no hay, las placas que contienen lo escrito."""
    buscado = solo_alnum(consulta)
    if not buscado:
        return []
    clientes = db.query(models.Cliente).order_by(models.Cliente.placa.asc()).all()
    exactas = [c for c in clientes if solo_alnum(c.placa) == buscado]
    if exactas:
        return exactas
    return [c for c in clientes if buscado in solo_alnum(c.placa)]


def _fecha(valor) -> str:
    """'2026-10-12' o date -> '12/10/2026'."""
    if not valor:
        return "—"
    texto = valor.isoformat() if hasattr(valor, "isoformat") else str(valor)
    partes = texto[:10].split("-")
    return "/".join(reversed(partes)) if len(partes) == 3 else texto


def _texto_vencimiento(n) -> str:
    if not n.fecha_limite:
        return ""
    if n.estado == "respondida":
        return f" · vencía {_fecha(n.fecha_limite)}"
    faltan = plazos.dias_habiles_entre(plazos.hoy_co(), n.fecha_limite)
    if faltan < 0:
        return f" · <b>vencida</b> ({_fecha(n.fecha_limite)})"
    if faltan == 0:
        return " · ⚠️ <b>vence HOY</b>"
    return f" · vence {_fecha(n.fecha_limite)} (<b>{faltan}</b> día{'s' if faltan != 1 else ''} hábil{'es' if faltan != 1 else ''})"


def describir_notificacion(n, numero: int, con_placa: bool = False) -> str:
    emoji = EMOJI_URGENCIA.get(n.urgencia, "⚪")
    tipo = " · ".join(x for x in (n.tipo_notificacion, n.tipo_acto) if x) or "Notificación"
    placa = f"<b>{escape(n.cliente.placa)}</b> — " if con_placa and n.cliente else ""
    lineas = [f"<b>{numero}.</b> {emoji} {placa}{escape(tipo)}",
              f"    Publicada {_fecha(n.fecha_aviso)}{_texto_vencimiento(n)}",
              f"    Estado: {ETIQUETA_ESTADO.get(n.estado, n.estado or 'nueva')}"]
    if n.resumen:
        resumen = n.resumen.strip().replace("\n", " ")
        lineas.append(f"    <i>{escape(resumen[:160])}{'…' if len(resumen) > 160 else ''}</i>")
    return "\n".join(lineas)


def botones_pdf(notifs, numerar_desde: int = 1, extra: list = None) -> dict:
    """Una fila de botones '📄 1' '📄 2'... (hasta 5 por fila), más filas extra opcionales."""
    filas, fila = [], []
    for i, n in enumerate(notifs, start=numerar_desde):
        fila.append((f"📄 {i}", f"pdf:{n.id_notificacion}"))
        if len(fila) == 5:
            filas.append(fila)
            fila = []
    if fila:
        filas.append(fila)
    filas.extend(extra or [])
    return botones_inline(filas) if filas else None


# ============================================================================ /placa

def mostrar_placa(ctx: Contexto, db, cliente, desde: int = 0):
    consulta = (db.query(models.Notificacion)
                .filter(models.Notificacion.id_cliente == cliente.id_cliente)
                .order_by(models.Notificacion.fecha_aviso.desc().nulls_last(),
                          models.Notificacion.id_notificacion.desc()))
    total = consulta.count()
    encabezado = f"📋 <b>{escape(cliente.placa)}</b>"
    if cliente.nombre_empresa:
        encabezado += f" — {escape(cliente.nombre_empresa)}"
    if not cliente.activo:
        encabezado += "\n<i>(placa inactiva: no se está monitoreando)</i>"
    if total == 0:
        ctx.responder(f"{encabezado}\n\nNo hay notificaciones registradas para esta placa.")
        return

    notifs = consulta.offset(desde).limit(POR_PAGINA).all()
    hasta = desde + len(notifs)
    titulo = "Últimas" if desde == 0 else "Anteriores"
    cuerpo = "\n\n".join(describir_notificacion(n, desde + i + 1) for i, n in enumerate(notifs))

    navegacion = []
    if hasta < total:
        navegacion.append((f"⬇️ Ver más antiguas ({total - hasta})", f"mas:{cliente.id_cliente}:{hasta}"))
    ctx.responder(f"{encabezado}\n{titulo} {desde + 1}–{hasta} de {total}:\n\n{cuerpo}\n\n"
                  f"Toca un número para recibir el PDF.",
                  botones=botones_pdf(notifs, desde + 1, [navegacion] if navegacion else None))


def consultar_placa(ctx: Contexto, texto: str):
    if not texto.strip():
        ctx.responder("Escribe la placa después del comando, por ejemplo:\n<code>/placa HAN-111</code>\n\n"
                      "O simplemente envíame la placa sola.")
        return
    ctx.accion()
    db = database.SessionLocal()
    try:
        encontradas = buscar_placas(db, texto)
        if not encontradas:
            ctx.responder(f"No encontré ninguna placa registrada que coincida con "
                          f"<b>{escape(texto.strip())}</b>.\nRevisa que esté escrita bien o que esté registrada en el panel.")
        elif len(encontradas) == 1:
            mostrar_placa(ctx, db, encontradas[0])
        else:
            opciones = encontradas[:MAX_COINCIDENCIAS]
            filas = [[(f"{c.placa}" + (f" · {c.nombre_empresa[:25]}" if c.nombre_empresa else ""),
                       f"placa:{c.id_cliente}")] for c in opciones]
            extra = (f"\n(y {len(encontradas) - len(opciones)} más; escribe la placa más completa)"
                     if len(encontradas) > len(opciones) else "")
            ctx.responder(f"Encontré {len(encontradas)} placas que coinciden. ¿Cuál quieres ver?{extra}",
                          botones=botones_inline(filas))
    finally:
        db.close()


@comando("cliente", "placa", "Consultar las notificaciones de una placa")
def cmd_placa(ctx: Contexto):
    consultar_placa(ctx, ctx.argumentos)


@texto_libre("cliente")
def placa_sin_comando(ctx: Contexto):
    if parece_placa(ctx.texto):
        print(f"[BOT:cliente] consulta de placa: {ctx.texto[:30]}")
        consultar_placa(ctx, ctx.texto)
    else:
        ctx.responder("Envíame una placa (por ejemplo <code>HAN-111</code>) o escribe /ayuda para ver las opciones.")


@callback("cliente", "placa")
def cb_placa(ctx: Contexto):
    db = database.SessionLocal()
    try:
        cliente = db.get(models.Cliente, int(ctx.datos_callback.split(":")[1]))
        if cliente:
            mostrar_placa(ctx, db, cliente)
    finally:
        db.close()


@callback("cliente", "mas")
def cb_mas(ctx: Contexto):
    _, id_cliente, desde = ctx.datos_callback.split(":")
    db = database.SessionLocal()
    try:
        cliente = db.get(models.Cliente, int(id_cliente))
        if cliente:
            mostrar_placa(ctx, db, cliente, desde=int(desde))
    finally:
        db.close()


# ============================================================================ envío del PDF

def _nombre_archivo(n) -> str:
    placa = solo_alnum(n.cliente.placa) if n.cliente else "ANM"
    tipo = re.sub(r"[^A-Za-z0-9]+", "_", n.tipo_notificacion or n.tipo_acto or "notificacion").strip("_")
    return f"{placa}_{(n.fecha_aviso or '')[:10]}_{tipo}.pdf".replace("__", "_")


def _leyenda(n) -> str:
    tipo = " · ".join(x for x in (n.tipo_notificacion, n.tipo_acto) if x) or "Notificación"
    placa = escape(n.cliente.placa) if n.cliente else ""
    return f"📄 <b>{placa}</b> — {escape(tipo)}\nPublicada {_fecha(n.fecha_aviso)}{_texto_vencimiento(n)}"


def enviar_pdf(ctx: Contexto, db, n) -> bool:
    """
    Orden de intentos:
      1. file_id guardado (instantáneo, no sube nada).
      2. Copia archivada en el Volume (se sube y se guarda el file_id).
      3. Que Telegram descargue el PDF directamente de la ANM.
      4. Si todo falla, el enlace de la ANM como botón.
    """
    ctx.accion("upload_document")
    base = {"chat_id": ctx.chat_id, "caption": _leyenda(n), "parse_mode": "HTML"}

    if n.telegram_file_id:
        if llamar("cliente", "sendDocument", {**base, "document": n.telegram_file_id}):
            return True
        n.telegram_file_id = None          # el file_id dejó de servir (por ejemplo, se cambió el bot)
        db.commit()

    if n.tiene_archivo and os.path.getsize(n.archivo_local) < 49 * 1024 * 1024:   # límite de 50 MB de Telegram
        with open(n.archivo_local, "rb") as f:
            resultado = llamar("cliente", "sendDocument", base,
                               archivos={"document": (_nombre_archivo(n), f, "application/pdf")}, timeout=90)
        if resultado:
            n.telegram_file_id = (resultado.get("document") or {}).get("file_id")
            db.commit()
            return True

    if n.url_pdf and llamar("cliente", "sendDocument", {**base, "document": n.url_pdf}, timeout=60):
        return True

    print(f"[BOT:cliente] No se pudo enviar el PDF de la notificación {n.id_notificacion}")
    ctx.responder("No pude adjuntar el documento, pero puedes abrirlo desde la página de la ANM:",
                  botones=botones_inline([[("Abrir en la ANM", n.url_pdf)]]) if n.url_pdf else None)
    return False


@callback("cliente", "pdf")
def cb_pdf(ctx: Contexto):
    db = database.SessionLocal()
    try:
        n = db.get(models.Notificacion, int(ctx.datos_callback.split(":")[1]))
        if n is None:
            ctx.responder("Esa notificación ya no existe en el sistema.")
            return
        enviar_pdf(ctx, db, n)
    finally:
        db.close()


# ============================================================================ /vencimientos y /ultimas

@comando("cliente", "vencimientos", "Notificaciones sin responder que están por vencer")
def cmd_vencimientos(ctx: Contexto):
    ctx.accion()
    db = database.SessionLocal()
    try:
        hoy = plazos.hoy_co()
        notifs = (db.query(models.Notificacion)
                  .filter(models.Notificacion.fecha_limite != None,          # noqa: E711
                          models.Notificacion.fecha_limite >= hoy,
                          models.Notificacion.estado != "respondida")
                  .order_by(models.Notificacion.fecha_limite.asc())
                  .limit(10).all())
        if not notifs:
            ctx.responder("✅ No hay notificaciones pendientes con fecha límite próxima.")
            return
        cuerpo = "\n\n".join(describir_notificacion(n, i, con_placa=True) for i, n in enumerate(notifs, 1))
        ctx.responder(f"⏰ <b>Próximos vencimientos</b> (sin marcar como respondidas)\n\n{cuerpo}\n\n"
                      f"<i>Las fechas son estimadas; confírmalas en el acto.</i>",
                      botones=botones_pdf(notifs))
    finally:
        db.close()


@comando("cliente", "ultimas", "Las últimas notificaciones que llegaron")
def cmd_ultimas(ctx: Contexto):
    ctx.accion()
    db = database.SessionLocal()
    try:
        notifs = (db.query(models.Notificacion)
                  .order_by(models.Notificacion.fecha_registro.desc(),
                            models.Notificacion.id_notificacion.desc())
                  .limit(POR_PAGINA * 2).all())
        if not notifs:
            ctx.responder("Todavía no hay notificaciones registradas.")
            return
        cuerpo = "\n\n".join(describir_notificacion(n, i, con_placa=True) for i, n in enumerate(notifs, 1))
        ctx.responder(f"🆕 <b>Últimas notificaciones detectadas</b>\n\n{cuerpo}", botones=botones_pdf(notifs))
    finally:
        db.close()


# ============================================================================ botones para los avisos automáticos

def botones_para_aviso(notifs) -> dict:
    """
    Botones de PDF para los mensajes automáticos (notificaciones nuevas y recordatorios).
    Con muchas notificaciones los botones serían ilegibles, así que solo se ponen hasta 10.
    """
    if not notifs or len(notifs) > 10:
        return None
    filas = [[(f"📄 {n.cliente.placa if n.cliente else ''} · {(n.tipo_notificacion or n.tipo_acto or 'PDF')[:22]}",
               f"pdf:{n.id_notificacion}")] for n in notifs]
    return botones_inline(filas)
