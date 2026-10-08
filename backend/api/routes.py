from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional

from database import database, models
from api import schemas
from scraper.anm_scraper import ejecutar_scraper

router = APIRouter()

# --- 1. OBTENER TODOS LOS CLIENTES ---
@router.get("/clientes", response_model=List[schemas.ClienteResponse])
def obtener_clientes(db: Session = Depends(database.get_db)):
    return db.query(models.Cliente).order_by(models.Cliente.placa.asc()).all()

# --- 2. CREAR NUEVA PLACA ---
@router.post("/clientes", response_model=schemas.ClienteResponse)
def crear_cliente(cliente: schemas.ClienteCreate, db: Session = Depends(database.get_db)):
    placa_limpia = cliente.placa.strip().upper()
    existe = db.query(models.Cliente).filter(models.Cliente.placa == placa_limpia).first()
    if existe:
        raise HTTPException(status_code=400, detail=f"La placa {placa_limpia} ya está registrada.")
    
    nuevo = models.Cliente(
        placa=placa_limpia,
        nombre_empresa=cliente.nombre_empresa.strip() if cliente.nombre_empresa else "SIN NOMBRE",
        regional=cliente.regional.lower().strip() if cliente.regional else "bucaramanga",
        activo=cliente.activo
    )
    db.add(nuevo)
    db.commit()
    db.refresh(nuevo)
    return nuevo

# --- 3. ACTUALIZAR PLACA, NOMBRE O REGIÓN ---
@router.put("/clientes/{id_cliente}", response_model=schemas.ClienteResponse)
def actualizar_cliente(id_cliente: int, datos: schemas.ClienteUpdate, db: Session = Depends(database.get_db)):
    cliente = db.query(models.Cliente).filter(models.Cliente.id_cliente == id_cliente).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado.")

    if datos.placa is not None:
        nueva_placa = datos.placa.strip().upper()
        if nueva_placa != cliente.placa:
            conflicto = db.query(models.Cliente).filter(models.Cliente.placa == nueva_placa).first()
            if conflicto:
                raise HTTPException(status_code=400, detail="Otra placa ya tiene ese código.")
            cliente.placa = nueva_placa

    if datos.nombre_empresa is not None:
        cliente.nombre_empresa = datos.nombre_empresa.strip()
    if datos.regional is not None:
        cliente.regional = datos.regional.lower().strip()
    if datos.activo is not None:
        cliente.activo = datos.activo

    db.commit()
    db.refresh(cliente)
    return cliente

# --- 4. ELIMINAR PLACA ---
@router.delete("/clientes/{id_cliente}")
def eliminar_cliente(id_cliente: int, db: Session = Depends(database.get_db)):
    cliente = db.query(models.Cliente).filter(models.Cliente.id_cliente == id_cliente).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado.")
    
    # Eliminar notificaciones asociadas primero para mantener integridad referencial
    db.query(models.Notificacion).filter(models.Notificacion.id_cliente == id_cliente).delete()
    db.delete(cliente)
    db.commit()
    return {"mensaje": f"Placa {cliente.placa} y su historial eliminados correctamente."}

# --- 5. OBTENER NOTIFICACIONES ---
@router.get("/notificaciones", response_model=List[schemas.NotificacionResponse])
def obtener_notificaciones(db: Session = Depends(database.get_db)):
    return db.query(models.Notificacion).order_by(models.Notificacion.id_notificacion.desc()).all()

# --- 6. DISPARAR SCRAPER (GENERAL O POR PLACA) ---
@router.post("/scraper/ejecutar")
def disparar_scraper(id_cliente: Optional[int] = None):
    try:
        nuevas = ejecutar_scraper(id_cliente_especifico=id_cliente)
        return {
            "estado": "completado",
            "nuevas_notificaciones": nuevas or 0
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Fallo en el scraper: {str(e)}")