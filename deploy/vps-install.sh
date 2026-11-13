#!/usr/bin/env bash
# Installation / mise à jour d'E-MAIRIE sur un VPS Ubuntu/Debian (à lancer en root ou sudo, sur le VPS).
# Usage : sudo DOMAIN=mairie.exemple.bf EMAIL=vous@exemple.bf bash deploy/vps-install.sh
# Idempotent : relancer = mise à jour. Les secrets sont saisis ici, jamais écrits dans le dépôt.
set -euo pipefail
: "${DOMAIN:?DOMAIN requis (ex. mairie.exemple.bf)}"; : "${EMAIL:?EMAIL requis pour le certificat}"
REPO="${REPO:-git@github.com:omzakrevo/emarie.git}"; BRANCH="${BRANCH:-main}"
APP=emairie; DIR=/opt/emairie; ENVF=/etc/emairie.env; PORT=3000
[ "$(id -u)" = 0 ] || { echo "Lancer en root (sudo)"; exit 1; }

echo "== Paquets"
apt-get update -qq
apt-get install -y -qq curl git ca-certificates gnupg nginx certbot python3-certbot-nginx ufw \
  libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libgbm1 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libpango-1.0-0 libasound2t64 fonts-dejavu-core 2>/dev/null \
  || apt-get install -y -qq libasound2 fonts-dejavu-core
if ! command -v node >/dev/null || [ "$(node -v | cut -d. -f1 | tr -d v)" -lt 22 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - ; apt-get install -y -qq nodejs
fi

echo "== Utilisateur et pare-feu"
id $APP >/dev/null 2>&1 || useradd --system --create-home --home-dir /home/$APP --shell /bin/bash $APP
ufw allow OpenSSH >/dev/null; ufw allow 'Nginx Full' >/dev/null; ufw --force enable >/dev/null

echo "== Clé de déploiement GitHub (lecture seule)"
KEY=/home/$APP/.ssh/id_ed25519
if [ ! -f $KEY ]; then
  sudo -u $APP mkdir -p /home/$APP/.ssh; sudo -u $APP ssh-keygen -t ed25519 -N "" -C "emairie-vps-deploy" -f $KEY -q
  ssh-keyscan github.com 2>/dev/null >> /home/$APP/.ssh/known_hosts; chown $APP /home/$APP/.ssh/known_hosts
fi
if ! sudo -u $APP git ls-remote "$REPO" >/dev/null 2>&1; then
  echo; echo "Ajoutez cette clé sur GitHub : dépôt > Settings > Deploy keys > Add (SANS accès en écriture) :"; cat $KEY.pub
  read -r -p "Appuyez sur Entrée une fois ajoutée…" _
fi

echo "== Secrets (/etc/emairie.env, droits 600)"
if [ ! -f $ENVF ]; then
  ask(){ local v; read -r -p "$1: " v; echo "$v"; }
  asks(){ local v; read -r -s -p "$1: " v; echo >&2; echo "$v"; }
  SUPA_URL=$(ask "NEXT_PUBLIC_SUPABASE_URL (https://cvvsophhludwjldesqbu.supabase.co)")
  SUPA_ANON=$(ask "NEXT_PUBLIC_SUPABASE_ANON_KEY (clé publique anon)")
  SERVICE=$(asks "SUPABASE_SERVICE_ROLE_KEY (saisie masquée)")
  umask 077
  cat > $ENVF <<ENV
NEXT_PUBLIC_SUPABASE_URL=$SUPA_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=$SUPA_ANON
SUPABASE_SERVICE_ROLE_KEY=$SERVICE
NEXT_PUBLIC_ROOT_DOMAIN=$DOMAIN
NEXT_PUBLIC_DEFAULT_MUNICIPALITY=niankorodougou
TRACKING_SECRET_PEPPER=$(openssl rand -base64 48)
CRON_SECRET=$(openssl rand -base64 48)
SANDBOX_WEBHOOK_SECRET=$(openssl rand -base64 48)
PAYMENT_MODE=sandbox
SMS_MODE=test
PDF_CHROMIUM=sparticuz
REQUIRE_AGENT_MFA=0
NODE_ENV=production
PORT=$PORT
ENV
  chmod 600 $ENVF; chown root:$APP $ENVF; chmod 640 $ENVF
fi

echo "== Code, build"
[ -d $DIR/.git ] || { mkdir -p $DIR; chown $APP $DIR; sudo -u $APP git clone -b "$BRANCH" "$REPO" $DIR; }
sudo -u $APP git -C $DIR fetch origin "$BRANCH" && sudo -u $APP git -C $DIR reset --hard "origin/$BRANCH"
sudo -u $APP bash -c "cd $DIR && set -a && . $ENVF && set +a && npm ci && npm run build"

echo "== Service systemd"
cat > /etc/systemd/system/$APP.service <<UNIT
[Unit]
Description=E-MAIRIE
After=network.target
[Service]
User=$APP
WorkingDirectory=$DIR
EnvironmentFile=$ENVF
ExecStart=/usr/bin/npm run start -- -p $PORT -H 127.0.0.1
Restart=always
RestartSec=3
NoNewPrivileges=true
[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload; systemctl enable --now $APP; systemctl restart $APP

echo "== Nginx"
cat > /etc/nginx/sites-available/$APP <<NG
server {
  listen 80; server_name $DOMAIN niankorodougou.$DOMAIN;
  client_max_body_size 12m;
  location / {
    proxy_pass http://127.0.0.1:$PORT;
    proxy_set_header Host \$host; proxy_set_header X-Forwarded-For \$remote_addr; proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_read_timeout 90s;
  }
}
NG
ln -sf /etc/nginx/sites-available/$APP /etc/nginx/sites-enabled/$APP; rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
certbot --nginx --non-interactive --agree-tos -m "$EMAIL" --redirect -d "$DOMAIN" -d "niankorodougou.$DOMAIN" || echo "Certbot a échoué : vérifiez que le DNS de $DOMAIN et niankorodougou.$DOMAIN pointe vers ce serveur."

echo "== Tâches planifiées (remplacent les crons Vercel)"
cat > /usr/local/bin/emairie-cron <<'CR'
#!/usr/bin/env bash
set -a; . /etc/emairie.env; set +a
curl -fsS -m 120 -H "Authorization: Bearer $CRON_SECRET" "http://127.0.0.1:$PORT/api/cron/$1" >/dev/null || logger -t emairie-cron "échec $1"
CR
chmod 750 /usr/local/bin/emairie-cron; chown root:$APP /usr/local/bin/emairie-cron
cat > /etc/cron.d/emairie <<'CRON'
* * * * *    emairie /usr/local/bin/emairie-cron sms
*/10 * * * * emairie /usr/local/bin/emairie-cron payments
17 3 * * *   emairie /usr/local/bin/emairie-cron purge
CRON

echo "== Contrôle"; sleep 3
curl -fsS http://127.0.0.1:$PORT/api/health && echo || { journalctl -u $APP -n 30 --no-pager; exit 1; }
echo "OK. Mise à jour ultérieure : relancer ce script (mêmes variables)."
