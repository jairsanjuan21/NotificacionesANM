from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class ClienteBase(BaseModel):
    placa: str
    nombre_empresa: Optional[str] = "SIN NOMBRE"
    regional: Optional[str] = "bucaramanga"
    activo: Optional[bool] = True
    email: Optional[str] = None
    nit: Optional[str] = None


class ClienteCreate(ClienteBase):
    pass


class ClienteUpdate(BaseModel):
    placa: Optional[str] = None
    nombre_empresa: Optional[str] = None
    regional: Optional[str] = None
    activo: Optional[bool] = None
    email: Optional[str] = None
    nit: Optional[str] = None


class ClienteResponse(ClienteBase):
    model_config = ConfigDict(from_attributes=True)
    id_cliente: int


class NotificacionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id_notificacion: int
    id_cliente: int
    fecha_aviso: Optional[str] = None
    url_pdf: str
    notificacion_enviada: bool = False
    fecha_registro: Optional[datetime] = None

    fuente: Optional[str] = "avisos"
    tipo_notificacion: Optional[str] = None
    numero: Optional[str] = None

    procesada: Optional[bool] = False
    tipo_acto: Optional[str] = None
    urgencia: Optional[str] = None
    motivo_urgencia: Optional[str] = None
    termino_dias: Optional[int] = None
    resumen: Optional[str] = None
    tiene_archivo: bool = False

    fecha_surtida: Optional[date] = None
    fecha_limite: Optional[date] = None
    base_plazo: Optional[str] = None
    dias_habiles_restantes: Optional[int] = None

    estado: Optional[str] = "nueva"
    notas: Optional[str] = None
    fecha_gestion: Optional[datetime] = None


class NotificacionGestion(BaseModel):
    estado: Optional[str] = None
    notas: Optional[str] = None


class EjecucionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id_ejecucion: int
    inicio: Optional[datetime] = None
    fin: Optional[datetime] = None
    origen: Optional[str] = None
    id_cliente: Optional[int] = None
    estado: Optional[str] = None
    placas_consultadas: Optional[int] = 0
    consultas_ok: Optional[int] = 0
    consultas_error: Optional[int] = 0
    nuevas: Optional[int] = 0
    alertas: Optional[str] = None
