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

# Lista de sedes regionales requeridas
REGIONALES_DEFAULT = ['bucaramanga', 'bogota', 'cartagena', 'cucuta']

def ejecutar_scraper():
    print("Iniciando motor de extracción ANM (Multiregional + Deep Scraping)...")
    
    db: Session = SessionLocal()
    
    try:
        # 1. Obtener clientes activos
        clientes = db.query(Cliente).filter(Cliente.activo == True).all()
        
        if not clientes:
            print("[!] No hay clientes activos registrados en la base de datos.")
            return

        sesion_http = requests.Session()
        url_base = "https://www.anm.gov.co/notificaciones-por-avisos"
        nuevas_notificaciones_count = 0
        
        # Estructura en memoria para evitar fallos por duplicados en el lote actual
        urls_procesadas_lote = set()

        # 2. Iterar por cada cliente
        for cliente in clientes:
            # Obtener regional del cliente o valor por defecto
            reg_val = getattr(cliente, 'regional', None) or "bucaramanga"
            
            # Divide cadenas como "bogota,cartagena" en listas; si es "All", usa las 4
            if reg_val.lower() == "all":
                regionales_a_consultar = ['bucaramanga', 'bogota', 'cartagena', 'cucuta']
            else:
                regionales_a_consultar = [r.strip().lower() for r in reg_val.split(',') if r.strip()]

            for regional in regionales_a_consultar:
                print(f"\n-> Consultando: {cliente.placa} ({cliente.nombre_empresa}) en Regional: {regional.upper()}...")
                # ... resto de la petición a la ANM ...
                
                parametros = {
                    'field_punto_de_atencion_regional_value': regional,
                    'field_fecha_de_publicacion_o_fij_value': '',
                    'field_mes_liberacion_de_area_value': 'All',
                    'field_pla_tit_min_value': cliente.placa,
                }
                
                try:
                    respuesta = sesion_http.get(url_base, params=parametros, timeout=20)
                except requests.RequestException as e:
                    print(f"    [!] Error de red conectando con la ANM: {str(e)}")
                    continue

                if respuesta.status_code != 200:
                    print(f"    [!] Código de respuesta HTTP: {respuesta.status_code}")
                    continue

                # 3. Parsing del DOM web
                soup = BeautifulSoup(respuesta.text, 'html.parser')
                filas_notificaciones = soup.find_all('tr')
                
                for fila in filas_notificaciones:
                    td_fecha = fila.find('td', class_='views-field-field-fecha-de-publicacion-o-fij')
                    td_placa = fila.find('td', class_='views-field-field-pla-tit-min')
                    enlace_boletin_html = fila.find('a', href=True)

                    if td_fecha and td_placa and enlace_boletin_html:
                        fecha = td_fecha.text.strip()
                        url_boletin = enlace_boletin_html['href']
                        
                        nombre_archivo_boletin = url_boletin.split('/')[-1]
                        print(f"    [*] Escaneando boletín: {nombre_archivo_boletin}")
                        
                        try:
                            # 4. Deep Scraping: Descarga a RAM y escaneo de hipervínculos internos
                            respuesta_pdf = requests.get(url_boletin, timeout=25)
                            
                            if respuesta_pdf.status_code == 200:
                                doc_pdf = fitz.open(stream=respuesta_pdf.content, filetype="pdf")
                                enlaces_finales_cliente = set()
                                
                                for pagina in doc_pdf:
                                    for enlace in pagina.get_links():
                                        uri = enlace.get("uri", "")
                                        # Filtrar enlaces directos al expediente del cliente
                                        if uri and cliente.placa in uri:
                                            enlaces_finales_cliente.add(uri)
                                            
                                doc_pdf.close()
                                
                                # 5. Persistencia y control de duplicidad
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
                                        print(f"        [+] Resolución detectada: {link_final.split('/')[-1]}")
                                        
                        except Exception as e_pdf:
                            print(f"        [!] Error procesando PDF {url_boletin}: {str(e_pdf)}")

        # Confirmación de cambios en la base de datos
        db.commit()
        print(f"\n[OK] Extracción finalizada. {nuevas_notificaciones_count} novedades agregadas.")

        # 6. Despacho automático de correo solo si hay novedades reales
        if nuevas_notificaciones_count > 0:
            enviar_alertas_pendientes()

    except Exception as e:
        print(f"\n[CRITICAL] Error en el ciclo de ejecución: {str(e)}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    ejecutar_scraper()