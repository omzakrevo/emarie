# Conservation des données — PROJET À VALIDER

| Donnée | Règle implémentée | Statut |
|---|---|---|
| Brouillons expirés (non déposés) | Suppression automatique (lignes + fichiers) via `/api/cron/purge` | Implémenté (délai d'expiration configurable) |
| Limitation de débit | > 2 jours | Implémenté |
| Notifications de test | > 90 jours | Implémenté |
| Webhooks rejetés (signature invalide) | > 30 jours | Implémenté |
| Dossiers déposés, pièces, documents émis, paiements, reçus, journal d'audit | **Jamais purgés automatiquement** | **Durée légale à fixer avec la mairie et les autorités** |

Les durées 90 j / 30 j / 2 j sont des choix techniques provisoires, pas des obligations légales.
