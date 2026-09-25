#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$ROOT_DIR"

COMPOSE_FILE="docker/compose.prod.yml"
COMPOSE_PROJECT="finmind"

# Docker Compose v2 (plugin "docker compose", VMs novas) ou v1 ("docker-compose",
# binário avulso da VM antiga).
if docker compose version >/dev/null 2>&1; then
  COMPOSE=(docker compose)
else
  COMPOSE=(docker-compose)
fi

echo "========================================"
echo " FinMind - Deploy"
echo "========================================"

echo "[1/6] Baixando imagens..."
"${COMPOSE[@]}" -p "$COMPOSE_PROJECT" --project-directory . -f "$COMPOSE_FILE" pull

echo "[2/6] Atualizando containers..."
"${COMPOSE[@]}" -p "$COMPOSE_PROJECT" --project-directory . -f "$COMPOSE_FILE" up -d --remove-orphans

echo "[3/6] Aguardando backend iniciar..."
sleep 10

echo "[4/6] Executando migrations..."
"${COMPOSE[@]}" -p "$COMPOSE_PROJECT" --project-directory . -f "$COMPOSE_FILE" exec -T backend npm run db:migrate

echo "[5/6] Executando seeders pendentes..."
"${COMPOSE[@]}" -p "$COMPOSE_PROJECT" --project-directory . -f "$COMPOSE_FILE" exec -T backend npm run db:seed

echo "[6/6] Limpando imagens antigas..."
docker image prune -f

echo "========================================"
echo " Deploy concluído com sucesso!"
echo "========================================"
