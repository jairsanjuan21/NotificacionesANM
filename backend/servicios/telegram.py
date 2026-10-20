"""
Envío por Telegram con dos canales independientes:

  - "cliente": bot del ingeniero (notificaciones nuevas, recordatorios, consultas por placa).
  - "admin":   bot del administrador (barridos, salud del sistema, auditoría).

Variables de entorno:
  TG_CLIENTE_TOKEN / TG_CLIENTE_CHATS   Bot del cliente y chat ids autorizados (separados por coma).
                                        Si no existen, se usan las antiguas TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID.
  TG_ADMIN_TOKEN   / TG_ADMIN_CHAT      Bot del administrador y su(s) chat id(s).

Un mensaje de un canal nunca cae en el otro: si el canal admin no está configurado,
sus alertas solo quedan en el log (y siguen saliendo por correo).
"""
import os
import re
import time

import requests

CANALES = ("cliente", "admin")
LIMITE_TEXTO = 4096          # límite de Telegram por mensaje
MARGEN = 3900                # se deja holgura para no rozar el límite
API = "https://api.telegram.org/bot{token}/{metodo}"

_PATRON_TOKEN = re.compile(r"bot\d+:[A-Za-z0-9_-]+")


# ----------------------------------------------------------------------------- configuración

def _token(canal: str) -> str:
    if canal == "cliente":
        return os.getenv("TG_CLIENTE_TOKEN") or os.getenv("TELEGRAM_BOT_TOKEN") or ""
    if canal == "admin":
        return os.getenv("TG_ADMIN_TOKEN") or ""
    raise ValueError(f"Canal de Telegram desconocido: {canal}")


def chats_autorizados(canal: str) -> list:
    if canal == "cliente":
        crudo = os.getenv("TG_CLIENTE_CHATS") or os.getenv("TELEGRAM_CHAT_ID") or ""
    elif canal == "admin":
        crudo = os.getenv("TG_ADMIN_CHAT") or ""
    else:
        raise ValueError(f"Canal de Telegram desconocido: {canal}")
    return [c.strip() for c in crudo.split(",") if c.strip()]


def canal_configurado(canal: str) -> bool:
    return bool(_token(canal) and chats_autorizados(canal))


def telegram_configurado() -> bool:
    """True si al menos un canal está listo (compatibilidad con el panel)."""
    return any(canal_configurado(c) for c in CANALES)


def estado_canales() -> dict:
    return {c: canal_configurado(c) for c in CANALES}


# ----------------------------------------------------------------------------- utilidades

def _sin_token(texto: str) -> str:
    """Las excepciones de requests incluyen la URL, y la URL incluye el token: nunca debe llegar al log."""
    return _PATRON_TOKEN.sub("bot<oculto>", str(texto))


def dividir_mensaje(texto: str, maximo: int = MARGEN) -> list:
    """
    Parte un texto largo por saltos de línea, nunca a mitad de línea.
    Cortar a ciegas cada N caracteres puede partir una etiqueta HTML (<a href=...>)
    y Telegram rechaza el mensaje completo con error 400.
    """
    if len(texto) <= maximo:
        return [texto]
    partes, actual = [], ""
    for linea in texto.split("\n"):
        while len(linea) > maximo:            # una sola línea gigante: último recurso
            if actual:
                partes.append(actual)
                actual = ""
            partes.append(linea[:maximo])
            linea = linea[maximo:]
        candidato = f"{actual}\n{linea}" if actual else linea
        if len(candidato) > maximo:
            partes.append(actual)
            actual = linea
        else:
            actual = candidato
    if actual:
        partes.append(actual)
    return partes


def botones_inline(filas: list) -> dict:
    """
    filas = [[("Texto", "callback_data"), ("Abrir", "https://...")], ...]
    Si el segundo valor empieza con http se crea un botón de enlace, si no, un botón de callback.
    """
    teclado = []
    for fila in filas:
        teclado.append([
            {"text": texto, "url": valor} if str(valor).startswith("http") else {"text": texto, "callback_data": valor}
            for texto, valor in fila
        ])
    return {"inline_keyboard": teclado}


# ----------------------------------------------------------------------------- llamada base

def llamar(canal: str, metodo: str, datos: dict = None, archivos: dict = None, timeout: int = 20):
    """
    Llama a la Bot API. Devuelve el campo 'result' o None si falló.
    Respeta un 429 (demasiadas peticiones) esperando lo que Telegram indique, una sola vez.
    """
    token = _token(canal)
    if not token:
        return None
    url = API.format(token=token, metodo=metodo)
    for intento in (1, 2):
        try:
            if archivos:
                r = requests.post(url, data=datos or {}, files=archivos, timeout=timeout)
            else:
                r = requests.post(url, json=datos or {}, timeout=timeout)
            cuerpo = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
            if r.status_code == 429 and intento == 1:
                espera = min(int(cuerpo.get("parameters", {}).get("retry_after", 3)), 30)
                time.sleep(espera)
                continue
            if r.status_code != 200 or not cuerpo.get("ok"):
                print(f"[TELEGRAM:{canal}] [!] {metodo} respondió {r.status_code}: "
                      f"{_sin_token(cuerpo.get('description') or r.text[:200])}")
                return None
            return cuerpo.get("result")
        except Exception as e:
            print(f"[TELEGRAM:{canal}] [!] No se pudo llamar {metodo}: {_sin_token(e)}")
            return None
    return None


# ----------------------------------------------------------------------------- envío

def enviar_mensaje(canal: str, texto_html: str, chat_id=None, botones: dict = None,
                   silencioso: bool = False) -> bool:
    """
    Envía un mensaje HTML a un chat concreto o, si no se indica, a todos los chats del canal.
    Los botones (reply_markup) van solo en la última parte del mensaje.
    silencioso=True: llega sin sonido ni vibración (para avisos de rutina).
    """
    if not _token(canal):
        print(f"[TELEGRAM:{canal}] Canal sin configurar; mensaje descartado.")
        return False
    destinos = [str(chat_id)] if chat_id is not None else chats_autorizados(canal)
    if not destinos:
        print(f"[TELEGRAM:{canal}] Sin chats autorizados; mensaje descartado.")
        return False

    partes = dividir_mensaje(texto_html)
    ok = True
    for chat in destinos:
        for i, parte in enumerate(partes):
            datos = {"chat_id": chat, "text": parte, "parse_mode": "HTML",
                     "disable_web_page_preview": True, "disable_notification": silencioso}
            if botones and i == len(partes) - 1:
                datos["reply_markup"] = botones
            if llamar(canal, "sendMessage", datos) is None:
                ok = False
    return ok


def notificar_cliente(texto_html: str, botones: dict = None) -> bool:
    return enviar_mensaje("cliente", texto_html, botones=botones)


def notificar_admin(texto_html: str, botones: dict = None, silencioso: bool = False) -> bool:
    return enviar_mensaje("admin", texto_html, botones=botones, silencioso=silencioso)


def enviar_telegram(texto_html: str) -> bool:
    """Compatibilidad con el código anterior: va al canal del cliente."""
    return notificar_cliente(texto_html)
