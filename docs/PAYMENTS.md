# Paiements Mobile Money — architecture et mise en service

## État réel (à lire avant toute communication)
| Élément | État |
|---|---|
| Circuit complet (initiation, webhook signé, application atomique, quittance, remboursement, réconciliation) | **Développé et testé** avec le fournisseur **sandbox** |
| **Orange Money Burkina Faso** | **NON intégré.** Aucun contrat marchand, aucun identifiant, aucune documentation officielle disponibles. L'adaptateur refuse d'initier un paiement et rejette toute notification. |
| **Moov Money Burkina Faso** | **NON intégré** (même situation). |
| Argent réel | Aucun mouvement possible tant qu'un adaptateur réel n'est pas implémenté ET testé en recette chez le prestataire. |

## Circuit
1. Le citoyen dépose sa demande (`SUBMITTED`, référence officielle). Le montant est **calculé en base** (`initiate_payment`) d'après le tarif en vigueur ; le navigateur n'envoie jamais de montant.
2. `initiate_payment` : un seul paiement actif par demande (index unique), idempotent par clé (double clic = même paiement), demande → `PAYMENT_PENDING`.
3. L'adaptateur déclenche le paiement chez le prestataire ; paiement `PENDING`. Si le prestataire est injoignable : paiement `FAILED`, demande de nouveau payable.
4. Le prestataire notifie `POST /api/payments/webhooks/<prestataire>` : corps brut → **vérification d'authenticité** (échec fermé) → enregistrement idempotent (`payment_webhooks`, unique par prestataire+événement : un rejeu est ignoré) → `apply_payment_result`.
5. `apply_payment_result` ne passe `PAID` que si **prestataire, montant et référence concordent** ; sinon le paiement reste en attente et est marqué « à revoir ». Le retour navigateur ne valide jamais rien.
6. `PAID` → demande `PAID` → quittance PDF (numéro atomique `PREFIXE-RC-ANNÉE-000001`) → SMS « paiement reçu » (file d'attente).
7. Réconciliation : `/admin/paiements` (totaux par moyen/statut, paiements en attente > 30 min, à revoir, sans quittance, remboursements en attente) ; tâche `/api/cron/payments` régénère les quittances manquantes.
8. Remboursement : demande → décision par **une autre personne** → exécution chez l'opérateur puis enregistrement (référence obligatoire). Jamais seul.

## Recettes séparées par commune
Chaque paiement porte `municipality_id` ; RLS et fonctions isolent les communes. Les **identifiants marchands** doivent être distincts par commune (compte d'encaissement de la mairie) : ils ne sont **pas** stockés en base mais dans le gestionnaire de secrets du serveur, avec une rotation périodique. **Le circuit financier officiel (compte, reversement au Trésor/receveur) doit être confirmé par la mairie et les autorités compétentes** avant toute mise en production.
Les paiements sandbox sont **exclus** de tous les totaux de recettes.

## Intégrer un prestataire réel (checklist)
1. Obtenir le contrat marchand, la documentation API, l'environnement de recette et le mécanisme de signature des notifications.
2. Implémenter `initiate` et `verifyWebhook` de l'adaptateur dans `src/server/payments/providers.ts` (interface `PaymentProvider`) ; `verifyWebhook` doit **rejeter par défaut**.
3. Écrire les tests (signatures valides/falsifiées/rejouées, montants discordants, statuts inconnus) avec les exemples de la documentation officielle.
4. Recette complète chez le prestataire (succès, échec, annulation, expiration, rejeu, doublon).
5. Positionner `PAYMENT_MODE=live`, renseigner les secrets, activer le moyen dans `/admin/paiements` (impossible tant que l'adaptateur déclare ne pas être disponible).
6. Réconciliation quotidienne avec le relevé du prestataire (rapprochement des références).

## Variables d'environnement
`PAYMENT_MODE` (`sandbox`|`live`), `SANDBOX_WEBHOOK_SECRET` (≥ 32 car., sandbox), `CRON_SECRET` (≥ 32 car.), `SMS_MODE` (`test`|`live`), `CHROMIUM_EXECUTABLE_PATH`.
Planification (exemples) : appeler `POST /api/cron/sms` toutes les minutes et `POST /api/cron/payments` toutes les 10 minutes avec `Authorization: Bearer $CRON_SECRET`.
