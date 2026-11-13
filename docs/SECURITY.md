# Sécurité — E-MAIRIE

## Mesures en place (vérifiées par des tests)
- **Isolation des communes** : `municipality_id` partout, clés composites, RLS sur 35 tables, tests SQL croisés.
- **Aucun secret exposé** : `SUPABASE_SERVICE_ROLE_KEY` uniquement côté serveur ; jeton de brouillon/suivi hachés (HMAC + pepper).
- **Stockage privé** : aucune pièce d'état civil en bucket public ; accès par route serveur avec contrôle.
- **Règles en base** (fonctions SECURITY DEFINER) : on ne peut pas sauter une étape ; un extrait de naissance n'est jamais
  délivré sans vérification au registre ; un spécimen ne peut pas être remis ; remboursement à 4 yeux ; tarifs historisés.
- **Paiements** : webhooks signés HMAC (tolérance 5 min), idempotence, 1 paiement actif par dossier, Orange/Moov **fermés par défaut**.
- **Limitation de débit** : formulaires publics, suivi, connexion agent (20/15 min par IP, 5/15 min par e-mail), message d'erreur générique.
- **Journal d'audit** : actions agents, changements de configuration, **consultation de chaque dossier**.
- **PDF** : rendu Chromium JavaScript désactivé et réseau bloqué ; contenu échappé.
- **En-têtes HTTP** de sécurité (next.config.ts). Dépendances : `npm audit` = 0 vulnérabilité (prod).
- **Accessibilité/robustesse** : axe-core 0 problème sur 40 contrôles.
- **MFA agents (TOTP)** : implémentée, désactivée par défaut (`REQUIRE_AGENT_MFA=1`). **Non testée contre un vrai Supabase Auth.**

## Limites connues (à traiter avant production)
1. **CSP** non mise en place (nécessite des nonces) — à ajouter.
2. **Aucun test de bout en bout contre Supabase réel** (Auth/Storage/PostgREST) : seulement base PostgreSQL + doublure d'auth.
3. `workflow.skip_payment` doit rester **désactivé** en production.
4. Secrets Vercel à saisir par l'administrateur : `SUPABASE_SERVICE_ROLE_KEY`, `TRACKING_SECRET_PEPPER`, `CRON_SECRET`, `SANDBOX_WEBHOOK_SECRET` (retirer le bac à sable en production réelle).
5. Dépôt GitHub à passer en **privé** ; protection de branche et revue obligatoire recommandées.
6. Audit de sécurité externe / test d'intrusion recommandé avant le lancement public.
7. Premier administrateur : procédure SQL de `docs/DEPLOYMENT.md`.
