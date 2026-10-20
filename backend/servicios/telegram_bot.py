"""
Recepción de mensajes de Telegram (webhook) para los dos bots.

Flujo de una actualización:
  Telegram --POST--> /api/telegram/{canal}  (se valida el secreto del header)
     -> se responde 200 de inmediato y se procesa en segundo plano
     -> se descarta si es repetida (Telegram reintenta si tardamos)
     -> se valida la lista blanca de chats del canal
     -> se busca el comando en el registro y se ejecuta

Para agregar un comando nuevo basta con decorar una función:

    @comando("cliente", "placa", "Consultar notificaciones de una placa")
    def cmd_placa(ctx):
        ctx.responder("...")
"""
import collections
import hashlib
import hmac
import os
import threading
import time
from dataclasses import dataclass, field
from html import escape

from servicios.telegram import CANALES, _token, canal_configurado, chats_autorizados, \
    enviar_mensaje, llamar, notificar_admin


# ============================================================================ secreto del webhook

def secreto_webhook(canal: str) -> str:
    """
    Secreto que Telegram envía en el header X-Telegram-Bot-Api-Secret-Token.
    Se deriva del token del bot (que solo conoce el servidor), así no hace falta otra variable.
    Si se define TG_WEBHOOK_SECRET, se usa como base en lugar del token.
    """
    base = os.getenv("TG_WEBHOOK_SECRET") or _token(canal)
    return hashlib.sha256(f"anm-webhook:{canal}:{base}".encode()).hexdigest()


def secreto_valido(canal: str, recibido: str) -> bool:
    if canal not in CANALES or not _token(canal):
        return False
    return hmac.compare_digest(secreto_webhook(canal), recibido or "")  # comparación en tiempo constante


# ============================================================================ registro de comandos

@dataclass
class Comando:
    nombre: str
    descripcion: str
    funcion: callable
    en_menu: bool = True


@dataclass
class Contexto:
    """Lo que recibe cada comando: quién escribió, qué escribió y cómo responder."""
    canal: str
    chat_id: int
    texto: str = ""
    argumentos: str = ""
    usuario: dict = field(default_factory=dict)
    callback_id: str = None
    datos_callback: str = None

    def responder(self, texto_html: str, botones: dict = None) -> bool:
        return enviar_mensaje(self.canal, texto_html, chat_id=self.chat_id, botones=botones)

    def accion(self, tipo: str = "typing"):
        """Muestra 'escribiendo...' o 'enviando documento...' mientras se procesa."""
        llamar(self.canal, "sendChatAction", {"chat_id": self.chat_id, "action": tipo})


_COMANDOS = {c: {} for c in CANALES}            # canal -> nombre -> Comando
_CALLBACKS = {c: {} for c in CANALES}           # canal -> prefijo -> función
_TEXTO_LIBRE = {}                               # canal -> función para mensajes que no son comandos


def comando(canal: str, nombre: str, descripcion: str, en_menu: bool = True):
    def decorador(funcion):
        _COMANDOS[canal][nombre] = Comando(nombre, descripcion, funcion, en_menu)
        return funcion
    return decorador


def callback(canal: str, prefijo: str):
    """Maneja los toques en botones inline cuyo callback_data empiece por 'prefijo:'."""
    def decorador(funcion):
        _CALLBACKS[canal][prefijo] = funcion
        return funcion
    return decorador


def texto_libre(canal: str):
    def decorador(funcion):
        _TEXTO_LIBRE[canal] = funcion
        return funcion
    return decorador


# ============================================================================ procesamiento

_vistos = {c: collections.deque(maxlen=500) for c in CANALES}
_vistos_lock = threading.Lock()
_avisos_intrusos = {}                           # (canal, chat_id) -> último aviso (timestamp)
MINUTOS_ENTRE_AVISOS_INTRUSO = 60


def _ya_procesada(canal: str, update_id: int) -> bool:
    with _vistos_lock:
        if update_id in _vistos[canal]:
            return True
        _vistos[canal].append(update_id)
        return False


