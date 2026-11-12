# E-MAIRIE — La mairie, plus proche de vous.

Plateforme SaaS multi-mairies de services administratifs en ligne. Première commune : **Niankorodougou** (province de la Léraba, région des Tannounyan, Burkina Faso).

Statut : **Phase 6 (paiements, quittances, SMS) terminée — AUCUN prestataire réel intégré, en attente de validation** (Phases 1–5 validées) — voir `docs/PHASE1-ANALYSE-ARCHITECTURE.md` pour l'architecture complète.
Les modèles de documents sont **provisoires** (`mode.pdf` non reçu : voir `docs/PHASE5-RAPPORT.md`) ; **Orange Money, Moov Money et le fournisseur SMS ne sont PAS intégrés** (voir `docs/PAYMENTS.md`) : seul un mode sandbox/test, clairement étiqueté, existe.

## Prérequis
Node 22+, npm 10+, un projet Supabase (ou PostgreSQL 16 pour les tests de base).

## Installation
```bash
npm install
cp .env.example .env.local   # renseigner les variables Supabase
npm run dev
```
Appliquer `supabase/migrations/*.sql` dans l'ordre (Supabase CLI : `supabase db push`, ou éditeur SQL).
Créer un agent : utilisateur dans Supabase Auth (e-mail + mot de passe), puis ligne dans `municipality_members` reliant son `profiles.id`, la commune et un rôle (le profil est créé automatiquement).

## Tests
```bash
npm test                 # unitaires (champs dynamiques, secrets, fichiers, i18n, commune)
# PDF réels (Chromium requis) : CHROMIUM_EXECUTABLE_PATH=/chemin/chrome
E2E_HARNESS=1 npx next dev -p 3222 &  npm run test:e2e   # formulaire swipe dans Chromium mobile (actions simulées)
npm run typecheck && npm run lint && npm run build
# Base : PostgreSQL JETABLE uniquement (le script vide les schémas public et auth)
DATABASE_URL=postgresql://user@host/db_jetable npm run test:db
```
`supabase/tests/00_supabase_stub.sql` simule le strict minimum de Supabase (rôles, `auth.uid()`) pour tester hors Supabase ; il ne doit jamais être appliqué en production.

## Multi-mairies
La commune est déterminée par le sous-domaine (`<slug>.<NEXT_PUBLIC_ROOT_DOMAIN>`) dans `src/proxy.ts`, avec repli sur `NEXT_PUBLIC_DEFAULT_MUNICIPALITY` en local. Isolation : RLS PostgreSQL + contrôle serveur (`src/server/auth/permissions.ts`). Nouvelle commune : insérer une ligne dans `municipalities` puis `select seed_default_roles('<id>')`.

## Sécurité (état actuel)
- La clé `SUPABASE_SERVICE_ROLE_KEY` n'est lue que dans `src/lib/supabase/admin.ts` (`server-only`).
- `next_reference()` et `seed_default_roles()` ne sont pas appelables par les utilisateurs.
- Limitation des tentatives de connexion : seule la limite native de Supabase Auth s'applique pour l'instant ; un contrôle applicatif est prévu en Phase 7.
