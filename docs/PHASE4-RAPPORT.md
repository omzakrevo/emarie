# Phase 4 — Administration : rapport

## Principe
Toutes les règles métier sont dans PostgreSQL (fonctions `SECURITY DEFINER`, `search_path` fixé, `auth.uid()` interne).
L'interface n'est qu'un client : un agent qui contournerait l'interface est arrêté par la base.

| Règle | Où |
|---|---|
| Seul chemin de changement de statut côté personnel | `agent_transition()` + table `workflow_transitions` |
| Motif obligatoire pour « complément » et « rejet » | `agent_transition()` (`note_required`) |
| Instruction impossible sans paiement (tant que le paiement en ligne n'existe pas) | `workflow.skip_payment` (désactivé par défaut) |
| Extrait de naissance : validation seulement après vérification positive au registre, par un officier habilité | `record_registry_check()` + `agent_transition()` |
| Numéro d'acte : saisi depuis le registre, jamais généré | `civil_registry_checks.registry_ref` |
| Transitions Phase 5 (document, impression, signature, retrait) | présentes mais `enabled=false` : pas de contournement des enregistrements dédiés |
| Anti-escalade : on n'accorde que des droits qu'on possède ; rôle `admin_commune` non modifiable ; dernier admin protégé | `add_member`, `set_member_role`, `set_member_active`, `set_role_permission` |
| Plus d'écriture directe sur membres/rôles/permissions | politiques d'écriture supprimées |
| Historique, notes, vérifications, audit | ajout seul (RLS + triggers) |
| Statistiques | `dashboard_stats()` (agrégats d'une commune, permission vérifiée) |

## Interface
`/admin` (tableau de bord + filtres date/service), `/admin/demandes` (filtres, pagination), `/admin/demandes/[id]` (données, justificatifs,
registre, actions, observations internes, historique), `/admin/agents`, `/admin/roles`, `/admin/parametres`.
Navigation filtrée par permissions ; chaque page revérifie côté serveur. Textes via le système i18n (`adm.*`).

## Non testé / limites
1. **Aucun test de bout en bout** de l'interface admin ni des actions serveur : pas de Supabase disponible ici. Couverts :
   règles SQL (tests), contrat TS↔SQL des appels RPC (test statique), compilation, lint, build.
2. **Invitation d'agent par e-mail** (`inviteUserByEmail`, route `/admin/confirm`, page `/admin/mot-de-passe`) : écrite, non testée ;
   exige l'envoi d'e-mails configuré dans Supabase Auth et l'URL de redirection autorisée.
3. Données personnelles visibles dans la fiche dossier : l'accès aux justificatifs est journalisé (`file_download`), la consultation de la fiche ne l'est pas encore.
4. Pas encore : double authentification des agents, création de rôles personnalisés, gestion des services/tarifs/justificatifs (modules « services » et « tarifs » : à faire),
   recherche par nom du demandeur, page `/admin/connexion` non traduite (Phase 2).
5. Les statistiques de paiement affichent « disponible avec le paiement en ligne » : aucune donnée n'est inventée.
6. `workflow.skip_payment` doit rester **désactivé en production** tant que la Phase 6 n'est pas livrée.

## Complément : services, tarifs, justificatifs (migration 0007)
- **Tarifs** : `set_service_price()` (permission `pricing.manage`) ferme le tarif en cours la veille de l'entrée en vigueur et en ouvre un nouveau ;
  historique conservé, effet rétroactif refusé, montants bornés. Plus d'écriture directe sur `service_pricing`.
- **Configuration** (description, procédure, délai, ouverture, libellés/aide/caractère obligatoire des champs, justificatifs) : modifiable sans toucher au code,
  **auditée automatiquement** (triggers). Un champ ne se supprime pas ; un justificatif déjà utilisé non plus (le rendre facultatif).
- Interface : `/admin/services` et `/admin/services/[code]`. Aucun tarif ni justificatif par défaut : à saisir uniquement après confirmation officielle.
- Limite : non testé de bout en bout (pas de Supabase) ; règles SQL testées (`06_service_admin.sql`), contrat TS↔SQL testé.
