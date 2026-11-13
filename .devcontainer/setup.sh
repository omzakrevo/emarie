#!/usr/bin/env bash
# Exécuté une fois à la création du Codespace : dépendances système, npm ci, secrets manquants, build.
set -euo pipefail
cd "$(dirname "$0")/.."
sudo apt-get update -qq
sudo apt-get install -y -qq libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libgbm1 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libpango-1.0-0 libasound2 fonts-dejavu-core || true
npm ci
# Secrets techniques non fournis par Codespaces : générés une fois, conservés dans .env.local (ignoré par git)
touch .env.local; chmod 600 .env.local
gen(){ if [ -z "${!1:-}" ] && ! grep -q "^$1=" .env.local; then echo "$1=$(openssl rand -base64 48)" >> .env.local; fi; }
gen TRACKING_SECRET_PEPPER; gen CRON_SECRET; gen SANDBOX_WEBHOOK_SECRET
if [ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]; then
  echo "ATTENTION : le secret Codespaces SUPABASE_SERVICE_ROLE_KEY est absent. Ajoutez-le (GitHub > Settings > Codespaces > Secrets, accès au dépôt emarie) puis reconstruisez le Codespace."
fi
npm run build
