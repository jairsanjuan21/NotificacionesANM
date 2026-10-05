from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

# Importes relativos asumiendo ejecución desde la raíz del backend
from database import models, database
from api import schemas

router = APIRouter()

@router.post("/clientes", response_model=schemas.ClienteResponse)
def crear_cliente(cliente: schemas.ClienteCreate, db: Session = Depends(database.get_db)):
    # Validar que la placa no exista ya en el sistema
    db_cliente = db.query(models.Cliente).filter(models.Cliente.placa == cliente.placa).first()
    if db_cliente:
        raise HTTPException(status_code=400, detail="La placa ya está registrada en el sistema.")
    
    nuevo_cliente = models.Cliente(
        placa=cliente.placa, 
        nombre_empresa=cliente.nombre_empresa, 
        activo=cliente.activo
    )
    db.add(nuevo_cliente)
    db.commit()
    db.refresh(nuevo_cliente)
    return nuevo_cliente

@router.get("/clientes", response_model=List[schemas.ClienteResponse])
def obtener_clientes(db: Session = Depends(database.get_db)):
    # Retorna todos los clientes registrados
    return db.query(models.Cliente).all()

@router.get("/notificaciones", response_model=List[schemas.NotificacionResponse])
def obtener_notificaciones(db: Session = Depends(database.get_db)):
    # Retorna las notificaciones ordenadas desde la más reciente
    return db.query(models.Notificacion).order_by(models.Notificacion.fecha_registro.desc()).all()