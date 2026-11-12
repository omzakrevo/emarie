# Phase 5 — Documents, impression, signature, retrait : rapport

## ⚠ Modèles PROVISOIRES — `mode.pdf` n'a jamais été reçu
Les deux modèles (certificat de résidence, extrait de naissance) reprennent la **liste de champs du cahier des charges**, pas la mise en page réelle de la mairie.
Les phrases juridiques sont marquées `[TEXTE PROVISOIRE]`. Garde-fous :
- une version non validée est **publiée comme provisoire** : filigrane « SPÉCIMEN — MODÈLE NON VALIDÉ » sur le PDF ;
- un document issu d'un modèle provisoire **ne peut pas être mis à disposition** (`release_document` → `specimen_not_releasable`) ;
- pour passer en production : recréer/éditer le modèle dans `/admin/modeles` d'après le modèle officiel, puis publier en cochant « version officielle » (tracé : qui, quand).

## Cycle documentaire (tout est imposé par PostgreSQL)
`VALIDATED → (prepare_document + rendu PDF + finalize_document) → DOCUMENT_GENERATED → mark_printed → PRINTED → hand_to_signer → PENDING_SIGNATURE → confirm_signature → SIGNED → release_document → READY_FOR_PICKUP → record_withdrawal → WITHDRAWN`

| Exigence | Mécanisme |
|---|---|
| Extrait jamais délivré sur la seule déclaration | le document est construit **uniquement** sur les données saisies depuis le registre (`civil_registry_checks.registry_data`) ; testé SQL + PDF |
| Aucun numéro d'acte inventé | numéro = référence du registre ; aucun compteur consommé pour un extrait |
| Numérotation du certificat | `next_document_number()` atomique par commune/année ; **conservée** à la régénération (pas de trou) |
| Version du modèle conservée | `issued_documents.template_version_id` ; versions publiées/archivées **immuables** (trigger + RLS) |
| Document signé jamais modifié | `locked_at` posé à la signature ; trigger `document_locked` (UPDATE/DELETE impossibles) ; empreinte SHA-256 du PDF |
| Régénération | autorisée **avant** signature, avec motif obligatoire ; l'ancien document est conservé (« superseded ») |
| Retrait | pièce vérifiée (case obligatoire), nom, lien, type de pièce ; **4 derniers caractères** seulement du numéro (minimisation) |
| Séparation des tâches | permissions distinctes : générer / imprimer / confirmer signature / mettre à disposition / retirer |
| Traçabilité | événements d'historique + audit ; accès aux PDF journalisé |
| PDF sûr | HTML construit uniquement à partir d'un contenu **validé** (zod strict, champs autorisés par modèle) et **échappé** ; Chromium JavaScript désactivé et **réseau bloqué** (test : 0 requête sortante) |
| Stockage | PDF dans un bucket **privé**, URL signée 60 s ; logos dans un bucket public séparé (non sensibles) |

## Interface
`/admin/modeles` (versions, éditeur : textes, champs `{{...}}`, marges, police, titres, cadres signature/cachet/timbre, logo, **prévisualisation à données fictives**, brouillon, publication, archivage automatique),
`/admin/documents` (files : à générer / imprimer / remettre / signer / mettre à disposition / prêts), panneau « Document » sur chaque fiche dossier, logo officiel dans `/admin/parametres`.

## Tests
- SQL : `07_documents.sql` (cycle complet, ordre imposé, immuabilité, permissions, isolation, registre vs déclaré, numérotation).
- Unitaires : schéma/rendu/échappement/éditeur ; **PDF réels** via Chromium (A4, 1 page, texte, filigrane par analyse de pixels, aucune requête réseau).
- Intégration (`npm run test:integration`) : base réelle → `prepare_document` → PDF → texte vérifié (registre, pas déclaré).

## Non fait / non testé / à décider
1. **Fidélité aux modèles officiels** : impossible sans `mode.pdf` (mise en page, en-têtes exacts, formulations, timbre).
2. **SMS « document prêt »** : Phase 6 (module de notifications) ; aucun SMS n'est envoyé aujourd'hui.
3. **Interface** (éditeur, panneau document, files) : compilée, linter, build ; **pas de test navigateur** (pas de Supabase ici). Règles SQL, rendu PDF et contrat TS↔SQL sont testés.
4. **Hébergement du PDF** : exige Chromium sur le serveur (`CHROMIUM_EXECUTABLE_PATH`, polices installées) — non disponible sur du serverless « pur » ; à trancher au déploiement (Phase 7).
5. Polices : DejaVu/Liberation selon le serveur ; à installer pour un rendu identique partout.
6. Le **cachet** et la **signature** sont physiques : les cadres sont réservés, rien n'est reproduit numériquement.
7. Cas de l'extrait pour une personne née hors registre local, mentions marginales, copies certifiées : non traités (procédure légale à confirmer).
