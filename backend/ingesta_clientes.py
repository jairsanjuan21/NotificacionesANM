import os
import sys
from sqlalchemy.exc import IntegrityError

sys.path.append(os.path.abspath(os.path.dirname(__file__)))
from database.database import SessionLocal
from database.models import Cliente

datos_crudos = """
Placa: ILB-08031 Nombre:JORGE ALDEMAR SANDOVAL PACHECO
Placa: 0070-68 Nombre: COOPERATIVA AGROMINERA BARROBLANCO
Placa: 14720 Nombre: COOPERATIVA AGROMINERA BARROBLANCO
Placa: EJ1-151 Nombre: COOPERATIVA AGROMINERA BARROBLANCO
Placa: HFS-154 Nombre: KAOLINK
Placa: 3355 Nombre: COMERCOMB SAS 
Placa: CLR-081 Nombre: EMPRECAL SAS 
Placa: GJS-141 Nombre: OLGA LUCÍA PLATA
Placa: DIJ-111 Nombre: MINA PIEDRA HERRADA SAS 
Placa: JC3-14551 Nombre: DAVID PUYANA (MIGUEL MARTÍNEZ)
Placa: JGO-11351 Nombre: ASA CONSTRUCCIONES
Placa: JKO-11051 Nombre: Miguel Martinez
Placa: KAT-08301 Nombre: Miguel Martinez
Placa: KAT-09121 Nombre: Miguel Martinez
Placa: 0039-68 Nombre: (ERVIN) ELIÉCER, SOC. EL TESORITO, SOC. EL CUATRO
Placa: 170-68 Nombre: ERVIN GELVEZ
Placa: 261-68 Nombre: OMAR LOZADA (ERVIN)
Placa: 0178-68 Nombre: LUCILA RUEDA DE PLATA
Placa: HGQ-15391 Nombre: SOC. MINERA EL PENTÁGONO
Placa: JAM-09431 Nombre: REINALDO MAYORGA (MICHEL DELVASTO)
Placa: HAN-111 Nombre: CONYSER SAS
Placa: IKG-16551X Nombre: SERINB SAS
Placa: IDQ-08551 Nombre: JORGE CHACÓN
Placa: IDQ-08552X Nombre: JORGE CHACÓN
Placa: 0299-68 Nombre: LADRILLERA CURITÍ
Placa: PLH-08141 Nombre: ERVIN GELVEZ
Placa: 0343-68 Nombre: FERMÍN GARCÉS
Placa: CGN-102 Nombre: DABEIBA NIDIA CORTÉS TEJEIRO
Placa: 0318-68 Nombre: LADRILLERA BAUTISTA CÁCERES SAS
Placa: 0056-68 Nombre: LADRILLERA BAUTISTA CÁCERES SAS
Placa: 16082 Nombre: LADRILLERA BAUTISTA CÁCERES SAS
Placa: HBL-151 Nombre: BETTY BAUTISTA CÁCERES (LADRILLERA BAUTISTA CÁCERES)
Placa: OH6-10551 Nombre: MIGUEL ARMANDO MARTINEZ RIVERA
Placa: 13922 Nombre: SOC. MINERA SAN FRANCISCO SAS
Placa: 15100 Nombre: CALIZAS DE COLOMBIA SAS
Placa: 505993 Nombre: CONSORCIO VÍAS DE COLOMBIA 066
Placa: HJD-11221X Nombre: ASFALTOS AGREGADOS Y CONSTRUCCIONES - ASA CONSTRUCCIONES SAS
Placa: 503378 Nombre: SILVIA JULIANA GUERRA RANGEL
Placa: 505753 Nombre: SERVICIOS INDUSTRIALES DE BARRANCABERMEJA LTDA
Placa: JG1-15281 Nombre: ANGEL RAMON RODRIGUEZ, ERVIN GELVEZ RODRIGUEZ
Placa: PLH-08041 Nombre: ERVIN GELVEZ RODRIGUEZ
Placa: 0-181 Nombre: ORESTE ARIAS GARCÍA
Placa: 19465 Nombre: ASOCIACIÓN DE MINEROS MINA CANGREJO
Placa: 20010 Nombre: ASOCIACIÓN DE MINEROS MINA CRISTALINA
Placa: EB-0002 Nombre: ASOCIACIÓN DE MINEROS MINA CANGREJO
Placa: SGB-12591 Nombre: CARLOS EDILSON GELVEZ RODIRGUEZ
Placa: IJN-09451 Nombre: ARCILLAS GUANENTA SAS
Placa: IJ4-16401 Nombre: ALIRIO ARDILA ORJUELA, JOSE MANUEL SAENZ RIVERA
Placa: 0057 Nombre: MINA DE ORO LA CABAÑA S.A.S.
Placa: 503488 Nombre: MIGUEL ARMANDO MARTINEZ RIVERA
Placa: ICQ-10511 Nombre: ORLY JULIÁN ORDOÑEZ
"""

def ejecutar_ingesta():
    print("Iniciando procesamiento de dataset...")
    db = SessionLocal()
    exitosos = 0
    duplicados = 0
    
    lineas = datos_crudos.strip().split('\n')
    
    for linea in lineas:
        if not linea.strip():
            continue
            
        # Parseo de cadenas basado en los separadores provistos
        partes = linea.split("Nombre:")
        placa = partes[0].replace("Placa:", "").strip().upper()
        nombre = partes[1].strip() if len(partes) > 1 else "SIN NOMBRE"
        
        nuevo_cliente = Cliente(placa=placa, nombre_empresa=nombre, activo=True)
        
        try:
            db.add(nuevo_cliente)
            db.commit()
            exitosos += 1
            print(f"  [+] Ingestado: {placa} -> {nombre}")
        except IntegrityError:
            db.rollback()
            duplicados += 1
            print(f"  [-] Omitido (Ya existe): {placa}")
            
    db.close()
    print(f"\n[OK] Pipeline de ingesta completado. {exitosos} nuevos registros en BD.")

if __name__ == "__main__":
    ejecutar_ingesta()