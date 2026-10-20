import os
import re
import threading
import traceback
from datetime import datetime

import pymupdf as fitz
import requests
from bs4 import BeautifulSoup
from sqlalchemy.orm import Session

from database.database import SessionLocal
from database.models import Cliente, Notificacion, Ejecucion
from mailer.dispatcher import enviar_alertas_pendientes, enviar_alerta_sistema
from servicios.analizador import normalizar
from servicios.plazos import normalizar_fecha_iso, parsear_fecha
from servicios.procesamiento import procesar_notificacion

REGIONALES_ANM = [
    'bogota', 'bucaramanga', 'cartagena', 'valledupar',
    'ibague', 'pasto', 'cali', 'cucuta',
    'manizales', 'medellin', 'nobsa', 'quibdo'
]

URL_BASE = "https://www.anm.gov.co/notificaciones-por-avisos"
URL_COACTIVO = "https://www.anm.gov.co/avisos-cobro-coactivo"
# Notificaciones publicadas antes de esta fecha se guardan, pero NO se envían por correo
# (evita alertas de actos antiguos ya resueltos, por ejemplo al agregar una placa nueva).
FECHA_MINIMA_ALERTAS = os.getenv("FECHA_MINIMA_ALERTAS", "2025-06-01")
FUENTE_COACTIVO_ACTIVA = os.getenv("FUENTE_COACTIVO", "true").lower() in ("1", "true", "si", "sí")

# Evita dos barridos al mismo tiempo (cron + botón manual), que duplicarían registros
LOCK_BARRIDO = threading.Lock()


class BarridoEnCurso(Exception):
    pass


# ======================================================================= Utilidades HTML

def _texto(el) -> str:
    return re.sub(r"\s+", " ", el.get_text(" ", strip=True)) if el else ""


def leer_tablas(soup):
    """Convierte cada fila de cada tabla en dict {encabezado_normalizado: celda}."""
    filas = []
    for tabla in soup.find_all("table"):
        encabezados = [normalizar(_texto(th)) for th in tabla.find_all("th")]
        cuerpo = tabla.find("tbody") or tabla
        for tr in cuerpo.find_all("tr"):
            celdas = tr.find_all("td")
            if not celdas:
                continue
            fila = {"_tr": tr}
            for i, td in enumerate(celdas):
                clave = encabezados[i] if i < len(encabezados) else f"col{i}"
                fila[clave] = td
            filas.append(fila)
    return filas


def _celda(fila: dict, *claves):
    """Busca la celda cuyo encabezado contenga alguna de las claves."""
    for k, v in fila.items():
        if k.startswith("_"):
            continue
        if any(c in k for c in claves):
            return v
    return None


