\set ON_ERROR_STOP on
begin;
insert into municipalities (slug,name,region,province,reference_prefix) values ('ret','Commune R','R','P','RET');
select seed_default_services(id) from municipalities where slug='ret';
create temp table _t (k text primary key, v uuid); grant all on _t to service_role;
create or replace function pg_temp.mk(p_status text, p_expires timestamptz, p_ref text) returns uuid language plpgsql as $$
declare nid uuid := gen_random_uuid(); m uuid := (select id from municipalities where slug='ret'); begin
  insert into applications (id, municipality_id, service_id, status, draft_expires_at, reference, submitted_at)
  values (nid, m, (select id from services where municipality_id=m and code='certificat_residence'), p_status, p_expires, p_ref, case when p_ref is null then null else now() end);
  insert into application_data values (nid, m, '{"nom":"FICTIF"}');
  insert into application_events (municipality_id, application_id, to_status, actor_type) values (m, nid, p_status, 'system');
  insert into application_files (municipality_id, application_id, document_key, storage_path, original_name, mime_type, size_bytes, sha256)
  values (m, nid, 'piece', 'ret/'||nid||'/f.pdf', 'f.pdf', 'application/pdf', 10, 'x');
  return nid; end $$;
insert into _t values ('old', pg_temp.mk('DRAFT', now() - interval '1 day', null));
insert into _t values ('fresh', pg_temp.mk('DRAFT', now() + interval '10 days', null));
insert into _t values ('sent_old', pg_temp.mk('SUBMITTED', now() - interval '99 days', 'RET-2026-000001'));   -- jamais purgé, même avec une échéance dépassée
insert into rate_limits values ('old-key', now() - interval '3 days', 5), ('new-key', now(), 1);
insert into payment_webhooks (provider, event_id, signature_valid, payload, received_at) values ('sandbox','invalid:1',false,'{}', now() - interval '40 days'), ('sandbox','invalid:2',false,'{}', now() - interval '1 day'), ('sandbox','ok:1',true,'{}', now() - interval '400 days');

grant usage on schema public to service_role;
set local role service_role;
do $$ declare ids uuid[]; n int; paths int; j jsonb; begin
  select array_agg(distinct application_id), count(storage_path) into ids, paths from expired_drafts(100);
  assert cardinality(ids)=1 and ids[1]=(select v from _t where k='old'), 'seul le brouillon expiré est listé';
  assert paths=1, 'ses fichiers sont listés pour suppression du stockage';
  n := purge_expired_drafts(array[(select v from _t where k='old'), (select v from _t where k='fresh'), (select v from _t where k='sent_old')]);
  assert n=1, 'un seul brouillon purgé (le non expiré et le dossier déposé sont protégés) : '||n;
  assert (select count(*) from applications where id in (select v from _t))=2;
  assert not exists (select 1 from application_data where application_id=(select v from _t where k='old')), 'cascade données';
  assert not exists (select 1 from application_files where application_id=(select v from _t where k='old')), 'cascade fichiers';
  assert not exists (select 1 from application_events where application_id=(select v from _t where k='old')), 'cascade historique (autorisée)';
  assert exists (select 1 from application_events where application_id=(select v from _t where k='sent_old')), 'historique du dossier déposé conservé';
  j := purge_technical_data();
  assert (j->>'rate_limits')::int=1 and (j->>'rejected_webhooks')::int=1, j::text;
  assert exists (select 1 from payment_webhooks where event_id='ok:1'), 'un webhook valide n''est jamais purgé';
end $$;
reset role; set local role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000f1',true);
do $$ begin
  begin perform purge_expired_drafts(array[gen_random_uuid()]); raise exception 'authenticated a pu purger'; exception when insufficient_privilege then null; end;
  begin perform purge_technical_data(); raise exception 'authenticated a pu purger'; exception when insufficient_privilege then null; end;
end $$;
reset role; set local role anon;
do $$ begin begin perform * from expired_drafts(1); raise exception 'anon'; exception when insufficient_privilege then null; end; end $$;
rollback;
\echo RETENTION_TESTS_OK
