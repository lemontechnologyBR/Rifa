#!/bin/sh
set -e

mkdir -p /app/database /app/public/uploads/rifas

echo "[docker] Aplicando schema do banco..."
npx prisma db push --skip-generate

if [ "$RUN_SEED" = "true" ]; then
  echo "[docker] Executando seed (RUN_SEED=true)..."
  node database/seed.js
else
  echo "[docker] Seed ignorado. Use RUN_SEED=true apenas na primeira subida ou ambiente demo."
fi

if [ "$NODE_ENV" = "production" ]; then
  case "$SESSION_SECRET" in
    ""|altere-em-producao|altere-esta-chave-em-producao|rifas-dev-secret-change-me)
      echo "[docker] ERRO: defina SESSION_SECRET forte no .env antes do deploy."
      exit 1
      ;;
  esac
  case "$APP_URL" in
    http://localhost:*|https://localhost:*|""|http://127.0.0.1:*)
      echo "[docker] AVISO: APP_URL ainda aponta para localhost. Use o domínio HTTPS real."
      ;;
  esac
fi

echo "[docker] Iniciando VouRifar..."
exec node app.js