def _solo_alnum(t: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", (t or "").upper())


def descubrir_formulario(html: str) -> dict:
    """
    Encuentra los nombres reales de los campos de un formulario de filtros de Drupal
    leyendo sus etiquetas (así no hay que adivinar los nombres de los campos).
    """
    soup = BeautifulSoup(html, "html.parser")
    form = soup.find("form", id=re.compile("views-exposed-form")) or soup.find("form", attrs={"method": re.compile("get", re.I)})
    if not form:
        return {}
    campos = {}
    for label in form.find_all("label"):
        destino = label.get("for")
        entrada = form.find(id=destino) if destino else None
        if entrada and entrada.get("name"):
            campos[normalizar(_texto(label))] = entrada["name"]
    return campos


# ======================================================================= PDF: enlace exacto de la placa

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
        if placa_limpia not in pagina.get_text().upper():
            continue

        enlaces_validos = []
        match_por_url = False
        for link in pagina.get_links():
            uri = link.get("uri", "").strip()
            if not uri or uri.startswith("mailto:"):
                continue
            enlaces_validos.append(link)
            if placa_limpia in uri.upper():
                enlaces_encontrados.add(uri)
                match_por_url = True
        if match_por_url:
            continue

        for r_txt in pagina.search_for(placa_limpia):
            centro_y_placa = (r_txt.y0 + r_txt.y1) / 2.0
            mejor_uri, menor_distancia_y = None, 9999.0
            for link in enlaces_validos:
                rect_link = link.get("from")
                if not rect_link:
                    continue
                distancia_y = abs((rect_link.y0 + rect_link.y1) / 2.0 - centro_y_placa)
                if distancia_y < menor_distancia_y and distancia_y <= 8.5:
                    menor_distancia_y, mejor_uri = distancia_y, link.get("uri", "").strip()
            if mejor_uri:
                enlaces_encontrados.add(mejor_uri)

    return enlaces_encontrados


# ======================================================================= Estado del barrido

class Contexto:
    def __init__(self, db: Session):
        self.db = db
        self.sesion = requests.Session()
        self.sesion.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
        })
        self.cache_pdfs = {}
        self.claves_lote = set()
        self.nuevas = []
        self.consultas_ok = 0
        self.consultas_error = 0
        self.alertas = []
        self.errores_detalle = []

    def registrar_nueva(self, cliente, url, fecha, fuente, tipo=None, numero=None):
        clave = f"{cliente.id_cliente}_{url}"
        if clave in self.claves_lote:
            return
        existe = self.db.query(Notificacion).filter(
            Notificacion.id_cliente == cliente.id_cliente, Notificacion.url_pdf == url).first()
        self.claves_lote.add(clave)
        if existe:
            return
        fecha_iso = normalizar_fecha_iso(fecha)
        minima = parsear_fecha(FECHA_MINIMA_ALERTAS)
        es_antigua = bool(minima and parsear_fecha(fecha_iso) and parsear_fecha(fecha_iso) < minima)
        n = Notificacion(id_cliente=cliente.id_cliente, fecha_aviso=fecha_iso, url_pdf=url,
                         notificacion_enviada=es_antigua, fuente=fuente, tipo_notificacion=tipo or None,
                         numero=numero or None, estado="nueva")
        n.cliente = cliente
        self.db.add(n)
        self.nuevas.append(n)
        print(f"        [+] Nueva ({fuente}): {url.split('/')[-1]}")

    def get(self, url, **kw):
        try:
            r = self.sesion.get(url, timeout=kw.pop("timeout", 20), **kw)
        except requests.RequestException as e:
            self.consultas_error += 1
            self.errores_detalle.append(f"Red: {url.split('?')[0]} → {e}")
            return None
        if r.status_code != 200:
            self.consultas_error += 1
            self.errores_detalle.append(f"HTTP {r.status_code}: {url.split('?')[0]}")
            return None
        self.consultas_ok += 1
        return r


# ======================================================================= Fuente 1: notificaciones por aviso

