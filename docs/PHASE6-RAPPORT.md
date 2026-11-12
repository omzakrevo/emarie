# Phase 6 — Paiements, quittances, SMS : rapport

## Ce qui est réel, ce qui ne l'est pas
- **Aucun prestataire Mobile Money n'est intégré** (Orange Money, Moov Money : ni contrat, ni identifiants, ni documentation). Leurs adaptateurs refusent d'agir (échec fermé) et ne sont jamais proposés au citoyen.
- **Fournisseur sandbox** (mode test uniquement) : simulateur `/paiement/sandbox/<id>` qui émet un **vrai webhook signé** (HMAC-SHA256 + horodatage) vers l'endpoint de production : le chemin de vérification est le même qu'avec un prestataire réel. Paiements et quittances sandbox sont étiquetés **TEST / SANS VALEUR** et exclus des recettes.
- **Aucun fournisseur SMS n'est intégré** : le mode test n'envoie rien (statut « test », visible partout) ; en mode live sans fournisseur la file n'est pas traitée.

## Garanties (imposées par PostgreSQL, testées)
Montant calculé en base · un seul paiement actif par demande · idempotence par clé · webhooks uniques et rejouables sans effet · `PAID` seulement si prestataire+montant+référence concordent (sinon « à revoir ») · un paiement `PAID` ne repasse jamais en échec · quittance idempotente à numéro atomique · remboursement à double validation, plafonné au montant payé · résultats de paiement non forgeables par un utilisateur · isolation entre communes · journal d'audit.
SMS : une notification par événement d'historique (pas de doublon), texte sans donnée personnelle (commune + référence), file `SKIP LOCKED`, reprises à 1 min / 5 min / 30 min / 2 h puis abandon, relance manuelle.

## Interface
Citoyen : choix de l'opérateur + numéro, paiement, suivi du statut (sondage serveur), nouvelle tentative, quittance PDF (lien signé 60 s).
Agents : `/admin/paiements` (liste, réconciliation, remboursements, moyens de paiement), `/admin/sms` (modèles, file, historique, relance, traitement manuel).

## Tests
- SQL `08_payments_sms.sql` (paiements, webhooks, quittances, remboursements, droits, file SMS) ; tous les fichiers SQL passent.
- Unitaires : signature (valide, falsifiée, rejeu, secret faible), fournisseurs (échec fermé), SMS, quittance.
- Navigateur (`npm run test:e2e`) : formulaire complet, double clic = un seul paiement, échec puis nouvelle tentative avec nouvelle clé, succès, quittance. **Actions simulées en mémoire.**
- Intégration (`npm run test:integration`) : base réelle → quittance → vrai PDF (filigrane sandbox, aucune donnée personnelle).

## Non testé / limites / décisions
1. **Aucun test de bout en bout contre un vrai Supabase** (pas de projet disponible) : route webhook, actions serveur, stockage, URLs signées, cron : compilés et couverts par le contrat TS↔SQL, pas exécutés.
2. **Intégrations réelles** : Orange Money, Moov Money, SMS — impossibles sans contrats/identifiants (voir `docs/PAYMENTS.md`).
3. **Circuit financier officiel** (compte d'encaissement par commune, reversement) : à confirmer avec la mairie et les autorités.
4. Règle actuelle : une demande non payée reste `SUBMITTED` et n'est instruite qu'avec l'option « sans paiement » (paramètres) — **à garder désactivée en production**. Les demandes gratuites (tarif 0) passent directement `PAID`.
5. SMS en dioula : aucun modèle fourni (traduction à valider) ; le français est utilisé.
6. Réconciliation avec le **relevé du prestataire** : non automatisée (aucune API réelle) ; le rapport interne signale les écarts.
7. Rétention des SMS et des webhooks, purge des brouillons : à planifier (Phase 7).
