# Déploiement sur VPS (Ubuntu/Debian) — remplace Vercel

L'agent n'a pas pu se connecter au VPS (réseau sortant restreint, pas de client SSH) : l'installation se fait par un
script unique, exécuté **par vous** sur le VPS.

## Prérequis
- VPS Ubuntu 22.04/24.04 ou Debian 12, ≥ 2 Go de RAM (build + Chromium), accès root/sudo.
- DNS : `A` de `DOMAIN` et de `niankorodougou.DOMAIN` vers l'IP du VPS.
- Clé **service_role** Supabase (tableau de bord) ; clé publique anon et URL (déjà connues).

## Installation
```bash
git clone https://github.com/omzakrevo/emarie.git /tmp/emarie   # dépôt privé : utilisez un token, ou copiez deploy/vps-install.sh par scp
sudo DOMAIN=mairie.votredomaine.bf EMAIL=vous@votredomaine.bf bash /tmp/emarie/deploy/vps-install.sh
```
Le script : installe Node 22/Nginx/Certbot, pare-feu (SSH, 80, 443), crée l'utilisateur `emairie`, génère une **clé de déploiement** (à ajouter sur GitHub en lecture seule),
demande les secrets (saisie masquée) et génère les 3 secrets aléatoires dans `/etc/emairie.env` (600), build, service systemd, Nginx + HTTPS, crons système, contrôle `/api/health`.

## Mise à jour / exploitation
- Mettre à jour : relancer le script (les secrets existants sont conservés).
- Logs : `journalctl -u emairie -f` ; état : `systemctl status emairie`.
- Après installation : Supabase → Authentication → URL : ajouter `https://DOMAIN/admin/confirm` ; créer le 1er administrateur (`DEPLOYMENT.md` §1.5) ; activer `sandbox` (§1.6).
- Contrôles : `/api/health`, `/`, parcours invité, génération d'un SPÉCIMEN (PDF via Chromium embarqué : **non testé sur ce VPS**).
- Sauvegardes : la base est chez Supabase ; sauvegarder aussi `/etc/emairie.env` (hors dépôt).
- Wildcard `*.DOMAIN` (autres mairies) : certificat par DNS-01 à prévoir au moment d'ajouter une commune.
Toujours `PAYMENT_MODE=sandbox`, `SMS_MODE=test`, modèles SPÉCIMEN.
