# Déploiement d'E-MAIRIE (préproduction, puis production)

## État au dernier point
| Élément | État |
|---|---|
| Code | Prêt, testé hors Supabase (voir rapports de phase) — **commit local uniquement** (aucun dépôt distant configuré) |
| Base Supabase | **Non créée** : la limite de 2 projets gratuits actifs du compte est atteinte. Libérer une place (pause/suppression d'un projet inutile) ou passer à l'offre payante, puis créer le projet « e-mairie » (région conseillée : `eu-west-3`, Paris) |
| Vercel | Équipe disponible ; **aucun projet E-MAIRIE créé** |
| Génération PDF en serverless | Prise en charge `PDF_CHROMIUM=sparticuz` **testée localement** (Chromium 153 embarqué) ; **non testée sur Vercel** |

## 1. Base de données (Supabase)
1. Créer le projet (mot de passe de base fort, stocké dans un gestionnaire de secrets).
2. Appliquer **dans l'ordre** `supabase/migrations/0001` à `0011` (Supabase CLI : `supabase link --project-ref <ref>` puis `supabase db push`). **Ne jamais appliquer** `supabase/tests/00_supabase_stub.sql` (réservé aux tests locaux).
3. Vérifier : `get_advisors` (sécurité) sans alerte RLS ; les buckets `application-files`, `issued-documents`, `receipts` sont **privés** ; `municipality-logos` est public (logos non sensibles).
4. Authentification (Dashboard → Authentication) :
   - agents : e-mail + mot de passe ; **désactiver l'inscription libre** pour les e-mails (seuls les agents invités) ; configurer l'envoi d'e-mails (SMTP) et ajouter `https://<domaine>/admin/confirm` aux URL de redirection autorisées ;
   - citoyens : connexion par téléphone (OTP SMS) — exige un **fournisseur SMS configuré dans Supabase** (Twilio, etc.) ;
   - activer la protection contre les mots de passe compromis et les limites de débit.
5. Créer le premier administrateur (une seule fois) : créer l'utilisateur dans Authentication, puis dans l'éditeur SQL :
   ```sql
   insert into municipality_members (municipality_id, profile_id, role_id)
   select m.id, '<uuid-utilisateur>', r.id from municipalities m join roles r on r.municipality_id = m.id
   where m.slug = 'niankorodougou' and r.code = 'admin_commune';
   ```
6. Activer le moyen de paiement « sandbox » pour la préproduction : `insert into payment_provider_configs values ((select id from municipalities where slug='niankorodougou'), 'sandbox', true, null, now());`
7. Sauvegardes : activer les sauvegardes quotidiennes / PITR (offre payante) ; tester une restauration avant la production.

## 2. Application (Vercel)
1. Importer le dépôt (à héberger d'abord sur GitHub/GitLab) ou déployer par la CLI/l'API Vercel.
2. Variables d'environnement (Project → Settings → Environment Variables), **vérifiées par** `npm run check:env` :
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (secret, jamais exposée), `TRACKING_SECRET_PEPPER`, `CRON_SECRET`,
   `NEXT_PUBLIC_ROOT_DOMAIN`, `NEXT_PUBLIC_DEFAULT_MUNICIPALITY=niankorodougou`, `PAYMENT_MODE=sandbox`, `SANDBOX_WEBHOOK_SECRET`, `SMS_MODE=test`, **`PDF_CHROMIUM=sparticuz`**.
3. Génération de 32 octets aléatoires : `openssl rand -base64 32`.
4. Cron (Project → Cron Jobs, ou `vercel.json`) : `GET /api/cron/sms` (chaque minute) et `GET /api/cron/payments` (toutes les 10 minutes). Vercel envoie automatiquement `Authorization: Bearer $CRON_SECRET`. **Selon le plan, la fréquence minimale peut être limitée (ex. quotidienne en offre gratuite)** : sinon utiliser un planificateur externe.
5. Durée des fonctions : les routes qui génèrent des PDF déclarent `maxDuration = 60` ; vérifier que votre plan l'autorise et que la mémoire allouée suffit à Chromium (≥ 1 Go conseillé).
6. Domaine : un sous-domaine par mairie (`niankorodougou.<domaine>`) pointé vers le projet (wildcard DNS `*.domaine`).
7. Sonde : `GET /api/health` → `{"status":"ok"}`.

## 3. Contrôles après déploiement (préproduction)
- [ ] `/` affiche la commune « Niankorodougou » (preuve que la base répond).
- [ ] Parcours invité complet avec le simulateur de paiement sandbox (`/paiement/sandbox/...`) puis téléchargement de la quittance (filigrane « SANDBOX »).
- [ ] Connexion agent, instruction, génération d'un document (filigrane « SPÉCIMEN »), impression, signature, retrait.
- [ ] Un agent d'une autre commune ne voit rien (créer une 2ᵉ commune de test).
- [ ] `get_advisors` (sécurité) : aucune alerte critique ; aucun bucket d'état civil public.
- [ ] Journal d'audit alimenté ; sauvegarde restaurable.

## 4. Avant toute production (bloquants)
1. **Modèles officiels** (`mode.pdf` jamais reçu) validés par la mairie et publiés « version officielle ».
2. **Paiement réel** : contrats Orange Money / Moov Money, adaptateurs réalisés et recettés (voir `docs/PAYMENTS.md`), `PAYMENT_MODE=live`. Circuit financier officiel confirmé.
3. **SMS réel** : fournisseur choisi, adaptateur réalisé et recetté ; `SMS_MODE=live`.
4. **Conformité** : protection des données (autorité compétente du Burkina Faso), cadre légal de l'état civil en ligne, politique de confidentialité, durées de conservation, procédure de suppression/archivage — à faire valider par les autorités.
5. **Traduction dioula** validée par un locuteur compétent.
6. Tests de bout en bout sur l'environnement Supabase réel (jamais réalisés à ce jour), test de charge raisonnable, revue de sécurité externe.
7. Option « instruire sans paiement » **désactivée**.

## Journal du déploiement Supabase (projet `e-mairie`, ref `cvvsophhludwjldesqbu`, eu-west-3)
- Migrations 0001 → 0012 appliquées via l'outil Supabase (versions horodatées par Supabase).
- **Écarts volontaires par rapport aux fichiers du dépôt**, pour éviter les instructions `DROP` (confirmation interactive indisponible) :
  1. les politiques `members_admin_write`, `roles_admin_write`, `role_perms_admin_write` (0006) et `pricing_staff_write` (0007) ont été **neutralisées** (`ALTER POLICY … USING (false) WITH CHECK (false)`) au lieu d'être supprimées — effet de sécurité identique ;
  2. l'ancienne signature à 4 arguments de `record_registry_check` (0006) n'a **jamais été créée** en base : seule la version à 5 arguments (0008) existe.
  Une installation neuve à partir des fichiers du dépôt reste valide (les `DROP` y sont sans problème).
- Contrôle de sécurité (advisors) : 0 alerte critique ; restent des avis volontaires (tables réservées au serveur ; fonctions d'agent qui vérifient les droits en interne).
- **Clé `service_role`** : non récupérable par l'outil, à ajouter par vous dans les variables d'environnement Vercel (jamais dans une conversation ni un fichier).

## Journal du déploiement Vercel (projet `e-mairie`, id `prj_IT2cImILnSvA3A5DbGMcMZwSsdm3`, équipe `omzakrevo-2218s-projects`)
- Projet créé (Next.js, fonctions en `cdg1`/Paris), **aucun déploiement** : le code n'a pas été envoyé (pas de dépôt Git distant ; l'outil n'accepte que des fichiers inlinés, impraticable pour 188 fichiers).
- Variables **déjà posées** (non secrètes) : `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (clé publique), `NEXT_PUBLIC_DEFAULT_MUNICIPALITY`, `NEXT_PUBLIC_ROOT_DOMAIN` (valeur factice : à remplacer par votre domaine), `PAYMENT_MODE=sandbox`, `SMS_MODE=test`, `PDF_CHROMIUM=sparticuz`.
- Variables **à poser par vous** (secrets, refusées à l'agent) : `SUPABASE_SERVICE_ROLE_KEY`, `TRACKING_SECRET_PEPPER`, `CRON_SECRET`, `SANDBOX_WEBHOOK_SECRET`.
  ```bash
  # depuis le dossier du projet, après `vercel login` et `vercel link`
  openssl rand -base64 48 | vercel env add TRACKING_SECRET_PEPPER production
  openssl rand -base64 48 | vercel env add CRON_SECRET production
  openssl rand -base64 48 | vercel env add SANDBOX_WEBHOOK_SECRET production
  vercel env add SUPABASE_SERVICE_ROLE_KEY production   # collez la clé « service_role » du tableau de bord Supabase
  ```
  (répéter avec `preview` si nécessaire) puis `vercel deploy` (ou connecter un dépôt Git au projet).
- La protection Vercel Auth est active par défaut sur le projet : le site de préproduction n'est visible que des membres de l'équipe.
