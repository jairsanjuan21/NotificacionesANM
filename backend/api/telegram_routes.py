"""
Webhooks de Telegram. Son rutas públicas (Telegram no tiene sesión del panel):
la autenticación es el secreto que Telegram envía en el header.
"""
from fastapi import APIRouter, BackgroundTasks, Request
from fastapi.responses import JSONResponse

from servicios.telegram_bot import procesar_update, secreto_valido

router = APIRouter(prefix="/telegram")


@router.post("/{canal}")
async def webhook(canal: str, request: Request, tareas: BackgroundTasks):
    if not secreto_valido(canal, request.headers.get("X-Telegram-Bot-Api-Secret-Token")):
        # 404 en vez de 401: a un curioso no le confirmamos que la ruta existe
        return JSONResponse({"detail": "Not Found"}, status_code=404)
    try:
        update = await request.json()
    except Exception:
        return {"ok": True}
    # Se responde 200 de inmediato. Si tardamos o devolvemos error, Telegram reintenta
    # la misma actualización una y otra vez; el trabajo real va en segundo plano.
    tareas.add_task(procesar_update, canal, update)
    return {"ok": True}
