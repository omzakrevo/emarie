# E-MAIRIE — Phase 1 : Analyse et architecture

> Statut : **à valider**. Aucune ligne de code applicatif n'a été écrite avant validation.

## 0. Constats de l'analyse

| Constat | Conséquence |
|---|---|
| Dépôt vide (aucun code existant) | Démarrage à zéro, rien à préserver. |
| **`mode.pdf` introuvable** (ni dans le dépôt, ni dans `/mnt/user-data/uploads`, ni ailleurs) | Les deux modèles (naissance, résidence) ne sont **pas** reproduits d'après l'original. Les structures ci-dessous viennent uniquement de la liste de champs de votre cahier des charges et sont **provisoires**. Merci de ré-envoyer le fichier avant la Phase 5. |
| Outils : Node 22, npm 10, psql, docker disponibles ; `supabase` CLI absent | Tests RLS possibles avec un PostgreSQL local (docker/psql). Next.js 16.x disponible sur le registre. |
| Aucun identifiant Supabase, Orange Money, Moov, SMS fournis | Paiement et SMS en mode **sandbox/test explicite** ; aucune intégration réelle ne sera annoncée. |

## 1. Architecture définitive

```
Navigateur (PWA responsive, FR/Dioula)
   │  HTTPS
Next.js (App Router, TypeScript, Tailwind)  ── hébergement Vercel/Netlify/VPS
   ├─ Pages publiques & espace citoyen (Server Components + Client pour le formulaire swipe)
   ├─ Back-office /admin  (garde serveur + permissions)
   ├─ Route Handlers /api/*  (validation Zod, rate-limit, audit)
   │     ├─ /api/payments/webhooks/{orange|moov}  (signature vérifiée, idempotent)
   │     ├─ /api/documents/[id]/pdf               (rendu serveur)
   │     └─ /api/files/sign                       (URLs temporaires)
   └─ Services métier (src/server/*) — seuls à utiliser la clé service_role (jamais le navigateur)
Supabase
   ├─ PostgreSQL + RLS (isolation par municipality_id)
   ├─ Auth (téléphone OTP citoyens ; email+mot de passe + MFA agents)
   ├─ Storage PRIVÉ (justificatifs, PDF, quittances)
   └─ Edge Functions / pg_cron : file SMS, réconciliation paiements
Fournisseurs (interfaces/adapters) : PaymentProvider (Orange, Moov, Sandbox) · SmsProvider (Test, réel plus tard)
PDF : HTML/CSS A4 → Chromium headless (Playwright) côté serveur
```

Principes : domaine métier isolé de l'UI ; toute opération sensible (numérotation, paiement, transitions de statut) passe par des **fonctions SQL atomiques** (`SECURITY DEFINER`, `search_path` fixé) ; le frontend n'invente jamais un numéro officiel.

**Décisions à confirmer** : (a) Playwright/Chromium pour le PDF : fidèle au HTML/CSS mais impose un hébergement non purement serverless (VPS/conteneur, ou Vercel avec `@sparticuz/chromium`) ; (b) Dioula : traductions initiales **provisoires, à valider** par un locuteur.

## 2. Organisation des dossiers

```
e-mairie/
├─ docs/                 README-install, deploy, database, api, security, user-guide, legal-validation
├─ supabase/
│  ├─ migrations/        0001_core … (SQL versionné)
│  ├─ seed.sql           Niankorodougou + services + données fictives (env demo uniquement)
│  └─ tests/             tests RLS (pgTAP ou SQL)
├─ src/
│  ├─ app/
│  │  ├─ (public)/       accueil, mairie, commune, services, contacts, horaires, actualites
│  │  ├─ (citoyen)/      connexion, inscription, mon-espace, suivi
│  │  ├─ demande/        formulaire swipe 7 étapes
│  │  ├─ admin/          dashboard, demandes, citoyens, modèles, paiements, sms, agents, rôles, tarifs, services, stats, rapports, paramètres
│  │  └─ api/            route handlers
│  ├─ components/ui/     boutons, champs, stepper, upload, tables
│  ├─ features/          demande, suivi, admin, documents, paiements, sms
│  ├─ server/            auth, permissions, tenancy, workflow, numbering, payments/{providers}, sms/{providers}, pdf, storage, audit
│  ├─ lib/               supabase clients, i18n, validation (zod), utils
│  ├─ i18n/              fr.json, dyu.json
│  └─ middleware.ts      résolution de la commune (sous-domaine), sessions
├─ tests/                unit, integration, e2e (Playwright)
├─ .env.example
└─ README.md
```

