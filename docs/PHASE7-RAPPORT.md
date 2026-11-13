# Phase 7 — Rapport : langues, tests, sécurité, responsive, documentation, déploiement

## Réalisé et vérifié
- **Tests** : 139 tests unitaires/intégration, 10 fichiers de tests SQL (runner strict), e2e navigateur (formulaire 17 contrôles, paiement 11, accessibilité/responsive 40 contrôles, 0 problème), test de contrat TS↔SQL, tsc et eslint sans erreur, `npm audit` : 0 vulnérabilité.
- **Responsive/accessibilité** : axe-core WCAG A/AA aux largeurs 320/375/768/1280, sans débordement horizontal ; contrastes corrigés ; PWA (manifest + icônes).
- **Sécurité** : limitation de débit connexion agent, MFA TOTP optionnelle, journal des consultations de dossier, purge de conservation (migration 0014 **appliquée** au projet Supabase de test, droits vérifiés : service_role seul).
- **Confidentialité** : page `/confidentialite` (brouillon à compléter), note dans le récapitulatif.
- **Langues** : outillage Dioula (feuille, import validé, couverture). **FR complet ; Dioula 2/471 clés (0,4 %), non validé, avertissement affiché.**
- **CI GitHub Actions** ajoutée (non exécutée ici).
- **Documentation** : DATABASE, API, SECURITY, RETENTION, LEGAL-VALIDATION, USER-GUIDE, DEPLOYMENT, README.

## Non réalisé / bloqué (à ne pas considérer comme fait)
1. Traduction Dioula : nécessite un locuteur compétent.
2. Modèles officiels : toujours provisoires/SPÉCIMEN, validation de la mairie requise.
3. Orange/Moov, SMS réels : non intégrés (contrats requis). Seul le bac à sable existe.
4. Validations juridiques (voir LEGAL-VALIDATION.md).
5. Aucun test de bout en bout contre Supabase réel (Auth/Storage) ; MFA non testée en réel.
6. CSP non implémentée.
7. **Déploiement Vercel non finalisé** : saisir les 4 secrets, connecter le dépôt GitHub (le rendre privé), vérifier `/api/health`, créer le premier administrateur (docs/DEPLOYMENT.md).
8. Le workflow CI peut être refusé au push si le jeton n'a pas le droit « workflow ».
