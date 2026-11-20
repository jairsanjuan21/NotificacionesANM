#!/usr/bin/env bash
# Restaura un respaldo (.tar.gz del panel o de respaldo.sh) en el volumen de la app.
# Uso: ./deploy/restaurar.sh /ruta/respaldo_anm_XXXX.tar.gz
# OJO: reemplaza la base actual. Antes de restaurar se guarda una copia de seguridad de lo que haya.
set -euo pipefail
cd "$(dirname "$0")/.."
RESPALDO="$(realpath "${1:?Indique el archivo .tar.gz a restaurar}")"

echo "==> Deteniendo la app"
docker compose stop app || true

echo "==> Guardando lo que hay ahora en /data por si acaso"
docker run --rm -v anm_data:/data -v "$(dirname "$RESPALDO")":/salida alpine \
  sh -c 'cd /data && tar czf /salida/antes_de_restaurar_$(date +%Y%m%d_%H%M%S).tar.gz . 2>/dev/null || true'

echo "==> Restaurando $RESPALDO"
docker run --rm -v anm_data:/data -v "$RESPALDO":/respaldo.tar.gz:ro alpine \
  sh -c 'rm -f /data/anm_notificaciones.db /data/anm_notificaciones.db-wal /data/anm_notificaciones.db-shm \
         && tar xzf /respaldo.tar.gz -C /data && ls -la /data'

if docker image inspect notificaciones-anm:latest >/dev/null 2>&1; then
  echo "==> Arrancando la app"
  docker compose up -d app
  echo "==> Listo. Revise el panel y el aviso de arranque en el bot admin."
else
  echo "==> Datos restaurados. Primer despliegue: ejecute ./deploy/deploy.sh"
fi