## 3. Schéma de base de données

Toutes les tables communales portent `municipality_id uuid NOT NULL REFERENCES municipalities(id)`, UUID `gen_random_uuid()`, `created_at/updated_at`.

**Tenancy & accès** : `municipalities` (slug, nom, région, province, adresse, logo_path, contacts, `subdomain` unique, actif) · `municipality_settings` (clé/valeur JSON : horaires, langues, mode paiement, etc.) · `profiles` (lié à `auth.users`, nom, téléphone, langue) · `municipality_members` (profile, commune, role, actif) · `roles` / `permissions` / `role_permissions` (permissions par commune ; rôles : admin_commune, secrétaire_général, officier_état_civil, agent_accueil, caissier, lecteur) · `citizens` (profil citoyen optionnel ; données personnelles minimales).

**Catalogue** : `services` (code, icône, description i18n, actif, `template_id`) · `service_fields` (type, clé, libellé i18n, obligatoire, règles, `visible_if` JSON, ordre, étape) · `service_documents` (justificatifs configurables, obligatoire, types/taille) · `service_pricing` (montant XOF, validité, historique ; **aucun tarif par défaut** : à saisir par la mairie).

**Demandes** : `applications` (reference `NIA-2026-000001`, service, citizen nullable, statut, `tracking_secret_hash` pour invité, `submitted_at`) · `application_data` (JSONB validé selon `service_fields`) · `application_files` (chemin storage privé, mime, taille, sha256, statut scan) · `application_events` (historique immuable : transition, acteur, motif).

**Finance** : `payments` (application, montant calculé serveur, devise, provider, `idempotency_key` unique, statut PENDING/PAID/FAILED/REFUNDED, `provider_ref` unique) · `payment_webhooks` (payload brut, signature, vérifié, traité ; unique sur l'id d'événement) · `receipts` (numéro séquentiel, PDF) · remboursements via `payments` liés + permission dédiée.

