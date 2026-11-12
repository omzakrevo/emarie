-- 0012 — Durcissement (conseils du contrôle de sécurité Supabase) : search_path fixé, fonctions de déclencheur non exécutables en direct.
-- NB : has_permission() et my_municipalities() restent exécutables par anon/authenticated : les politiques RLS les évaluent avec les droits de l'appelant.
alter function public.set_updated_at() set search_path = public;
alter function public.events_append_only() set search_path = public;
alter function public.issued_document_guard() set search_path = public;
alter function public.forbid_field_delete() set search_path = public;
alter function public.template_version_guard() set search_path = public;

revoke all on function public.audit_config_change() from public, anon, authenticated;
revoke all on function public.enqueue_notification() from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.protect_used_document() from public, anon, authenticated;
