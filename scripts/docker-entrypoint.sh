#!/bin/sh
set -e

mkdir -p /app/database /app/public/uploads/rifas

echo "[docker] Aplicando schema do banco..."
# --accept-data-loss: necessário ao remover colunas legadas (ex.: Mercado Pago OAuth).
# Backup do volume SQLite deve ser feito ANTES do deploy na VPS.
npx prisma db push --skip-generate --accept-data-loss

if [ "$RUN_SEED" = "true" ]; then
  echo "[docker] Executando seed (RUN_SEED=true)..."
  node database/seed.js
else
  echo "[docker] Seed ignorado. Use RUN_SEED=true apenas na primeira subida ou ambiente demo."
fi

if [ "$NODE_ENV" = "production" ]; then
  case "$SESSION_SECRET" in
    ""|altere-em-producao|altere-esta-chave-em-producao|rifas-dev-secret-change-me|ALTERE_PARA_UMA_CHAVE_ALEATORIA_LONGA_32_CHARS)
      echo "[docker] ERRO: defina SESSION_SECRET forte no .env antes do deploy."
      exit 1
      ;;
  esac
  case "$APP_URL" in
    http://localhost:*|https://localhost:*|""|http://127.0.0.1:*)
      echo "[docker] AVISO: APP_URL ainda aponta para localhost. Use o domínio HTTPS real."
      ;;
  esac
  if [ "$WOOVI_ENABLED" != "true" ] || [ -z "$WOOVI_APP_ID" ]; then
    echo "[docker] AVISO: Woovi não configurado (WOOVI_ENABLED/WOOVI_APP_ID). PIX ficará indisponível."
  fi
fi

echo "[docker] Iniciando VouRifar..."
exec node app.js
