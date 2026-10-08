from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class ClienteBase(BaseModel):
    placa: str
    nombre_empresa: Optional[str] = "SIN NOMBRE"
    regional: Optional[str] = "bucaramanga"
    activo: Optional[bool] = True

class ClienteCreate(ClienteBase):
    pass

class ClienteUpdate(BaseModel):
    placa: Optional[str] = None
    nombre_empresa: Optional[str] = None
    regional: Optional[str] = None
    activo: Optional[bool] = None

class ClienteResponse(ClienteBase):
    id_cliente: int

    class Config:
        from_attributes = True

class NotificacionBase(BaseModel):
    id_cliente: int
    fecha_aviso: str
    url_pdf: str
    notificacion_enviada: bool = False

class NotificacionResponse(NotificacionBase):
    id_notificacion: int
    fecha_registro: Optional[datetime] = None

    class Config:
        from_attributes = True