def consultar_avisos(ctx: Contexto, cliente: Cliente):
    reg_val = getattr(cliente, 'regional', None) or "bucaramanga"
    partes = [r.strip().lower() for r in reg_val.split(',') if r.strip()]
    regionales = ['All'] if 'all' in partes else partes

    for regional in regionales:
        print(f"\n-> Avisos: {cliente.placa} ({cliente.nombre_empresa}) | Regional: {regional.upper()}...")
        r = ctx.get(URL_BASE, params={
            'field_punto_de_atencion_regional_value': regional,
            'field_fecha_de_publicacion_o_fij_value': '',
            'field_mes_liberacion_de_area_value': 'All',
            'field_pla_tit_min_value': cliente.placa,
        })
        if r is None:
            continue

        if "field_pla_tit_min" not in r.text:
            ctx.alertas.append("La página de avisos de la ANM ya no tiene el filtro de placa esperado: "
                               "es posible que el portal haya cambiado y el scraper necesite ajuste.")
            continue

        soup = BeautifulSoup(r.text, 'html.parser')
        for fila in leer_tablas(soup):
            tr = fila["_tr"]
            td_fecha = tr.find('td', class_='views-field-field-fecha-de-publicacion-o-fij') or _celda(fila, "fecha")
            td_placa = tr.find('td', class_='views-field-field-pla-tit-min') or _celda(fila, "placa")
            enlace = tr.find('a', href=True)
            if not (td_fecha and td_placa and enlace):
                continue

            tipo = _texto(_celda(fila, "tipo") or tr.find('td', class_=re.compile("tipo")))
            numero = _texto(_celda(fila, "numero", "número") or tr.find('td', class_=re.compile("numero|num")))
            fecha = _texto(td_fecha)
            url_boletin = enlace['href']
            if url_boletin.startswith('/'):
                url_boletin = f"https://www.anm.gov.co{url_boletin}"
            print(f"    [*] Boletín: {url_boletin.split('/')[-1]} | {tipo or 'sin tipo'}")

            try:
                if url_boletin not in ctx.cache_pdfs:
                    rp = ctx.get(url_boletin, timeout=30)
                    ctx.cache_pdfs[url_boletin] = rp.content if rp is not None else None
                contenido = ctx.cache_pdfs[url_boletin]
                enlaces = set()
                if contenido and contenido[:4] == b"%PDF":
                    doc = fitz.open(stream=contenido, filetype="pdf")
                    enlaces = extraer_enlaces_de_placa_en_pdf(doc, cliente.placa)
                    doc.close()
                if not enlaces:
                    enlaces = {url_boletin}  # PDF escaneado: se guarda el boletín general
                for url in enlaces:
                    ctx.registrar_nueva(cliente, url, fecha, "avisos", tipo, numero)
            except Exception as e:
                ctx.errores_detalle.append(f"PDF {url_boletin.split('/')[-1]}: {e}")


# ======================================================================= Fuente 2: avisos de cobro coactivo

def consultar_coactivo(ctx: Contexto, clientes, campos: dict):
    campo_palabra = next((v for k, v in campos.items() if "palabra" in k or "clave" in k), None)
    campo_nit = next((v for k, v in campos.items() if "nit" in k), None)
    if not campo_palabra:
        ctx.alertas.append("No se encontró el campo 'Palabra clave' en la página de cobro coactivo de la ANM: "
                           "es posible que el portal haya cambiado.")
        return

    for cliente in clientes:
        busquedas = [(campo_palabra, cliente.placa)]
        if cliente.nit and campo_nit:
            busquedas.append((campo_nit, re.sub(r"\D", "", cliente.nit)))
        for campo, valor in busquedas:
            if not valor:
                continue
            print(f"\n-> Cobro coactivo: {cliente.placa} | {campo}={valor}")
            r = ctx.get(URL_COACTIVO, params={campo: valor})
            if r is None:
                continue
            soup = BeautifulSoup(r.text, "html.parser")
            for fila in leer_tablas(soup):
                tr = fila["_tr"]
                td_titulo = _celda(fila, "titulo")
                td_nit = _celda(fila, "nit")
                coincide_placa = td_titulo and _solo_alnum(cliente.placa) and _solo_alnum(cliente.placa) in _solo_alnum(_texto(td_titulo))
                coincide_nit = (cliente.nit and td_nit and re.sub(r"\D", "", cliente.nit)
                                and re.sub(r"\D", "", cliente.nit) == re.sub(r"\D", "", _texto(td_nit)))
                if not (coincide_placa or coincide_nit):
                    continue
                enlace = tr.find("a", href=True)
                if not enlace:
                    continue
                url = enlace["href"]
                if url.startswith("/"):
                    url = f"https://www.anm.gov.co{url}"
                fecha = _texto(_celda(fila, "fecha"))
                numero = " / ".join(x for x in [_texto(_celda(fila, "aviso")), _texto(_celda(fila, "proceso"))] if x)
                ctx.registrar_nueva(cliente, url, fecha, "coactivo", "Aviso cobro coactivo", numero)


# ======================================================================= Barrido principal

