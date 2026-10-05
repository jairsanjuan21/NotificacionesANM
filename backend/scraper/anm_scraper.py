import os
import sys
import requests
import fitz  # PyMuPDF
from bs4 import BeautifulSoup
from sqlalchemy.orm import Session
from mailer.dispatcher import enviar_alertas_pendientes

# Ajuste de ruta para importar módulos desde la raíz de 'backend'
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database.database import SessionLocal
from database.models import Cliente, Notificacion

def ejecutar_scraper():
    print("Iniciando motor de extracción ANM (Deep Scraping con PyMuPDF)...")
    
    # Abrir sesión con la base de datos
    db: Session = SessionLocal()
    
    try:
        # 1. Obtener solo los clientes activos
        clientes = db.query(Cliente).filter(Cliente.activo == True).all()
        
        if not clientes:
            print("No hay clientes activos registrados en la base de datos.")
            return

        # Inicializar agente de peticiones
        sesion_http = requests.Session()
        url_base = "https://www.anm.gov.co/notificaciones-por-avisos"
        nuevas_notificaciones_count = 0
        
        # MEMORIA TEMPORAL: Previene fallos de UNIQUE constraint (Spam Bomb)
        urls_procesadas_lote = set()

        # 2. Ciclo de iteración por cada cliente
        for cliente in clientes:
            print(f"\n-> Consultando placa: {cliente.placa}...")
            
            parametros = {
                'field_punto_de_atencion_regional_value': 'bucaramanga',
                'field_fecha_de_publicacion_o_fij_value': '',
                'field_mes_liberacion_de_area_value': 'All',
                'field_pla_tit_min_value': cliente.placa,
            }
            
            respuesta = sesion_http.get(url_base, params=parametros)
            
            if respuesta.status_code != 200:
                print(f"Error de red con placa {cliente.placa}. HTTP: {respuesta.status_code}")
                continue

            # 3. Transformación (Parsing del DOM)
            soup = BeautifulSoup(respuesta.text, 'html.parser')
            filas_notificaciones = soup.find_all('tr')
            
            for fila in filas_notificaciones:
                td_fecha = fila.find('td', class_='views-field-field-fecha-de-publicacion-o-fij')
                td_placa = fila.find('td', class_='views-field-field-pla-tit-min')
                enlace_boletin_html = fila.find('a', href=True)

                if td_fecha and td_placa and enlace_boletin_html:
                    fecha = td_fecha.text.strip()
                    url_boletin = enlace_boletin_html['href']
                    
                    print(f"  [*] Escaneando boletín: {url_boletin.split('/')[-1]}")
                    
                    try:
                        # 4. DEEP SCRAPING: Lectura binaria del documento PDF
                        respuesta_pdf = requests.get(url_boletin, timeout=15)
                        
                        if respuesta_pdf.status_code == 200:
                            # Abrir el PDF directamente en RAM
                            documento_pdf = fitz.open(stream=respuesta_pdf.content, filetype="pdf")
                            enlaces_finales_cliente = set()
                            
                            # Recorrer páginas y extraer URIs
                            for pagina in documento_pdf:
                                for enlace in pagina.get_links():
                                    uri = enlace.get("uri", "")
                                    # Coincidencia exacta: Filtrar solo links de la placa actual
                                    if uri and cliente.placa in uri:
                                        enlaces_finales_cliente.add(uri)
                                        
                            documento_pdf.close()
                            
                            # 5. Cálculo del Delta e Inserción
                            for link_final in enlaces_finales_cliente:
                                # Filtro Nivel 1: Memoria en tiempo de ejecución
                                if link_final in urls_procesadas_lote:
                                    continue
                                    
                                # Filtro Nivel 2: Verificación en Base de Datos
                                existe = db.query(Notificacion).filter(Notificacion.url_pdf == link_final).first()
                                
                                if not existe:
                                    urls_procesadas_lote.add(link_final)
                                    
                                    nueva_not = Notificacion(
                                        id_cliente=cliente.id_cliente,
                                        fecha_aviso=fecha,      # Hereda la fecha del boletín padre
                                        url_pdf=link_final,     # Guarda el link directo al acto administrativo
                                        notificacion_enviada=False
                                    )
                                    db.add(nueva_not)
                                    nuevas_notificaciones_count += 1
                                    print(f"      [+] Nuevo acto administrativo registrado: {link_final}")
                                    
                    except Exception as e_pdf:
                        print(f"      [!] Fallo al procesar el PDF {url_boletin}: {str(e_pdf)}")

# Confirmar la transacción (Commit)
        db.commit()
        print(f"\n[OK] Proceso finalizado. {nuevas_notificaciones_count} notificaciones nuevas guardadas en BD.")
        
        # Acoplamiento del módulo de mensajería
        if nuevas_notificaciones_count > 0:
            enviar_alertas_pendientes()

    except Exception as e:
        print(f"[CRITICAL] Error en el ciclo principal: {str(e)}")
        db.rollback() 
    finally:
        db.close()

if __name__ == "__main__":
    ejecutar_scraper()