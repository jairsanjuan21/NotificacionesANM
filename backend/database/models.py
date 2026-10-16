from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, DateTime, Date, Text
from sqlalchemy.orm import relationship
from datetime import datetime
from .database import Base


class Cliente(Base):
    __tablename__ = "clientes"

    id_cliente = Column(Integer, primary_key=True, index=True)
    placa = Column(String, unique=True, index=True, nullable=False)
    nombre_empresa = Column(String, nullable=True)
    regional = Column(String, default="All")  # bucaramanga, bogota, ..., All (separadas por coma)
    activo = Column(Boolean, default=True)

    # Nuevos campos
    email = Column(String, nullable=True)   # Correo(s) del titular, separados por coma
    nit = Column(String, nullable=True)     # NIT/C.C. para buscar en cobro coactivo

    notificaciones = relationship("Notificacion", back_populates="cliente")


# Estados de gestión de una notificación
ESTADOS_GESTION = ["nueva", "revisada", "en_tramite", "respondida"]


class Notificacion(Base):
    __tablename__ = "notificaciones"

    id_notificacion = Column(Integer, primary_key=True, index=True)
    id_cliente = Column(Integer, ForeignKey("clientes.id_cliente"))
    fecha_aviso = Column(String, nullable=True)          # Fecha de publicación (YYYY-MM-DD)
    url_pdf = Column(String, nullable=False)
    fecha_registro = Column(DateTime, default=datetime.utcnow)
    notificacion_enviada = Column(Boolean, default=False)

    # Origen
    fuente = Column(String, default="avisos")             # avisos | coactivo
    tipo_notificacion = Column(String, nullable=True)     # Aviso, Estado, Edicto, Liberación de área...
    numero = Column(String, nullable=True)                # Número del aviso / proceso

    # Análisis del documento
    procesada = Column(Boolean, default=False)            # Ya se archivó/analizó/calculó plazo
    tipo_acto = Column(String, nullable=True)             # Auto, Resolución...
    urgencia = Column(String, nullable=True)              # alta | media | baja | revisar
    motivo_urgencia = Column(String, nullable=True)       # Palabras que dispararon la urgencia
    termino_dias = Column(Integer, nullable=True)         # "término de (30) días" detectado en el acto
    resumen = Column(Text, nullable=True)                 # Resumen IA (opcional)
    archivo_local = Column(String, nullable=True)         # Ruta de la copia archivada del PDF

    # Plazos
    fecha_surtida = Column(Date, nullable=True)           # Fecha estimada en que queda notificada
    fecha_limite = Column(Date, nullable=True)            # Fecha límite estimada
    base_plazo = Column(String, nullable=True)            # Explicación del cálculo
    recordatorios_enviados = Column(String, default="")   # Umbrales ya avisados, ej "5,3"

    # Gestión
    estado = Column(String, default="nueva")              # nueva | revisada | en_tramite | respondida
    notas = Column(Text, nullable=True)
    fecha_gestion = Column(DateTime, nullable=True)

    cliente = relationship("Cliente", back_populates="notificaciones")

    @property
    def dias_habiles_restantes(self):
        if not self.fecha_limite:
            return None
        from servicios.plazos import dias_habiles_entre, hoy_co
        return dias_habiles_entre(hoy_co(), self.fecha_limite)

    @property
    def tiene_archivo(self):
        import os
        return bool(self.archivo_local and os.path.exists(self.archivo_local))


class Ejecucion(Base):
    """Registro de cada barrido, para saber si el sistema está funcionando."""
    __tablename__ = "ejecuciones"

    id_ejecucion = Column(Integer, primary_key=True, index=True)
    inicio = Column(DateTime, default=datetime.utcnow)
    fin = Column(DateTime, nullable=True)
    origen = Column(String, default="automatico")         # automatico | manual
    estado = Column(String, default="en_curso")           # en_curso | ok | con_alertas | fallida
    placas_consultadas = Column(Integer, default=0)
    consultas_ok = Column(Integer, default=0)
    consultas_error = Column(Integer, default=0)
    nuevas = Column(Integer, default=0)
    alertas = Column(Text, nullable=True)                 # Texto con los problemas detectados
