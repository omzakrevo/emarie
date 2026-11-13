# Guide d'utilisation

## Citoyen
1. Ouvrir le portail de la commune, choisir un service (ex. extrait de naissance, certificat de résidence).
2. Remplir le formulaire en 7 étapes (glisser ou boutons Précédent/Suivant). Mode **invité** (jeton de brouillon conservé sur l'appareil, brouillon enregistré) ou **connecté**.
3. Joindre les pièces (PDF/images, taille limitée), relire le récapitulatif, payer si un tarif est configuré (**bac à sable pour l'instant : aucun vrai paiement**).
4. Noter la **référence** et le **code de suivi** ; suivre l'état du dossier sur la page Suivi.
5. Quand le dossier est « prêt au retrait », se présenter à la mairie avec une pièce d'identité.
Remarque : la demande en ligne n'est qu'une **pré-demande** ; l'acte est délivré après vérification au registre et signature manuscrite.

## Agent de la mairie
1. Se connecter sur `/admin/connexion` (e-mail + mot de passe ; 2FA si activée).
2. **Demandes** : examiner le dossier (la consultation est journalisée), demander un complément ou rejeter avec motif, valider.
3. **Extrait de naissance** : enregistrer le résultat de la **vérification au registre** (numéro d'acte saisi depuis le registre, jamais inventé) avant toute génération.
4. **Documents** : préparer → générer le PDF → imprimer → remettre au signataire → confirmer la signature → marquer prêt → enregistrer le retrait (identité du retirant).
5. **Administration** : services, champs, pièces, tarifs (historisés), modèles de documents (versions, publication), équipe/rôles, paiements (réconciliation, remboursements à deux personnes), notifications.
Un modèle « provisoire » produit un document **SPÉCIMEN non remettable**.
