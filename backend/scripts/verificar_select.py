import requests
from bs4 import BeautifulSoup

url = "https://www.anm.gov.co/notificaciones-por-avisos"
r = requests.get(url, headers={'User-Agent': 'Mozilla/5.0'})
soup = BeautifulSoup(r.text, 'html.parser')

select = soup.find('select', {'name': 'field_punto_de_atencion_regional_value'})
if select:
    print("\n--- VALORES REALES DEL SELECT EN LA ANM ---")
    for opt in select.find_all('option'):
        val = opt.get('value')
        texto = opt.text.strip()
        print(f"Value: '{val}'  --->  Texto visible: '{texto}'")
else:
    print("No se encontró el select con ese nombre.")