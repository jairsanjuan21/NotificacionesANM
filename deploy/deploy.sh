#!/usr/bin/env bash
# Despliega la última versión de main en el VPS.
# Uso (en el VPS, dentro del repo):  ./deploy/deploy.sh
# GitHub Actions lo ejecuta por SSH en cada push a main.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> Trayendo cambios de GitHub"
git fetch --quiet origin main
git reset --quiet --hard origin/main      # el .env no está en git: no se toca

export APP_COMMIT_SHA="$(git rev-parse HEAD)"
export APP_COMMIT_MESSAGE="$(git log -1 --pretty=%s)"
echo "==> Versión ${APP_COMMIT_SHA:0:7}: ${APP_COMMIT_MESSAGE}"

echo "==> Construyendo imagen"
docker compose build --pull app

echo "==> Reiniciando contenedor"
docker compose up -d --remove-orphans app

echo "==> Esperando a que la app responda"
for i in $(seq 1 30); do
  estado="$(docker inspect -f '{{.State.Health.Status}}' notificaciones-anm 2>/dev/null || echo desconocido)"
  if [ "$estado" = "healthy" ]; then
    echo "==> OK: la app está sana"
    docker image prune -f >/dev/null
    exit 0
  fi
  sleep 5
done

echo "!!  La app no quedó sana en 150 s. Últimos logs:"
docker compose logs --tail 80 app
exit 1
