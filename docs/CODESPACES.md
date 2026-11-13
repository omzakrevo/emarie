# Préproduction sur GitHub (Codespaces)

GitHub Pages ne sert que du statique et ne peut pas faire tourner E-MAIRIE. **GitHub Codespaces**, lui, exécute l'application
complète (serveur Next.js, PDF, crons manuels) dans un conteneur et la publie sur une URL `https://<nom>-3000.app.github.dev`.

## Mise en route (≈ 10 min)
1. Dépôt `omzakrevo/emarie` → **Settings → Secrets and variables → Codespaces → New repository secret** :
   nom `SUPABASE_SERVICE_ROLE_KEY`, valeur = clé *service_role* du tableau de bord Supabase (Project Settings → API Keys). Saisie par vous seul.
2. Dépôt → **Code → Codespaces → Create codespace on main** (machine 4 cœurs).
3. Attendre l'installation et le build (~5–8 min, journal visible dans le terminal). L'application démarre toute seule.
4. Onglet **Ports** → port 3000 → ouvrir l'URL. Vérifier `/api/health` puis `/`.
5. Supabase → Authentication → URL Configuration : ajouter `https://<nom>-3000.app.github.dev/**` aux redirections ; créer le premier administrateur et activer le paiement `sandbox` (`DEPLOYMENT.md` §1.5–1.6).

## À savoir (limites réelles)
- Le port est **privé** par défaut (connexion GitHub requise). Pour montrer le site à d'autres : clic droit sur le port → *Visibility → Public* (à n'utiliser que pour des tests, sans vraies données).
- Le Codespace **s'arrête après inactivité** (30 min par défaut) et l'URL ne répond plus ; le relancer le redémarre. Quota gratuit mensuel limité.
- C'est un environnement de **test**, pas de production durable : pour la production, il faudra un hébergement permanent.
- Non testé ici (aucun accès à Codespaces depuis cette session) : si le build ou le démarrage échoue, copiez `/tmp/emairie.log` ou la sortie du terminal.
- Toujours sandbox/spécimen : pas de vrai paiement, pas de vrai SMS.
