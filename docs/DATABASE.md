# Base de données — E-MAIRIE

PostgreSQL (Supabase). Schéma `public`, 35 tables, **RLS activée sur toutes** (vérifié sur le projet de test).
Migrations : `supabase/migrations/0001…0014`. Chaque table métier porte `municipality_id` (multi-mairie) ; les clés
étrangères sont composites `(id, municipality_id)` pour interdire tout mélange entre communes.

| Domaine | Tables |
|---|---|
| Commune / accès | municipalities, municipality_settings, municipality_members, roles, role_permissions, permissions, profiles |
| Services | services, service_fields, service_documents, service_pricing (tarifs historisés) |
| Demandes | applications, application_data, application_files, application_events, application_notes, workflow_transitions |
| Vérification état civil | civil_registry_checks (résultat de la vérification au registre, par un agent) |
| Documents | document_templates, document_template_versions, issued_documents, signatures, withdrawals, numbering_counters |
| Paiements | payments, payment_provider_configs, payment_webhooks, receipts, refunds |
| Notifications | notifications, notification_templates |
| Transverse | audit_logs, rate_limits, announcements |

## Tables sans politique RLS (volontaire)
`numbering_counters`, `payment_webhooks`, `rate_limits` : accessibles **uniquement** par fonctions SECURITY DEFINER ou
`service_role` (serveur). Le linter Supabase les signale en INFO : c'est le comportement voulu (aucun accès client).

## Accès des citoyens
Les invités n'ont **aucun accès direct** à la base : le serveur (service_role) agit avec un jeton de brouillon / secret de
suivi stockés **hachés (HMAC + pepper)**. Les pièces sont dans un stockage **privé**, servies par le serveur après contrôle.

## Fonctions métier (SECURITY DEFINER, `search_path` fixé)
Workflow : `agent_transition`, `record_registry_check`, `prepare_document`, `finalize_document`, `discard_document`,
`mark_printed`, `hand_to_signer`, `confirm_signature`, `release_document` (refuse un spécimen), `record_withdrawal`.
Équipe : `add_member`, `set_member_role`, `set_member_active`, `set_role_permission`, `can_assign_role`.
Tarifs/modèles : `set_service_price`, `publish_template_version`. Paiements : `initiate_payment`, `apply_payment_result`,
`issue_receipt`, `request_refund`, `decide_refund` (4 yeux), `mark_refund_executed`, `reconciliation_report`.
Divers : `dashboard_stats`, `next_reference`, `next_document_number`, `claim/complete/retry_notification`, `rate_limit_hit`.
Conservation (service_role seul) : `expired_drafts`, `purge_expired_drafts`, `purge_technical_data`.

Constat du linter : les fonctions ci-dessus sont appelables par `authenticated` mais **vérifient `has_permission()`
en interne** ; `has_permission` et `my_municipalities` sont appelables par `anon` car utilisées dans les politiques RLS
(elles renvoient « faux / vide » sans session). Aucun autre accès anonyme à une fonction métier.

Le schéma exact se régénère avec `supabase gen types` ou l'outil `list_tables` ; les tests SQL (`npm run test:db`) en
valident les règles (10 fichiers).
