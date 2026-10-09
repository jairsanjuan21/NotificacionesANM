import os
import sys

# 1. Configurar sys.path en la raíz de 'backend' antes de importar módulos locales
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# 2. Librerías externas
import requests
import pymupdf as fitz
from bs4 import BeautifulSoup
from sqlalchemy.orm import Session

# 3. Módulos locales del sistema
from database.database import SessionLocal
from database.models import Cliente, Notificacion
from mailer.dispatcher import enviar_alertas_pendientes

# Lista completa de las 12 sedes regionales de la ANM
REGIONALES_ANM = [
    'bogota', 'bucaramanga', 'cartagena', 'valledupar', 
    'ibague', 'pasto', 'cali', 'cucuta', 
    'manizales', 'medellin', 'nobsa', 'quibdo'
]

def ejecutar_scraper(id_cliente_especifico: int = None) -> int:
    print("Iniciando motor de extracción ANM (Multiregional + Deep Scraping)...")
    
    db: Session = SessionLocal()
    nuevas_notificaciones_count = 0
    
    try:
        # 1. Construir consulta de clientes activos (General o filtrada por ID)
        query = db.query(Cliente).filter(Cliente.activo == True)
        if id_cliente_especifico is not None:
            query = query.filter(Cliente.id_cliente == id_cliente_especifico)
            
        clientes = query.all()
        
        if not clientes:
            print("[!] No se encontraron clientes activos para procesar.")
            return 0

        sesion_http = requests.Session()
        # Cabecera User-Agent estándar para evitar bloqueos del firewall de la ANM
        sesion_http.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
        })
        
        url_base = "https://www.anm.gov.co/notificaciones-por-avisos"
        
        # Memoria temporal de ejecución para evitar colisiones de UNIQUE constraint en el mismo lote
        urls_procesadas_lote = set()

        # 2. Iterar por cada cliente seleccionado
        for cliente in clientes:
            reg_val = getattr(cliente, 'regional', None) or "bucaramanga"
            
            # Normalizar lista de sedes
            partes = [r.strip().lower() for r in reg_val.split(',') if r.strip()]
            
            # Si contiene 'all', se consulta directamente a nivel nacional (una sola vez)
            if 'all' in partes:
                regionales_a_consultar = ['All']
            else:
                regionales_a_consultar = partes

            for regional in regionales_a_consultar:
                print(f"\n-> Consultando: {cliente.placa} ({cliente.nombre_empresa}) | Regional: {regional.upper()}...")
                
                parametros = {
                    'field_punto_de_atencion_regional_value': regional,
                    'field_fecha_de_publicacion_o_fij_value': '',
                    'field_mes_liberacion_de_area_value': 'All',
                    'field_pla_tit_min_value': cliente.placa,
                }
                
                try:
                    respuesta = sesion_http.get(url_base, params=parametros, timeout=20)
                except requests.RequestException as e:
                    print(f"    [!] Error de red conectando con la ANM ({regional}): {str(e)}")
                    continue

                if respuesta.status_code != 200:
                    print(f"    [!] Respuesta HTTP inesperada ({respuesta.status_code}) en {regional}")
                    continue

                # 3. Parsing del DOM HTML devuelto por la búsqueda
                soup = BeautifulSoup(respuesta.text, 'html.parser')
                filas_notificaciones = soup.find_all('tr')
                
                for fila in filas_notificaciones:
                    td_fecha = fila.find('td', class_='views-field-field-fecha-de-publicacion-o-fij')
                    td_placa = fila.find('td', class_='views-field-field-pla-tit-min')
                    enlace_boletin_html = fila.find('a', href=True)

                    if td_fecha and td_placa and enlace_boletin_html:
                        fecha = td_fecha.text.strip()
                        url_boletin = enlace_boletin_html['href']
                        
                        # Asegurar URL absoluta si el enlace viene relativo
                        if url_boletin.startswith('/'):
                            url_boletin = f"https://www.anm.gov.co{url_boletin}"
                        
                        nombre_archivo_boletin = url_boletin.split('/')[-1]
                        print(f"    [*] Escaneando boletín: {nombre_archivo_boletin}")
                        
                        try:
                            # 4. Deep Scraping: Descarga binaria a RAM y extracción de URIs del PDF
                            respuesta_pdf = sesion_http.get(url_boletin, timeout=25)
                            
                            if respuesta_pdf.status_code == 200:
                                doc_pdf = fitz.open(stream=respuesta_pdf.content, filetype="pdf")
                                enlaces_finales_cliente = set()
                                
                                for pagina in doc_pdf:
                                    for enlace in pagina.get_links():
                                        uri = enlace.get("uri", "")
                                        # Comparación insensible a mayúsculas/minúsculas para mayor precisión
                                        if uri and cliente.placa.upper() in uri.upper():
                                            enlaces_finales_cliente.add(uri)
                                            
                                doc_pdf.close()
                                
                                # 5. Verificación de Delta e Inserción en Base de Datos
                                for link_final in enlaces_finales_cliente:
                                    if link_final in urls_procesadas_lote:
                                        continue
                                        
                                    existe = db.query(Notificacion).filter(
                                        Notificacion.url_pdf == link_final
                                    ).first()
                                    
                                    if not existe:
                                        urls_procesadas_lote.add(link_final)
                                        
                                        nueva_not = Notificacion(
                                            id_cliente=cliente.id_cliente,
                                            fecha_aviso=fecha,
                                            url_pdf=link_final,
                                            notificacion_enviada=False
                                        )
                                        db.add(nueva_not)
                                        nuevas_notificaciones_count += 1
                                        print(f"        [+] Nuevo acto administrativo: {link_final.split('/')[-1]}")
                                        
                        except Exception as e_pdf:
                            print(f"        [!] Error al analizar el PDF {nombre_archivo_boletin}: {str(e_pdf)}")

        # Confirmar transacción en SQLite
        db.commit()
        print(f"\n[OK] Proceso finalizado. {nuevas_notificaciones_count} notificaciones nuevas guardadas en BD.")

        # 6. Disparo automático de alertas por correo si hubo novedades
        if nuevas_notificaciones_count > 0:
            enviar_alertas_pendientes()

        return nuevas_notificaciones_count

    except Exception as e:
        print(f"\n[CRITICAL] Error en el motor de extracción: {str(e)}")
        db.rollback()
        raise e
    finally:
        db.close()

if __name__ == "__main__":
    ejecutar_scraper()