"""
Análisis del documento notificado: archivo del PDF, tipo de acto, término,
urgencia por palabras clave y resumen opcional con IA gratuita (Gemini).
"""
import os
import re
import time
import unicodedata

import pymupdf as fitz
import requests

# ---------------------------------------------------------------- Archivo de PDFs

def _directorio_archivo() -> str:
    d = os.getenv("ARCHIVO_DIR")
    if not d:
        db_path = os.getenv("DB_PATH")
        base = os.path.dirname(db_path) if db_path else os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        d = os.path.join(base, "archivo_pdfs")
    os.makedirs(d, exist_ok=True)
    return d


def archivar_pdf(id_notificacion: int, url: str, contenido: bytes) -> str:
    nombre = re.sub(r"[^A-Za-z0-9._-]+", "_", url.split("/")[-1].split("?")[0])[:120] or "documento.pdf"
    if not nombre.lower().endswith(".pdf"):
        nombre += ".pdf"
    ruta = os.path.join(_directorio_archivo(), f"{id_notificacion}_{nombre}")
    with open(ruta, "wb") as f:
        f.write(contenido)
    return ruta


# ---------------------------------------------------------------- Texto

def normalizar(texto: str) -> str:
    t = unicodedata.normalize("NFD", texto or "")
    t = "".join(c for c in t if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", t.lower())


def extraer_texto_pdf(contenido: bytes, max_paginas: int = 15) -> str:
    try:
        doc = fitz.open(stream=contenido, filetype="pdf")
        partes = [doc[i].get_text() for i in range(min(len(doc), max_paginas))]
        doc.close()
        return "\n".join(partes)
    except Exception:
        return ""


def fragmento_de_placa(texto: str, placa: str, ventana: int = 1500) -> str:
    """En boletines generales (muchas placas), quedarse solo con el texto cercano a la placa."""
    t_up = texto.upper()
    p = placa.strip().upper()
    trozos, i = [], t_up.find(p)
    while i != -1 and len(trozos) < 5:
        trozos.append(texto[max(0, i - ventana): i + ventana])
        i = t_up.find(p, i + len(p))
    return "\n...\n".join(trozos)


# ---------------------------------------------------------------- Clasificación

PALABRAS_ALTA = [
    ("caducidad", "caducidad"), ("multa", "multa"), ("sancion", "sanción"), ("so pena", "so pena"),
    ("desistimiento", "desistimiento"), ("rechaz", "rechazo"), ("terminacion", "terminación"),
    ("mandamiento de pago", "mandamiento de pago"), ("cobro coactivo", "cobro coactivo"),
    ("amparo administrativo", "amparo administrativo"), ("suspension", "suspensión"),
    ("cancelacion", "cancelación"), ("revoca", "revocatoria"),
]
PALABRAS_MEDIA = [
    ("requiere", "requerimiento"), ("requerir", "requerimiento"), ("requerimiento", "requerimiento"),
    ("termino de", "término"), ("plazo", "plazo"), ("traslado", "traslado"), ("allegar", "allegar documentos"),
    ("pagar", "pago"), ("presentar", "presentar"),
]


def detectar_tipo_acto(texto_norm: str, url: str) -> str:
    inicio = texto_norm[:800]
    if "resolucion" in inicio:
        return "Resolución"
    if re.search(r"\bauto\b", inicio):
        return "Auto"
    nombre = url.split("/")[-1].upper()
    if nombre.startswith("RES") or "RESOLUCION" in nombre:
        return "Resolución"
    if nombre.startswith("AUT"):
        return "Auto"
    if "BOLETIN" in nombre or "AVISO" in nombre:
        return "Aviso"
    return None


def detectar_termino(texto_norm: str):
    m = re.search(r"(?:termino|plazo)[^.;]{0,50}?\((\d{1,3})\)\s*dias", texto_norm)
    if not m:
        m = re.search(r"(?:termino|plazo)\s+(?:perentorio\s+)?de\s+(\d{1,3})\s+dias", texto_norm)
    if m:
        n = int(m.group(1))
        if 0 < n <= 365:
            return n
    return None


def clasificar_urgencia(texto_norm: str, fuente: str = "avisos", tipo_notificacion: str = None):
    if fuente == "coactivo":
        return "alta", "cobro coactivo"
    if tipo_notificacion and "liberaci" in tipo_notificacion.lower():
        return "baja", "liberación de área"
    if len(texto_norm.strip()) < 80:
        return "revisar", "PDF sin texto (posiblemente escaneado)"
    altas = sorted({etq for clave, etq in PALABRAS_ALTA if clave in texto_norm})
    if altas:
        return "alta", ", ".join(altas)
    medias = sorted({etq for clave, etq in PALABRAS_MEDIA if clave in texto_norm})
    if medias:
        return "media", ", ".join(medias)
    return "baja", "sin palabras de riesgo"


# ---------------------------------------------------------------- Resumen con IA gratuita (opcional)

_ultimo_llamado_ia = [0.0]


def resumir_con_ia(texto: str):
    """
    Usa la capa gratuita de Google Gemini si existe GEMINI_API_KEY. Devuelve el
    resumen o None (sin clave, sin texto o si falla: nunca detiene el barrido).
    Nota: en la capa gratuita Google puede usar los textos para mejorar sus
    productos; los actos de la ANM ya son públicos.
    """
    clave = os.getenv("GEMINI_API_KEY")
    if not clave or len(texto.strip()) < 80:
        return None
    modelo = os.getenv("GEMINI_MODEL", "gemini-flash-lite-latest")

    # Respetar el límite de solicitudes por minuto de la capa gratuita
    espera = 4.5 - (time.time() - _ultimo_llamado_ia[0])
    if espera > 0:
        time.sleep(espera)
    _ultimo_llamado_ia[0] = time.time()

    prompt = (
        "Eres asistente de un ingeniero de minas en Colombia. Resume en máximo 2 frases, en español, "
        "este acto administrativo de la Agencia Nacional de Minería: qué decide o qué le exigen al titular, "
        "y el plazo si lo menciona. Sin introducciones.\n\n" + texto[:12000]
    )
    try:
        r = requests.post(
            f"https://generativelanguage.googleapis.com/v1beta/models/{modelo}:generateContent",
            headers={"x-goog-api-key": clave, "content-type": "application/json"},
            json={"contents": [{"parts": [{"text": prompt}]}],
                  "generationConfig": {"temperature": 0.2, "maxOutputTokens": 200}},
            timeout=30,
        )
        if r.status_code != 200:
            print(f"    [IA] Gemini respondió {r.status_code}: {r.text[:200]}")
            return None
        partes = r.json()["candidates"][0]["content"]["parts"]
        return " ".join(p.get("text", "") for p in partes).strip() or None
    except Exception as e:
        print(f"    [IA] No se pudo generar resumen: {e}")
        return None
