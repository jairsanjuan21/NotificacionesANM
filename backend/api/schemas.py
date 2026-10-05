from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

# Esquemas para Cliente
class ClienteBase(BaseModel):
    placa: str
    nombre_empresa: Optional[str] = None
    activo: bool = True

class ClienteCreate(ClienteBase):
    pass

class ClienteResponse(ClienteBase):
    id_cliente: int

    class Config:
        from_attributes = True

# Esquemas para Notificación
class NotificacionResponse(BaseModel):
    id_notificacion: int
    id_cliente: int
    fecha_aviso: Optional[str] = None
    url_pdf: str
    fecha_registro: datetime
    notificacion_enviada: bool

    class Config:
        from_attributes = True