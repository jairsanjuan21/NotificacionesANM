import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_DB_PATH = os.path.join(BASE_DIR, "anm_notificaciones.db")

SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{DEFAULT_DB_PATH}")

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

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
    Extrae con precisión quirúrgica únicamente el enlace que pertenece a la fila exacta de la placa:
    1. Si la URL contiene el código de la placa directamente, lo agrega.
    2. Si la URL no tiene el nombre de la placa (ej. Bogotá AUT-210-7585), busca el enlace
       cuyo centroide vertical (Y) esté alineado con la fila de la placa (Vecino más cercano).
    """
    enlaces_encontrados = set()
    placa_limpia = placa.strip().upper()

    for pagina in doc_pdf:
        texto_pagina = pagina.get_text()
        if placa_limpia not in texto_pagina.upper():
            continue

        links = pagina.get_links()
        enlaces_validos = []

        # Paso A: Revisar si algún link ya incluye el código de la placa en su URL
        match_por_url = False
        for link in links:
            uri = link.get("uri", "").strip()
            if not uri or uri.startswith("mailto:"):
                continue
            enlaces_validos.append(link)
            if placa_limpia in uri.upper():
                enlaces_encontrados.add(uri)
                match_por_url = True

        # Si ya encontramos el enlace por nombre directo en la URL en esta página, pasamos a la siguiente
        if match_por_url:
            continue

        # Paso B: Alineación exacta por Centroide Vertical (Para tablas de Bogotá / VSC / GCM)
        rects_placa = pagina.search_for(placa_limpia)
        for r_txt in rects_placa:
            centro_y_placa = (r_txt.y0 + r_txt.y1) / 2.0
            mejor_uri = None
            menor_distancia_y = 9999.0

            for link in enlaces_validos:
                rect_link = link.get("from")
                if not rect_link:
                    continue
                
                centro_y_link = (rect_link.y0 + rect_link.y1) / 2.0
                distancia_y = abs(centro_y_link - centro_y_placa)

                # En la misma fila de una tabla, la diferencia entre centros Y es menor a 8 puntos
                if distancia_y < menor_distancia_y and distancia_y <= 8.5:
                    menor_distancia_y = distancia_y
                    mejor_uri = link.get("uri", "").strip()

            if mejor_uri:
                enlaces_encontrados.add(mejor_uri)

    return enlaces_encontrados


def ejecutar_scraper(id_cliente_especifico: int = None) -> int:
    print("Iniciando motor de extracción ANM (Multiregional + Precisión por Fila)...")
    
    db: Session = SessionLocal()
    nuevas_notificaciones_count = 0
    
    try:
        query = db.query(Cliente).filter(Cliente.activo == True)
        if id_cliente_especifico is not None:
            query = query.filter(Cliente.id_cliente == id_cliente_especifico)
            
        clientes = query.all()
        
        if not clientes:
            print("[!] No se encontraron clientes activos para procesar.")
            return 0

        sesion_http = requests.Session()
        sesion_http.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
        })
        
        url_base = "https://www.anm.gov.co/notificaciones-por-avisos"
        urls_procesadas_lote = set()

        for cliente in clientes:
            reg_val = getattr(cliente, 'regional', None) or "bucaramanga"
            
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
                    print(f"    [!] Error de red conectando con la ANM ({regional}): {str(e)}")
                    continue

                if respuesta.status_code != 200:
                    print(f"    [!] Respuesta HTTP inesperada ({respuesta.status_code}) en {regional}")
                    continue

                soup = BeautifulSoup(respuesta.text, 'html.parser')
                filas_notificaciones = soup.find_all('tr')
                
                for fila in filas_notificaciones:
                    td_fecha = fila.find('td', class_='views-field-field-fecha-de-publicacion-o-fij')
                    td_placa = fila.find('td', class_='views-field-field-pla-tit-min')
                    enlace_boletin_html = fila.find('a', href=True)

                    if td_fecha and td_placa and enlace_boletin_html:
                        fecha = td_fecha.text.strip()
                        url_boletin = enlace_boletin_html['href']
                        
                        if url_boletin.startswith('/'):
                            url_boletin = f"https://www.anm.gov.co{url_boletin}"
                        
                        nombre_archivo_boletin = url_boletin.split('/')[-1]
                        print(f"    [*] Escaneando boletín: {nombre_archivo_boletin}")
                        
                        try:
                            respuesta_pdf = sesion_http.get(url_boletin, timeout=25)
                            enlaces_finales_cliente = set()
                            
                            if respuesta_pdf.status_code == 200:
                                doc_pdf = fitz.open(stream=respuesta_pdf.content, filetype="pdf")
                                enlaces_finales_cliente = extraer_enlaces_de_placa_en_pdf(doc_pdf, cliente.placa)
                                doc_pdf.close()
                            
                            # Si el boletín es un PDF escaneado sin hipervínculos internos, guardar el boletín general
                            if not enlaces_finales_cliente:
                                enlaces_finales_cliente = {url_boletin}
                                
                            for link_final in enlaces_finales_cliente:
                                clave_unica = f"{cliente.id_cliente}_{link_final}"
                                if clave_unica in urls_procesadas_lote:
                                    continue
                                    
                                existe = db.query(Notificacion).filter(
                                    Notificacion.id_cliente == cliente.id_cliente,
                                    Notificacion.url_pdf == link_final
                                ).first()
                                
                                if not existe:
                                    urls_procesadas_lote.add(clave_unica)
                                    
                                    nueva_not = Notificacion(
                                        id_cliente=cliente.id_cliente,
                                        fecha_aviso=fecha,
                                        url_pdf=link_final,
                                        notificacion_enviada=False
                                    )
                                    db.add(nueva_not)
                                    nuevas_notificaciones_count += 1
                                    print(f"        [+] Resolución exacta vinculada: {link_final.split('/')[-1]}")
                                        
                        except Exception as e_pdf:
                            print(f"        [!] Error al analizar el PDF {nombre_archivo_boletin}: {str(e_pdf)}")

        db.commit()
        print(f"\n[OK] Proceso finalizado. {nuevas_notificaciones_count} notificaciones nuevas guardadas en BD.")

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