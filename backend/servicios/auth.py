"""
Inicio de sesión con dos roles:
- admin   (ADMIN_USER / ADMIN_PASSWORD): todo, incluida el área de administración.
- usuario (PANEL_USER / PANEL_PASSWORD): el panel de trabajo, sin monitoreo ni logs.

La sesión es una cookie HttpOnly firmada con HMAC. Si no hay ningún usuario
configurado (desarrollo local), el acceso queda abierto como administrador.
"""
import base64
import hashlib
import hmac
import json
import os
import secrets
import threading
import time

NOMBRE_COOKIE = "sesion_anm"
DURACION_SESION = 60 * 60 * 24 * 30  # 30 días

# Rutas de la API que solo puede usar el administrador
PREFIJOS_ADMIN = (
    "/api/admin", "/api/ejecuciones", "/api/scheduler", "/api/correo", "/api/alertas",
    "/api/salud", "/api/mantenimiento", "/api/recordatorios", "/api/notificaciones/enviar-pendientes",
    "/docs", "/redoc", "/openapi.json",
)
RUTAS_PUBLICAS = ("/api/auth/login", "/api/auth/logout", "/api/auth/yo")


def usuarios_configurados() -> dict:
    usuarios = {}
    if os.getenv("ADMIN_USER") and os.getenv("ADMIN_PASSWORD"):
        usuarios[os.getenv("ADMIN_USER")] = (os.getenv("ADMIN_PASSWORD"), "admin")
    if os.getenv("PANEL_USER") and os.getenv("PANEL_PASSWORD"):
        usuarios.setdefault(os.getenv("PANEL_USER"), (os.getenv("PANEL_PASSWORD"), "usuario"))
    return usuarios


def autenticacion_activa() -> bool:
    return bool(usuarios_configurados())


def _secreto() -> bytes:
    s = os.getenv("SESSION_SECRET")
    if s:
        return s.encode()
    # Derivado de las contraseñas: si se cambia una contraseña, se cierran todas las sesiones
    base = "anm|" + "|".join(f"{u}:{p}" for u, (p, _) in sorted(usuarios_configurados().items()))
    return hashlib.sha256(base.encode()).digest()


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode().rstrip("=")


def _unb64(texto: str) -> bytes:
    return base64.urlsafe_b64decode(texto + "=" * (-len(texto) % 4))


def crear_token(usuario: str, rol: str) -> str:
    carga = _b64(json.dumps({"u": usuario, "r": rol, "exp": int(time.time()) + DURACION_SESION}).encode())
    firma = _b64(hmac.new(_secreto(), carga.encode(), hashlib.sha256).digest())
    return f"{carga}.{firma}"


def leer_token(token: str):
    """Devuelve {'usuario', 'rol'} si el token es válido, si no None."""
    try:
        carga, firma = token.split(".", 1)
        esperada = _b64(hmac.new(_secreto(), carga.encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(firma, esperada):
            return None
        datos = json.loads(_unb64(carga))
        if datos.get("exp", 0) < time.time():
            return None
        # El usuario debe seguir existiendo con el mismo rol
        actual = usuarios_configurados().get(datos.get("u"))
        if not actual or actual[1] != datos.get("r"):
            return None
        return {"usuario": datos["u"], "rol": datos["r"]}
    except Exception:
        return None


def verificar_credenciales(usuario: str, clave: str):
    """Devuelve el rol si las credenciales son correctas, si no None (tiempo constante)."""
    encontrado = None
    for u, (p, rol) in usuarios_configurados().items():
        if secrets.compare_digest(u.encode(), (usuario or "").encode()) and \
                secrets.compare_digest(p.encode(), (clave or "").encode()):
            encontrado = rol
    return encontrado


# ---------------------------------------------------------------- Límite de intentos fallidos

_intentos = {}
_lock_intentos = threading.Lock()
MAX_INTENTOS, VENTANA = 10, 15 * 60


def bloqueado(ip: str) -> bool:
    ahora = time.time()
    with _lock_intentos:
        lista = [t for t in _intentos.get(ip, []) if ahora - t < VENTANA]
        _intentos[ip] = lista
        return len(lista) >= MAX_INTENTOS


def registrar_fallo(ip: str):
    with _lock_intentos:
        _intentos.setdefault(ip, []).append(time.time())


def limpiar_fallos(ip: str):
    with _lock_intentos:
        _intentos.pop(ip, None)


def requiere_admin(ruta: str) -> bool:
    return ruta.startswith(PREFIJOS_ADMIN)
