import requests
import pymupdf as fitz
from bs4 import BeautifulSoup
from sqlalchemy.orm import Session

from database.database import SessionLocal
from database.models import Cliente, Notificacion
from mailer.dispatcher import enviar_alertas_pendientes

REGIONALES_ANM = [
    'bogota', 'bucaramanga', 'cartagena', 'valledupar',
    'ibague', 'pasto', 'cali', 'cucuta',
    'manizales', 'medellin', 'nobsa', 'quibdo'
]

URL_BASE = "https://www.anm.gov.co/notificaciones-por-avisos"


def extraer_enlaces_de_placa_en_pdf(doc_pdf, placa: str) -> set:
    """
    Extrae únicamente el enlace que pertenece a la fila exacta de la placa:
    1. Si la URL contiene el código de la placa directamente, lo agrega.
    2. Si no (ej. Bogotá AUT-210-7585), toma el enlace cuyo centro vertical (Y)
       esté alineado con la fila de la placa.
    """
    enlaces_encontrados = set()
    placa_limpia = placa.strip().upper()

    for pagina in doc_pdf:
        texto_pagina = pagina.get_text()
        if placa_limpia not in texto_pagina.upper():
            continue

        links = pagina.get_links()
        enlaces_validos = []

        # Paso A: ¿algún link ya incluye la placa en su URL?
        match_por_url = False
        for link in links:
            uri = link.get("uri", "").strip()
            if not uri or uri.startswith("mailto:"):
                continue
            enlaces_validos.append(link)
            if placa_limpia in uri.upper():
                enlaces_encontrados.add(uri)
                match_por_url = True

        if match_por_url:
            continue

        # Paso B: alineación por centro vertical (tablas de Bogotá / VSC / GCM)
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

        urls_procesadas_lote = set()
        # Cache de PDFs por URL: el mismo boletín se descarga una sola vez por barrido
        cache_pdfs = {}

        for cliente in clientes:
            reg_val = getattr(cliente, 'regional', None) or "bucaramanga"
            partes = [r.strip().lower() for r in reg_val.split(',') if r.strip()]
            regionales_a_consultar = ['All'] if 'all' in partes else partes

            for regional in regionales_a_consultar:
                print(f"\n-> Consultando: {cliente.placa} ({cliente.nombre_empresa}) | Regional: {regional.upper()}...")

                parametros = {
                    'field_punto_de_atencion_regional_value': regional,
                    'field_fecha_de_publicacion_o_fij_value': '',
                    'field_mes_liberacion_de_area_value': 'All',
                    'field_pla_tit_min_value': cliente.placa,
                }

                try:
                    respuesta = sesion_http.get(URL_BASE, params=parametros, timeout=20)
                except requests.RequestException as e:
                    print(f"    [!] Error de red conectando con la ANM ({regional}): {str(e)}")
                    continue

                if respuesta.status_code != 200:
                    print(f"    [!] Respuesta HTTP inesperada ({respuesta.status_code}) en {regional}")
                    continue

                soup = BeautifulSoup(respuesta.text, 'html.parser')

                for fila in soup.find_all('tr'):
                    td_fecha = fila.find('td', class_='views-field-field-fecha-de-publicacion-o-fij')
                    td_placa = fila.find('td', class_='views-field-field-pla-tit-min')
                    enlace_boletin_html = fila.find('a', href=True)

                    if not (td_fecha and td_placa and enlace_boletin_html):
                        continue

                    fecha = td_fecha.text.strip()
                    url_boletin = enlace_boletin_html['href']
                    if url_boletin.startswith('/'):
                        url_boletin = f"https://www.anm.gov.co{url_boletin}"

                    nombre_archivo_boletin = url_boletin.split('/')[-1]
                    print(f"    [*] Escaneando boletín: {nombre_archivo_boletin}")

                    try:
                        if url_boletin not in cache_pdfs:
                            respuesta_pdf = sesion_http.get(url_boletin, timeout=25)
                            cache_pdfs[url_boletin] = respuesta_pdf.content if respuesta_pdf.status_code == 200 else None

                        contenido_pdf = cache_pdfs[url_boletin]
                        enlaces_finales_cliente = set()
                        if contenido_pdf:
                            doc_pdf = fitz.open(stream=contenido_pdf, filetype="pdf")
                            enlaces_finales_cliente = extraer_enlaces_de_placa_en_pdf(doc_pdf, cliente.placa)
                            doc_pdf.close()

                        # PDF escaneado sin hipervínculos: guardar el boletín general
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
                                db.add(Notificacion(
                                    id_cliente=cliente.id_cliente,
                                    fecha_aviso=fecha,
                                    url_pdf=link_final,
                                    notificacion_enviada=False
                                ))
                                nuevas_notificaciones_count += 1
                                print(f"        [+] Resolución exacta vinculada: {link_final.split('/')[-1]}")

                    except Exception as e_pdf:
                        print(f"        [!] Error al analizar el PDF {nombre_archivo_boletin}: {str(e_pdf)}")

        db.commit()
        print(f"\n[OK] Proceso finalizado. {nuevas_notificaciones_count} notificaciones nuevas guardadas en BD.")

        # Siempre intentar despachar: así también salen las que quedaron
        # pendientes por un fallo de correo en un barrido anterior.
        resultado = enviar_alertas_pendientes(db)
        print(f"[DISPATCHER] Resultado: {resultado}")

        return nuevas_notificaciones_count

    except Exception as e:
        print(f"\n[CRITICAL] Error en el motor de extracción: {str(e)}")
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    ejecutar_scraper()
