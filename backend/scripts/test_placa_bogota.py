import os
import sys

# 1. Configurar sys.path en la raíz de 'backend'
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

REGIONALES_ANM = [
    'bogota', 'bucaramanga', 'cartagena', 'valledupar', 
    'ibague', 'pasto', 'cali', 'cucuta', 
    'manizales', 'medellin', 'nobsa', 'quibdo'
]

def extraer_enlaces_de_placa_en_pdf(doc_pdf, placa: str) -> set:
    """
    Extrae enlaces que contengan la placa en la URL O que estén ubicados
    en la misma fila horizontal (coordenadas Y) donde aparece el texto de la placa.
    """
    enlaces_encontrados = set()
    placa_limpia = placa.strip().upper()

    for num_pag, pagina in enumerate(doc_pdf):
        # 1. Obtener los rectángulos donde aparece la placa en el texto
        rects_texto = pagina.search_for(placa_limpia)
        
        # 2. Revisar los enlaces interactivos de la página
        links = pagina.get_links()
        for link in links:
            uri = link.get("uri", "").strip()
            if not uri or uri.startswith("mailto:"):
                continue

            # Caso A: La URL contiene explícitamente el código de la placa
            if placa_limpia in uri.upper():
                enlaces_encontrados.add(uri)
                continue

            # Caso B: Coincidencia espacial por fila (Especial Bogotá / VSC)
            # Verificamos si el enlace está en la misma franja vertical (Y) que la placa
            rect_link = link.get("from")  # Rectángulo del enlace en el PDF
            if rect_link and rects_texto:
                for r_txt in rects_texto:
                    # Tolerancia de fila: 18 puntos arriba o abajo
                    misma_fila = abs(rect_link.y0 - r_txt.y0) < 18 or abs(rect_link.y1 - r_txt.y1) < 18
                    if misma_fila:
                        enlaces_encontrados.add(uri)
                        break

    return enlaces_encontrados


def ejecutar_scraper(id_cliente_especifico: int = None) -> int:
    print("Iniciando motor de extracción ANM (Multiregional + Deep Scraping Avanzado)...")
    
    db: Session = SessionLocal()
    nuevas_notificaciones_count = 0
    
    try:
        query = db.query(Cliente).filter(Cliente.activo == True)
        if id_cliente_especifico is not None:
            query = query.filter(Cliente.id_cliente == id_cliente_especifico)
            
        clientes = query.all()
        
        if not clientes:
            print("[!] No hay clientes activos para procesar.")
            return 0

        sesion_http = requests.Session()
        sesion_http.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
        })
        
        url_base = "https://www.anm.gov.co/notificaciones-por-avisos"
        urls_procesadas_lote = set()

        for cliente in clientes:
            reg_val = getattr(cliente, 'regional', None) or "bucaramanga"
            
            # Normalizar regiones evitando repetir 'all'
            partes = [r.strip().lower() for r in reg_val.split(',') if r.strip()]
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
                    print(f"    [!] Error de red con la ANM ({regional}): {str(e)}")
                    continue

                if respuesta.status_code != 200:
                    print(f"    [!] HTTP {respuesta.status_code} en {regional}")
                    continue

                soup = BeautifulSoup(respuesta.text, 'html.parser')
                filas = soup.find_all('tr')
                
                for fila in filas:
                    td_fecha = fila.find('td', class_='views-field-field-fecha-de-publicacion-o-fij')
                    td_placa = fila.find('td', class_='views-field-field-pla-tit-min')
                    enlace_boletin_html = fila.find('a', href=True)

                    if td_fecha and td_placa and enlace_boletin_html:
                        fecha = td_fecha.text.strip()
                        url_boletin = enlace_boletin_html['href']
                        if url_boletin.startswith('/'):
                            url_boletin = f"https://www.anm.gov.co{url_boletin}"
                        
                        nombre_archivo = url_boletin.split('/')[-1]
                        print(f"    [*] Escaneando boletín: {nombre_archivo}")
                        
                        try:
                            res_pdf = sesion_http.get(url_boletin, timeout=25)
                            enlaces_finales = set()
                            
                            if res_pdf.status_code == 200:
                                doc_pdf = fitz.open(stream=res_pdf.content, filetype="pdf")
                                enlaces_finales = extraer_enlaces_de_placa_en_pdf(doc_pdf, cliente.placa)
                                doc_pdf.close()
                                
                            # Si no se extrajeron enlaces internos, usamos el boletín como respaldo
                            if not enlaces_finales:
                                enlaces_finales = {url_boletin}

                            # Guardar en base de datos evitando duplicados
                            for link_final in enlaces_finales:
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
                                    print(f"        [+] Resolución vinculada: {link_final.split('/')[-1]}")

                        except Exception as e_pdf:
                            print(f"        [!] Error analizando {nombre_archivo}: {str(e_pdf)}")

        db.commit()
        print(f"\n[OK] Extracción finalizada. {nuevas_notificaciones_count} notificaciones nuevas registradas.")

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