def _reservar_barrido(origen: str, esperar: bool, id_cliente: int = None) -> int:
    """
    Toma el candado y registra la ejecución como 'en_curso'. Devuelve su id.
    Separado del trabajo pesado para que la API pueda responder de inmediato con el id.
    Quien llame queda a cargo de ejecutar `_ejecutar_barrido`, que es quien libera el candado.
    """
    if not LOCK_BARRIDO.acquire(blocking=esperar, timeout=1800 if esperar else -1):
        raise BarridoEnCurso("Ya hay un barrido en curso. Intente de nuevo en unos minutos.")
    db: Session = SessionLocal()
    try:
        ejec = Ejecucion(inicio=datetime.utcnow(), origen=origen, estado="en_curso", id_cliente=id_cliente)
        db.add(ejec)
        db.commit()
        return ejec.id_ejecucion
    except Exception:
        LOCK_BARRIDO.release()
        raise
    finally:
        db.close()


def _ejecutar_barrido(id_ejecucion: int, id_cliente_especifico: int = None) -> int:
    """Hace el barrido de una ejecución ya reservada. Siempre libera el candado al terminar."""
    print("Iniciando motor de extracción ANM (Avisos + Cobro coactivo)...")
    db: Session = SessionLocal()
    ejec = db.get(Ejecucion, id_ejecucion)
    ctx = Contexto(db)

    try:
        query = db.query(Cliente).filter(Cliente.activo == True)
        if id_cliente_especifico is not None:
            query = query.filter(Cliente.id_cliente == id_cliente_especifico)
        clientes = query.all()
        ejec.placas_consultadas = len(clientes)

        if not clientes:
            print("[!] No se encontraron clientes activos para procesar.")
            return 0

        for cliente in clientes:
            consultar_avisos(ctx, cliente)

        if FUENTE_COACTIVO_ACTIVA:
            r = ctx.get(URL_COACTIVO)
            if r is not None:
                consultar_coactivo(ctx, clientes, descubrir_formulario(r.text))

        # Archivar, analizar y calcular plazos de lo nuevo
        db.flush()  # asigna id a las notificaciones nuevas
        contador_ia = [0]
        for n in ctx.nuevas:
            procesar_notificacion(n, ctx.sesion, ctx.cache_pdfs, usar_ia=True, contador_ia=contador_ia)
        db.commit()
        print(f"\n[OK] Proceso finalizado. {len(ctx.nuevas)} notificaciones nuevas guardadas en BD.")

        # Siempre intentar despachar: también salen las que quedaron pendientes antes
        resultado = enviar_alertas_pendientes(db)
        print(f"[DISPATCHER] Resultado: {resultado}")
        if resultado.get("error"):
            ctx.alertas.append(f"No se pudo enviar el correo de notificaciones: {resultado['error']}")

        total = ctx.consultas_ok + ctx.consultas_error
        if ctx.consultas_error and ctx.consultas_error >= max(3, total * 0.5):
            ctx.alertas.append(f"{ctx.consultas_error} de {total} consultas a la ANM fallaron "
                               "(el portal puede estar caído o bloqueando las consultas).")
        return len(ctx.nuevas)

    except Exception as e:
        print(f"\n[CRITICAL] Error en el motor de extracción: {e}")
        db.rollback()
        ctx.alertas.append(f"El barrido falló: {e}\n{traceback.format_exc()[-1500:]}")
        ejec.estado = "fallida"
        raise
    finally:
        try:
            alertas_unicas = list(dict.fromkeys(ctx.alertas))
            ejec.fin = datetime.utcnow()
            ejec.consultas_ok, ejec.consultas_error = ctx.consultas_ok, ctx.consultas_error
            ejec.nuevas = len(ctx.nuevas) if ejec.estado != "fallida" else 0
            detalle = alertas_unicas + (["Errores puntuales:"] + ctx.errores_detalle[:15] if ctx.errores_detalle else [])
            ejec.alertas = "\n".join(detalle) or None
            if ejec.estado != "fallida":
                ejec.estado = "con_alertas" if alertas_unicas else "ok"
            db.commit()
            if alertas_unicas:
                enviar_alerta_sistema("Problemas en el barrido de la ANM", "\n\n".join(alertas_unicas))
        except Exception as e_fin:
            print(f"[!] No se pudo registrar la ejecución: {e_fin}")
        finally:
            db.close()
            LOCK_BARRIDO.release()