**Documents** : `document_templates` · `document_template_versions` (HTML/CSS, champs, marges, polices, statut draft/published/archived, immuable une fois publiée) · `issued_documents` (version utilisée, numéro d'acte, hash du PDF, verrouillé après signature) · `signatures` (signataire, date, confirmé par) · `withdrawals` (retiré par, pièce vérifiée, date/heure, agent).

**Transversal** : `notification_templates` (fr/dyu par événement) · `notifications` (file, tentatives, statut, mode test) · `audit_logs` (append-only) · `translations` (clé, langue, valeur, validé) · `numbering_counters` (commune, type, année, dernière valeur) incrémentés par `next_number()` atomique (`INSERT … ON CONFLICT DO UPDATE … RETURNING`).

Index : `(municipality_id, status, created_at)`, `(municipality_id, service_id)`, références uniques par commune, `payments(provider_ref)`. RLS : politique type `municipality_id IN (SELECT current_member_municipalities())` + vérification de permission ; les invités n'accèdent à rien en direct (passage par API serveur + secret hashé).

## 4. Écrans

**Public/citoyen** : Accueil · La mairie · La commune · Services (liste + détail) · Contacts · Horaires · Actualités · Suivi (référence + code) · Connexion · Inscription (OTP) · Tableau de bord citoyen · Détail demande/quittance · **Formulaire swipe (7 étapes)**.
**Admin** : Dashboard (filtres date/service) · Demandes + fiche dossier · Certificats de résidence · Extraits de naissance (avec recherche registre) · Citoyens · Documents · Éditeur de modèles + prévisualisation · Impression · Signature · Retrait · Paiements/transactions/réconciliation · Quittances · SMS (modèles, file, historique) · Agents · Rôles/permissions · Tarifs · Services/champs/justificatifs · Statistiques · Rapports · Paramètres (logo, horaires, contacts, sous-domaine) · Journal d'audit.

## 5. Workflow administratif

```
DRAFT → SUBMITTED → PAYMENT_PENDING → PAID → UNDER_REVIEW
   UNDER_REVIEW → ADDITIONAL_INFO_REQUIRED → UNDER_REVIEW
   UNDER_REVIEW → REJECTED (motif obligatoire)
   UNDER_REVIEW → VALIDATED → DOCUMENT_GENERATED → PRINTED
   → PENDING_SIGNATURE → SIGNED → READY_FOR_PICKUP → WITHDRAWN
```
Table de transitions autorisées + permission requise par transition, appliquée dans une fonction SQL unique `transition_application()` (verrou de ligne, écriture dans `application_events`, déclenchement SMS). Passage à PAID uniquement par le traitement serveur d'un webhook vérifié. Extrait de naissance : étape obligatoire **« vérification au registre officiel »** par l'officier d'état civil avant VALIDATED ; numéro d'acte saisi depuis le registre, jamais généré. Un document SIGNED est verrouillé (corrections = nouveau document + trace). *Séquence à adapter après confirmation de la mairie (ex. certificat de résidence sans paiement préalable, ou paiement au retrait).*

## 6. Système multi-mairies

Résolution de la commune : sous-domaine (`niankorodougou.e-mairie.bf`) ou chemin en dev (`/c/niankorodougou`), via `municipalities.subdomain`. Défense en profondeur : (1) RLS par `municipality_id` et appartenance via `municipality_members` ; (2) contrôle serveur systématique `assertMember(municipality, permission)` ; (3) clés étrangères composites pour empêcher les références croisées entre communes ; (4) numérotation, tarifs, modèles, paramètres par commune ; (5) tests automatisés « agent A ne lit/écrit rien de la commune B ». Ajouter une commune = une ligne `municipalities` + seed de services, sans déploiement de code. Les recettes sont enregistrées par commune ; le circuit de reversement officiel reste **à confirmer** avec la mairie/le Trésor.

## 7. Dépendances techniques

next, react, typescript, tailwindcss, `@supabase/ssr` + `@supabase/supabase-js`, zod, react-hook-form, framer-motion (transitions swipe), `next-intl` ou i18n maison léger, playwright (PDF + e2e), vitest, pgTAP/psql (tests RLS), `@upstash/ratelimit` ou limitation en base, `pino`. Aucune dépendance de paiement/SMS tant que les contrats ne sont pas disponibles (adapters maison).

## 8. Calendrier indicatif (1 développeur, validations entre phases)

| Phase | Contenu | Durée |
|---|---|---|
| 2 | Socle, migrations, auth, multi-tenant, tests RLS | 1,5 sem. |
| 3 | Portail citoyen, formulaire swipe, upload, suivi | 2 sem. |
| 4 | Back-office, rôles, workflow | 2 sem. |
| 5 | Modèles, PDF, impression, signature, retrait | 2 sem. *(après réception de mode.pdf)* |
| 6 | Paiements (sandbox + adapters), webhooks, SMS, quittances | 2 sem. *(réel : dépend des contrats)* |
| 7 | i18n, tests, sécurité, doc, déploiement | 1,5 sem. |

## 9. Points nécessitant une validation humaine

1. **Ré-envoi de `mode.pdf`.**
2. Tarifs, justificatifs, procédures, délais (mairie).
3. Contrats marchands Orange Money / Moov Money BF et circuit de reversement des recettes.
4. Fournisseur SMS.
5. Conformité : loi burkinabè sur la protection des données (CIL), cadre légal de la délivrance d'extraits en ligne, durées de conservation.
6. Traduction dioula par un locuteur.
7. Logo officiel et identité du signataire.
8. Projet Supabase (URL, clés) et hébergement.
