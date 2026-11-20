#!/usr/bin/env bash
# Respaldo diario de la base SQLite y los PDFs archivados. Conserva 14 días.
# Cron sugerido (crontab -e):  15 3 * * * /opt/apps/NotificacionesANM/deploy/respaldo.sh >> /opt/respaldos/anm/respaldo.log 2>&1
set -euo pipefail
DESTINO="${DESTINO:-/opt/respaldos/anm}"
CONTENEDOR="notificaciones-anm"
mkdir -p "$DESTINO"
archivo="$DESTINO/anm_$(date +%Y%m%d_%H%M).tar.gz"

# Copia consistente con la API de respaldo de SQLite (sirve aunque la app esté escribiendo)
docker exec "$CONTENEDOR" python -c "
import os, sqlite3
os.makedirs('/tmp/respaldo', exist_ok=True)
o = sqlite3.connect('/data/anm_notificaciones.db'); d = sqlite3.connect('/tmp/respaldo/anm_notificaciones.db')
o.backup(d); d.close(); o.close()"

docker exec "$CONTENEDOR" sh -c 'tar czf - -C /tmp/respaldo anm_notificaciones.db -C /data $( [ -d /data/archivo_pdfs ] && echo archivo_pdfs )' > "$archivo"
docker exec "$CONTENEDOR" rm -rf /tmp/respaldo

find "$DESTINO" -name 'anm_*.tar.gz' -mtime +14 -delete
echo "$(date '+%F %T') respaldo OK: $archivo ($(du -h "$archivo" | cut -f1))"
