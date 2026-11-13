-- 0014 — Conservation des données : purge des brouillons expirés et des données techniques périmées.
-- Les DOSSIERS DÉPOSÉS (état civil, paiements, documents émis, journal d'audit) ne sont JAMAIS purgés automatiquement :
-- leur durée de conservation légale est à fixer avec la mairie et les autorités (voir docs/RETENTION.md).

-- Brouillons expirés (DRAFT, échéance dépassée) : renvoie les fichiers à supprimer du stockage AVANT la purge des lignes
create or replace function public.expired_drafts(p_limit int default 200) returns table (application_id uuid, storage_path text)
language sql stable security definer set search_path = public as $$
  select a.id, f.storage_path
  from (select id from applications where status = 'DRAFT' and draft_expires_at is not null and draft_expires_at < now() order by draft_expires_at limit greatest(1, least(p_limit, 1000))) a
  left join application_files f on f.application_id = a.id
$$;

-- Suppression des brouillons listés (re-vérifie : DRAFT et expiré ; cascade sur données, fichiers, historique)
create or replace function public.purge_expired_drafts(p_ids uuid[]) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  delete from applications where id = any(p_ids) and status = 'DRAFT' and draft_expires_at is not null and draft_expires_at < now();
  get diagnostics n = row_count;
  return n;
end $$;

-- Données techniques : limitation de débit (> 2 jours), notifications de test (> 90 j), webhooks rejetés (> 30 j)
create or replace function public.purge_technical_data() returns jsonb
language plpgsql security definer set search_path = public as $$
declare a int; b int; c int;
begin
  delete from rate_limits where window_start < now() - interval '2 days'; get diagnostics a = row_count;
  delete from notifications where status = 'test_sent' and created_at < now() - interval '90 days'; get diagnostics b = row_count;
  delete from payment_webhooks where not signature_valid and received_at < now() - interval '30 days'; get diagnostics c = row_count;
  return jsonb_build_object('rate_limits', a, 'test_notifications', b, 'rejected_webhooks', c);
end $$;

revoke all on function public.expired_drafts(int), public.purge_expired_drafts(uuid[]), public.purge_technical_data() from public, anon, authenticated;
grant execute on function public.expired_drafts(int), public.purge_expired_drafts(uuid[]), public.purge_technical_data() to service_role;
