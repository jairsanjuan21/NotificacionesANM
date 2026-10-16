from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel

from servicios import auth

router = APIRouter()


class Credenciales(BaseModel):
    usuario: str
    clave: str


def _ip(request: Request) -> str:
    return (request.headers.get("x-forwarded-for") or (request.client.host if request.client else "?")).split(",")[0].strip()


@router.post("/auth/login")
def iniciar_sesion(datos: Credenciales, request: Request, response: Response):
    if not auth.autenticacion_activa():
        return {"usuario": "local", "rol": "admin", "autenticacion": False}
    ip = _ip(request)
    if auth.bloqueado(ip):
        raise HTTPException(status_code=429, detail="Demasiados intentos fallidos. Espere 15 minutos e intente de nuevo.")
    rol = auth.verificar_credenciales(datos.usuario.strip(), datos.clave)
    if not rol:
        auth.registrar_fallo(ip)
        print(f"[AUTH] Intento de inicio de sesión fallido para '{datos.usuario[:40]}' desde {ip}")
        raise HTTPException(status_code=401, detail="Usuario o contraseña incorrectos.")
    auth.limpiar_fallos(ip)
    segura = request.headers.get("x-forwarded-proto", request.url.scheme) == "https"
    response.set_cookie(auth.NOMBRE_COOKIE, auth.crear_token(datos.usuario.strip(), rol), max_age=auth.DURACION_SESION,
                        httponly=True, samesite="lax", secure=segura, path="/")
    print(f"[AUTH] Sesión iniciada: {datos.usuario.strip()} ({rol})")
    return {"usuario": datos.usuario.strip(), "rol": rol, "autenticacion": True}


@router.post("/auth/logout")
def cerrar_sesion(response: Response):
    response.delete_cookie(auth.NOMBRE_COOKIE, path="/")
    return {"ok": True}


@router.get("/auth/yo")
def quien_soy(request: Request):
    if not auth.autenticacion_activa():
        return {"usuario": "local", "rol": "admin", "autenticacion": False}
    sesion = auth.leer_token(request.cookies.get(auth.NOMBRE_COOKIE, ""))
    if not sesion:
        raise HTTPException(status_code=401, detail="No ha iniciado sesión.")
    return {**sesion, "autenticacion": True}