def _avisar_intruso(canal: str, chat_id: int, usuario: dict, texto: str):
    """Avisa al administrador cuando alguien no autorizado escribe a un bot (como máximo una vez por hora y chat)."""
    clave = (canal, chat_id)
    ahora = time.time()
    if ahora - _avisos_intrusos.get(clave, 0) < MINUTOS_ENTRE_AVISOS_INTRUSO * 60:
        return
    _avisos_intrusos[clave] = ahora
    nombre = " ".join(x for x in (usuario.get("first_name"), usuario.get("last_name")) if x) or "sin nombre"
    alias = f" (@{usuario['username']})" if usuario.get("username") else ""
    notificar_admin(f"🚫 <b>Intento de acceso al bot {canal}</b>\n"
                    f"{escape(nombre)}{escape(alias)}\n"
                    f"Chat ID: <code>{chat_id}</code>\n"
                    f"Escribió: {escape(texto[:200])}\n\n"
                    f"Si es alguien de confianza, agrega su ID a "
                    f"<code>{'TG_CLIENTE_CHATS' if canal == 'cliente' else 'TG_ADMIN_CHAT'}</code> en Railway.")


def _separar_comando(texto: str):
    """'/placa@NotificacionesANM_bot HAN-111' -> ('placa', 'HAN-111')"""
    primero, _, resto = texto.strip().partition(" ")
    return primero[1:].split("@")[0].lower(), resto.strip()


def procesar_update(canal: str, update: dict):
    """Punto de entrada de cada actualización. Nunca lanza excepciones hacia afuera."""
    try:
        update_id = update.get("update_id")
        if update_id is not None and _ya_procesada(canal, update_id):
            return

        if "callback_query" in update:
            _procesar_callback(canal, update["callback_query"])
            return

        mensaje = update.get("message") or update.get("edited_message")
        if not mensaje or "chat" not in mensaje:
            return
        chat = mensaje["chat"]
        chat_id = chat["id"]
        usuario = mensaje.get("from", {})
        texto = (mensaje.get("text") or "").strip()

        if chat.get("type") != "private":
            return  # los bots solo atienden chats privados

        if str(chat_id) not in chats_autorizados(canal):
            enviar_mensaje(canal, "🔒 Este bot es privado.\n"
                                  f"Tu ID es <code>{chat_id}</code>. Compártelo con el administrador "
                                  "si necesitas acceso.", chat_id=chat_id)
            print(f"[BOT:{canal}] Acceso denegado al chat {chat_id}")
            _avisar_intruso(canal, chat_id, usuario, texto)
            return

        ctx = Contexto(canal=canal, chat_id=chat_id, texto=texto, usuario=usuario)

        if texto.startswith("/"):
            nombre, ctx.argumentos = _separar_comando(texto)
            cmd = _COMANDOS[canal].get(nombre)
            if cmd is None:
                ctx.responder(f"No conozco el comando /{escape(nombre)}. Escribe /ayuda para ver las opciones.")
                return
            print(f"[BOT:{canal}] /{nombre} {ctx.argumentos}".rstrip())
            cmd.funcion(ctx)
        elif texto and canal in _TEXTO_LIBRE:
            _TEXTO_LIBRE[canal](ctx)
        else:
            ctx.responder("Escribe /ayuda para ver lo que puedo hacer.")
    except Exception as e:
        print(f"[BOT:{canal}] Error procesando la actualización: {e}")


def _procesar_callback(canal: str, cq: dict):
    chat_id = cq.get("message", {}).get("chat", {}).get("id") or cq.get("from", {}).get("id")
    # Siempre se contesta el callback; si no, el botón se queda con el relojito girando
    if str(chat_id) not in chats_autorizados(canal):
        llamar(canal, "answerCallbackQuery", {"callback_query_id": cq["id"], "text": "No autorizado."})
        return
    datos = cq.get("data") or ""
    prefijo = datos.split(":", 1)[0]
    funcion = _CALLBACKS[canal].get(prefijo)
    ctx = Contexto(canal=canal, chat_id=chat_id, usuario=cq.get("from", {}),
                   callback_id=cq["id"], datos_callback=datos)
    try:
        if funcion:
            funcion(ctx)
    finally:
        llamar(canal, "answerCallbackQuery", {"callback_query_id": cq["id"]})


# ============================================================================ comandos comunes a los dos bots

