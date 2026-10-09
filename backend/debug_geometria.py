import requests
import pymupdf as fitz

url_pdf = "https://saportalanm.blob.core.windows.net/public-files/file_notificaciones_por_avisos_tablas/ESTADO 065 DE 14 DE ABRIL DE 2025.pdf"

print("Descargando PDF de prueba...")
r = requests.get(url_pdf, headers={'User-Agent': 'Mozilla/5.0'})
doc = fitz.open(stream=r.content, filetype="pdf")

# Sabemos que la placa 503378 está en la página 6 (índice 5)
pag = doc[5] 
print("\n--- BÚSQUEDA DE TEXTO ---")
rects = pag.search_for("503378")
print(f"Rectángulos encontrados para '503378': {rects}")

print("\n--- ENLACES EN LA PÁGINA 6 ---")
for i, link in enumerate(pag.get_links()):
    uri = link.get("uri", "")
    bbox = link.get("from")
    if uri and not uri.startswith("mailto:"):
        print(f"[{i}] URI: {uri}")
        print(f"    Coordenadas bbox: {bbox}")
        if rects:
            for r in rects:
                distancia_y = abs(bbox.y0 - r.y0)
                print(f"    Diferencia en Y con la placa: {distancia_y:.2f} puntos")

doc.close()