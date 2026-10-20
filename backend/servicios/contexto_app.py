"""
Referencias compartidas del proceso (para no importar main.py desde los servicios,
lo que crearía una importación circular).
"""
scheduler = None   # BackgroundScheduler de APScheduler; lo asigna main.py al arrancar
