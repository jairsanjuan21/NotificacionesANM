from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from datetime import datetime
from .database import Base

class Cliente(Base):
    __tablename__ = "clientes"

    id_cliente = Column(Integer, primary_key=True, index=True)
    placa = Column(String, unique=True, index=True, nullable=False)
    nombre_empresa = Column(String, nullable=True)
    activo = Column(Boolean, default=True)

    # Relación para que un cliente pueda tener muchas notificaciones
    notificaciones = relationship("Notificacion", back_populates="cliente")

class Notificacion(Base):
    __tablename__ = "notificaciones"

    id_notificacion = Column(Integer, primary_key=True, index=True)
    id_cliente = Column(Integer, ForeignKey("clientes.id_cliente"))
    fecha_aviso = Column(String, nullable=True)
    url_pdf = Column(String, unique=True, nullable=False)
    fecha_registro = Column(DateTime, default=datetime.utcnow)
    notificacion_enviada = Column(Boolean, default=False)

    # Relación inversa al cliente
    cliente = relationship("Cliente", back_populates="notificaciones")