def ejecutar_scraper(id_cliente_especifico: int = None, origen: str = "manual", esperar: bool = False) -> int:
    """
    Barrido SÍNCRONO (lo usa el cron). Devuelve el número de notificaciones nuevas.
    Si `esperar` es False y hay otro barrido en curso, lanza BarridoEnCurso.
    """
    id_ejecucion = _reservar_barrido(origen, esperar, id_cliente_especifico)
    return _ejecutar_barrido(id_ejecucion, id_cliente_especifico)


def iniciar_barrido_en_segundo_plano(id_cliente_especifico: int = None, origen: str = "manual") -> int:
    """
    Barrido ASÍNCRONO (lo usa el botón del panel). Reserva la ejecución, lanza el
    trabajo en un hilo y devuelve el id de inmediato para que el cliente consulte el avance.
    """
    id_ejecucion = _reservar_barrido(origen, esperar=False, id_cliente=id_cliente_especifico)

    def tarea():
        try:
            _ejecutar_barrido(id_ejecucion, id_cliente_especifico)
        except Exception as e:
            # El error ya quedó registrado en la ejecución; aquí solo evitamos que el hilo muera en silencio
            print(f"[BARRIDO {id_ejecucion}] Terminó con error: {e}")

    try:
        threading.Thread(target=tarea, daemon=True, name=f"barrido-{id_ejecucion}").start()
    except Exception:
        # Si el hilo ni siquiera arrancó, no dejar el candado tomado ni la ejecución colgada
        _marcar_fallida(id_ejecucion, "No se pudo iniciar el hilo del barrido.")
        LOCK_BARRIDO.release()
        raise
    return id_ejecucion


def barrido_en_curso():
    """Devuelve la ejecución que está corriendo ahora (o None)."""
    db: Session = SessionLocal()
    try:
        return (db.query(Ejecucion).filter(Ejecucion.estado == "en_curso")
                .order_by(Ejecucion.inicio.desc()).first())
    finally:
        db.close()


def _marcar_fallida(id_ejecucion: int, motivo: str):
    db: Session = SessionLocal()
    try:
        ejec = db.get(Ejecucion, id_ejecucion)
        if ejec:
            ejec.estado, ejec.fin, ejec.alertas = "fallida", datetime.utcnow(), motivo
            db.commit()
    finally:
        db.close()


def cerrar_barridos_huerfanos() -> int:
    """
    Al arrancar el servidor no puede haber ningún barrido corriendo: si quedó alguno
    'en_curso' es porque un reinicio o deploy lo cortó a la mitad. Se marca como fallido.
    """
    db: Session = SessionLocal()
    try:
        huerfanos = db.query(Ejecucion).filter(Ejecucion.estado == "en_curso").all()
        for e in huerfanos:
            e.estado, e.fin = "fallida", e.fin or datetime.utcnow()
            e.alertas = "Interrumpido: el servidor se reinició mientras el barrido estaba en curso."
        db.commit()
        return len(huerfanos)
    finally:
        db.close()


# ======================================================================= Procesar el histórico

def procesar_historico(limite: int = 500, usar_ia: bool = False) -> dict:
    """Archiva, analiza y calcula plazos de notificaciones antiguas aún no procesadas (por lotes)."""
    procesadas, sesion, cache = 0, requests.Session(), {}
    while procesadas < limite:
        with LOCK_BARRIDO:
            db = SessionLocal()
            try:
                lote = (db.query(Notificacion).filter((Notificacion.procesada == False) | (Notificacion.procesada == None))
                        .order_by(Notificacion.id_notificacion.desc()).limit(min(20, limite - procesadas)).all())
                if not lote:
                    break
                for n in lote:
                    procesar_notificacion(n, sesion, cache, usar_ia=usar_ia)
                    n.procesada = True
                db.commit()
                procesadas += len(lote)
                cache.clear()
            finally:
                db.close()
        print(f"[HISTÓRICO] {procesadas} notificaciones procesadas...")
    return {"procesadas": procesadas}


if __name__ == "__main__":
    ejecutar_scraper()
