# Routes serveur et points d'entrée

| Route | Méthode | Accès | Rôle |
|---|---|---|---|
| `/api/health` | GET | public | Vérifie la configuration (sans divulguer de secret) |
| `/api/applications/[id]/files` | POST | brouillon (jeton haché) | Dépôt d'une pièce (type MIME, taille, empreinte vérifiés) |
| `/api/applications/[id]/files/[fileId]` | GET | jeton/suivi | Lecture d'une pièce par son déposant |
| `/api/files/[fileId]` | GET | connecté | Lecture d'une pièce de son propre dossier |
| `/api/admin/files/[fileId]` | GET | agent (permission) | Pièce d'un dossier de sa commune (journalisée) |
| `/api/admin/documents/[id]/pdf` | GET | agent (permission) | PDF d'un document émis |
| `/api/admin/receipts/[id]` | GET | agent (permission) | PDF d'un reçu |
| `/api/payments/webhooks/[provider]` | POST | signature HMAC | Notification de paiement (bac à sable ; Orange/Moov refusés : non intégrés) |
| `/api/cron/sms` | GET/POST | `CRON_SECRET` | Envoi de la file SMS (fournisseur journal/bac à sable) |
| `/api/cron/payments` | GET/POST | `CRON_SECRET` | Expiration/rapprochement des paiements |
| `/api/cron/purge` | GET/POST | `CRON_SECRET` | Purge des brouillons expirés + données techniques |
| `/admin/confirm` | GET | lien d'invitation | Confirmation de compte agent |

Les actions de formulaire (soumission, suivi, administration) sont des *server actions* Next.js ; les règles métier
sont dans les fonctions SQL listées dans `DATABASE.md`. Toutes les routes `/api/admin/*` vérifient session + permission +
commune. Cron : en-tête `Authorization: Bearer $CRON_SECRET` (Vercel Cron l'ajoute automatiquement).
