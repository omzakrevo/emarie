#!/usr/bin/env bash
# Exécuté à chaque démarrage du Codespace : lance l'application sur le port 3000.
cd "$(dirname "$0")/.."
pkill -f "next start" 2>/dev/null || true
nohup npm run start -- -p 3000 > /tmp/emairie.log 2>&1 &
echo "E-MAIRIE démarre sur le port 3000 (journal : /tmp/emairie.log)"
