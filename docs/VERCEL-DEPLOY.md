# Déploiement Vercel — pas à pas (préproduction)

État : projet Vercel `e-mairie` créé (équipe `omzakrevo-2218s-projects`, région Paris `cdg1`), variables publiques posées,
base Supabase `cvvsophhludwjldesqbu` migrée (0001→0014). **Reste : 4 secrets + liaison Git.**

## 1. Rendre le dépôt privé
GitHub → `omzakrevo/emarie` → Settings → Danger Zone → *Change visibility* → Private.

## 2. Relier le dépôt à Vercel
Vercel → projet **e-mairie** → Settings → Git → *Connect Git Repository* → `omzakrevo/emarie`, branche de production `main`.
(Premier déploiement : Deployments → *Redeploy* ou pousser un commit.)

## 3. Poser les 4 secrets (Settings → Environment Variables, cocher *Sensitive*)
| Variable | Valeur |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API Keys → clé **secret / service_role** |
| `TRACKING_SECRET_PEPPER` | `openssl rand -base64 48` |
| `CRON_SECRET` | `openssl rand -base64 48` |
| `SANDBOX_WEBHOOK_SECRET` | `openssl rand -base64 48` |

Remplacer aussi `NEXT_PUBLIC_ROOT_DOMAIN` (valeur factice `e-mairie.example`) par votre domaine, ou par
`<projet>.vercel.app` pour un simple test. Ne collez jamais ces valeurs dans une conversation ou un fichier du dépôt.

## 4. Redéployer et vérifier
1. `https://<url>/api/health` → `{"status":"ok"}`.
2. `/` affiche « Niankorodougou » (la base répond). Le site est protégé par Vercel Auth (équipe seulement) tant que vous ne le désactivez pas.
3. Crons (`vercel.json`) : **quotidiens** pour rester compatibles avec l'offre gratuite. Sur offre Pro, resserrer
   (`/api/cron/sms` chaque minute, `/api/cron/payments` toutes les 10 min).
4. PDF : `PDF_CHROMIUM=sparticuz` posé ; **non testé sur Vercel** — générer un document SPÉCIMEN et vérifier ; si dépassement mémoire/temps, passer à ≥ 1 Go / `maxDuration` 60 (plan Pro).

## 5. Supabase (Dashboard)
- Authentication → URL Configuration : ajouter `https://<url>/admin/confirm` aux redirections ; désactiver l'inscription libre par e-mail ; SMTP à configurer.
- Créer le premier administrateur (SQL de `docs/DEPLOYMENT.md` §1.5) puis activer le moyen de paiement `sandbox` (§1.6).
- Laisser `workflow.skip_payment` désactivé.

## 6. Sous-domaines des mairies
Domaine personnalisé + DNS wildcard `*.domaine` → projet Vercel ; le sous-domaine `niankorodougou.<domaine>` résout la commune.

## Rappel : toujours sandbox / spécimen
`PAYMENT_MODE=sandbox`, `SMS_MODE=test`, modèles SPÉCIMEN : rien n'est réel tant que les blocages de `docs/DEPLOYMENT.md` §4 ne sont pas levés.
