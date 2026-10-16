"""Procesa una notificación: archiva el PDF, lo analiza y calcula sus plazos."""
import os
import requests

from servicios import analizador, plazos

MAX_IA_POR_BARRIDO = int(os.getenv("GEMINI_MAX_POR_BARRIDO", "25"))


def _es_boletin_general(url: str) -> bool:
    u = url.lower()
    return "notificaciones_por_avisos_tablas" in u or "boletin" in u.split("/")[-1]


def texto_de_notificacion(notif, sesion_http=None) -> str:
    """Texto del PDF de la notificación: usa la copia archivada o lo descarga y archiva."""
    placa = notif.cliente.placa if notif.cliente else ""
    contenido = None
    if notif.archivo_local and os.path.exists(notif.archivo_local):
        with open(notif.archivo_local, "rb") as f:
            contenido = f.read()
    else:
        r = (sesion_http or requests.Session()).get(notif.url_pdf, timeout=30)
        if r.status_code != 200 or r.content[:4] != b"%PDF":
            raise Exception(f"No se pudo descargar el PDF de la ANM (HTTP {r.status_code}).")
        contenido = r.content
        notif.archivo_local = analizador.archivar_pdf(notif.id_notificacion, notif.url_pdf, contenido)
    texto = analizador.extraer_texto_pdf(contenido)
    if _es_boletin_general(notif.url_pdf) and placa:
        texto = analizador.fragmento_de_placa(texto, placa) or texto
    return texto


def procesar_notificacion(notif, sesion_http=None, cache_pdfs=None, usar_ia=True, contador_ia=None) -> None:
    """Modifica `notif` en memoria; quien llama hace el commit. Nunca lanza excepción."""
    sesion_http = sesion_http or requests.Session()
    cache_pdfs = cache_pdfs if cache_pdfs is not None else {}
    placa = notif.cliente.placa if notif.cliente else ""

    texto = ""
    try:
        contenido = cache_pdfs.get(notif.url_pdf)
        if contenido is None:
            r = sesion_http.get(notif.url_pdf, timeout=30)
            contenido = r.content if r.status_code == 200 else b""
            cache_pdfs[notif.url_pdf] = contenido
        if contenido and contenido[:4] == b"%PDF":
            notif.archivo_local = analizador.archivar_pdf(notif.id_notificacion, notif.url_pdf, contenido)
            texto = analizador.extraer_texto_pdf(contenido)
            if _es_boletin_general(notif.url_pdf) and placa:
                texto = analizador.fragmento_de_placa(texto, placa) or texto
    except Exception as e:
        print(f"        [!] No se pudo descargar/archivar {notif.url_pdf.split('/')[-1]}: {e}")

    texto_norm = analizador.normalizar(texto)
    notif.tipo_acto = analizador.detectar_tipo_acto(texto_norm, notif.url_pdf) or notif.tipo_acto
    notif.termino_dias = analizador.detectar_termino(texto_norm)
    notif.urgencia, notif.motivo_urgencia = analizador.clasificar_urgencia(
        texto_norm, notif.fuente or "avisos", notif.tipo_notificacion)

    notif.fecha_surtida, notif.fecha_limite, notif.base_plazo = plazos.calcular_plazos(
        notif.fecha_aviso, notif.tipo_notificacion, notif.fuente or "avisos", notif.termino_dias)

    if usar_ia and texto and (contador_ia is None or contador_ia[0] < MAX_IA_POR_BARRIDO):
        resumen = analizador.resumir_con_ia(texto)
        if resumen:
            notif.resumen = resumen
            if contador_ia is not None:
                contador_ia[0] += 1
        elif contador_ia is not None and len(texto.strip()) >= 80:
            # Gemini falló (saturado o sin cupo): no seguir intentando en este barrido para no
            # demorarlo; estas notificaciones se pueden resumir después con el botón del panel.
            print("    [IA] Se omiten los resúmenes restantes de este barrido.")
            contador_ia[0] = MAX_IA_POR_BARRIDO

    notif.procesada = True