def _texto_ayuda(canal: str) -> str:
    lineas = [f"/{c.nombre} — {escape(c.descripcion)}" for c in _COMANDOS[canal].values() if c.en_menu]
    return "\n".join(lineas)


def _registrar_comunes(canal: str, saludo: str):
    @comando(canal, "start", "Iniciar el bot")
    def _start(ctx: Contexto):
        nombre = escape(ctx.usuario.get("first_name") or "")
        ctx.responder(f"👋 Hola {nombre}. {saludo}\n\n{_texto_ayuda(canal)}")

    @comando(canal, "ayuda", "Ver los comandos disponibles")
    def _ayuda(ctx: Contexto):
        ctx.responder(f"<b>Comandos disponibles</b>\n\n{_texto_ayuda(canal)}")

    @comando(canal, "id", "Ver tu ID de Telegram", en_menu=False)
    def _id(ctx: Contexto):
        ctx.responder(f"Tu chat ID es <code>{ctx.chat_id}</code>.")


_registrar_comunes("cliente", "Soy el asistente de notificaciones de la ANM. Te aviso cuando haya "
                              "notificaciones nuevas y vencimientos cercanos.")
_registrar_comunes("admin", "Soy el bot de administración. Te aviso sobre barridos y la salud del sistema.")


# ============================================================================ configuración del webhook al arrancar

def url_base_publica() -> str:
    """
    URL pública del servicio. Solo se registra el webhook si estamos en Railway
    (o si se fuerza con TG_WEBHOOK_BASE): así una copia local nunca le roba el webhook a producción.
    """
    if os.getenv("TG_WEBHOOK_BASE"):
        return os.getenv("TG_WEBHOOK_BASE").rstrip("/")
    dominio = os.getenv("RAILWAY_PUBLIC_DOMAIN")
    return f"https://{dominio}" if dominio else ""


def configurar_webhooks() -> dict:
    """Registra el webhook y el menú de comandos de cada bot configurado. Se llama al iniciar el servidor."""
    resultado = {}
    base = url_base_publica()
    for canal in CANALES:
        if not canal_configurado(canal):
            resultado[canal] = "sin configurar"
            continue
        if not base:
            resultado[canal] = "sin URL pública (no se registra el webhook fuera de Railway)"
            continue

        url = f"{base}/api/telegram/{canal}"
        info = llamar(canal, "getWebhookInfo") or {}
        if info.get("url") != url:
            # Primera vez (o cambió la URL): se descartan los mensajes viejos acumulados
            ok = llamar(canal, "setWebhook", {
                "url": url,
                "secret_token": secreto_webhook(canal),
                "allowed_updates": ["message", "callback_query"],
                "drop_pending_updates": True,
                "max_connections": 5,
            })
            resultado[canal] = "webhook registrado" if ok else "error registrando el webhook"
        else:
            # Ya estaba: se reenvía el secreto por si cambió, sin descartar mensajes pendientes
            llamar(canal, "setWebhook", {"url": url, "secret_token": secreto_webhook(canal),
                                         "allowed_updates": ["message", "callback_query"], "max_connections": 5})
            resultado[canal] = "webhook activo"

        menu = [{"command": c.nombre, "description": c.descripcion[:256]}
                for c in _COMANDOS[canal].values() if c.en_menu]
        llamar(canal, "setMyCommands", {"commands": menu})
    print(f"[TELEGRAM] Webhooks: {resultado}")
    return resultado


def estado_webhooks() -> dict:
    """Para diagnóstico: lo que Telegram reporta de cada webhook (errores recientes, pendientes)."""
    salida = {}
    for canal in CANALES:
        if not canal_configurado(canal):
            salida[canal] = None
            continue
        info = llamar(canal, "getWebhookInfo") or {}
        salida[canal] = {
            "activo": bool(info.get("url")),
            "pendientes": info.get("pending_update_count", 0),
            "ultimo_error": info.get("last_error_message"),
        }
    return salida


# ============================================================================ carga de los comandos de cada bot
# Va al final a propósito: esos módulos importan los decoradores definidos arriba.
from servicios import bot_admin, bot_cliente  # noqa: E402,F401
