# Phase 3 — Portail citoyen : rapport

## Modèle d'accès (décision de conception)
- **Invité** : aucun accès direct à la base (RLS fermée). Le serveur agit avec `service_role` après avoir vérifié
  (a) la commune courante, (b) la propriété : jeton de brouillon 256 bits en cookie httpOnly (haché HMAC en base).
- **Suivi invité** : référence + code `XXXX-XXXX-XXXX` (60 bits, alphabet sans ambiguïté), haché HMAC avec un *pepper*
  serveur, comparaison à temps constant, limitation de débit par client et par référence, réponse identique si la
  référence n'existe pas. Saisie en POST : aucune donnée dans l'URL.
- **Connecté** (OTP téléphone Supabase) : RLS `profile_id = auth.uid()` en lecture ; aucune écriture directe.
- **Fichiers** : bucket privé, aucune policy storage ; type réel détecté par signature binaire (PDF/JPEG/PNG/WebP),
  taille limitée (≤ 4 Mo par prudence d'hébergement), photos réduites côté client, aperçu par URL signée de 60 s.
- **Références officielles** : attribuées uniquement à la soumission par `submit_application()` (SQL atomique).

## Limites connues / à décider
1. **Paiement non branché** : la soumission crée la demande en `SUBMITTED` sans paiement (mode test affiché). En Phase 6
   le passage à `PAID` conditionnera l'enregistrement définitif. **Ne pas ouvrir au public avant.**
2. **OTP SMS** : nécessite un fournisseur SMS configuré dans Supabase Auth ; sinon l'inscription affiche une erreur claire.
3. **Reprise d'un brouillon invité** : uniquement sur le même navigateur (cookie). Les comptes connectés reprennent partout.
4. **Dioula** : squelette (oui/non) — traduction à fournir et faire valider ; repli sur le français.
5. **Textes publics** (la mairie, la commune, horaires, contacts, annonces) : vides tant que la mairie ne les saisit pas
   (clés `municipality_settings.public.*`) ; l'interface d'édition arrive en Phase 4.
6. **Purge des brouillons** (`draft_expires_at`, 30 j) : colonne prête, tâche de purge à planifier (Phase 7).
7. **Table `citizens`** (fiche citoyen côté agents) : prévue en Phase 4.
8. **Balayage tactile** : implémenté mais non couvert par un test automatisé.
9. Aucune pièce justificative ni tarif n'est préconfiguré (à définir par la mairie).
