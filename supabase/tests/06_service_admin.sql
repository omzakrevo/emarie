\set ON_ERROR_STOP on
begin;
create temp table _t (k text primary key, v uuid); grant all on _t to authenticated, anon;
insert into municipalities (slug,name,region,province,reference_prefix) values ('test-a','A','R','P','TSA');
insert into _t select 'mA', id from municipalities where slug='test-a';
select seed_default_services(v), seed_default_roles(v) from _t where k='mA';
insert into _t select 'svc', id from services where municipality_id=(select v from _t where k='mA') and code='certificat_residence';
insert into auth.users (id,email) select ('00000000-0000-0000-0000-0000000000'||x)::uuid, x||'@t.invalid' from unnest(array['c1','c2']) x;
insert into municipality_members (municipality_id, profile_id, role_id)
select (select v from _t where k='mA'), ('00000000-0000-0000-0000-0000000000'||u)::uuid, (select id from roles where municipality_id=(select v from _t where k='mA') and code=rc)
from (values ('c1','admin_commune'),('c2','officier_etat_civil')) x(u,rc);

create or replace function pg_temp.as_user(p text) returns void language plpgsql as $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000'||p, true); end $$;
create or replace function pg_temp.expect(p_sql text, p_msg text) returns void language plpgsql as $$
begin begin execute p_sql; raise exception 'AUCUNE ERREUR (attendu: %) : %', p_msg, p_sql;
 exception when others then if sqlerrm like 'AUCUNE ERREUR%' then raise; end if; assert sqlerrm = p_msg, format('attendu "%s", obtenu "%s"', p_msg, sqlerrm); end; end $$;

set local role authenticated; select pg_temp.as_user('c2');   -- officier : pas pricing.manage
do $$ declare s uuid := (select v from _t where k='svc'); begin
  perform pg_temp.expect(format('select set_service_price(%L, 300)', s), 'forbidden');
  assert (select count(*) from service_pricing)=0;
end $$;

select pg_temp.as_user('c1');   -- admin
do $$ declare s uuid := (select v from _t where k='svc'); n int; begin
  perform set_service_price(s, 500, date '2026-01-01');
  perform set_service_price(s, 700, date '2026-06-01');
  assert (select amount_xof from service_pricing where service_id=s and valid_to is null)=700;
  assert (select valid_to from service_pricing where amount_xof=500)=date '2026-05-31', 'ancien tarif clos la veille';
  assert (select count(*) from service_pricing where service_id=s)=2, 'historique conservé';
  perform pg_temp.expect(format('select set_service_price(%L, -1)', s), 'invalid_input');
  perform pg_temp.expect(format('select set_service_price(%L, 100, date ''2026-03-01'')', s), 'invalid_input');   -- rétroactif refusé
  update service_pricing set amount_xof=1; get diagnostics n=row_count; assert n=0, 'update direct des tarifs';
  delete from service_pricing; get diagnostics n=row_count; assert n=0, 'delete direct des tarifs';
  -- configuration modifiable et auditée
  update services set indicative_delay_days=5 where id=s; get diagnostics n=row_count; assert n=1;
  update service_fields set required=false where service_id=s and key='telephone'; get diagnostics n=row_count; assert n=1;
  insert into service_documents (municipality_id, service_id, key, label) values ((select v from _t where k='mA'), s, 'piece_identite', '{"fr":"Pièce d''identité"}');
  assert (select count(*) from audit_logs where action like 'config_%' and actor_id='00000000-0000-0000-0000-0000000000c1')>=3, 'audit de configuration';
  perform pg_temp.expect(format('delete from service_fields where service_id=%L and key=''nom''', s), 'in_use');
  delete from service_documents where service_id=s and key='piece_identite'; get diagnostics n=row_count; assert n=1, 'suppression d''un justificatif inutilisé';
end $$;
-- justificatif utilisé : non supprimable
reset role;
insert into service_documents (municipality_id, service_id, key, label) values ((select v from _t where k='mA'), (select v from _t where k='svc'), 'piece', '{"fr":"x"}');
insert into applications (id, municipality_id, service_id) values ('00000000-0000-0000-0000-00000000aaaa', (select v from _t where k='mA'), (select v from _t where k='svc'));
insert into application_files (municipality_id, application_id, document_key, storage_path, original_name, mime_type, size_bytes, sha256)
values ((select v from _t where k='mA'), '00000000-0000-0000-0000-00000000aaaa', 'piece', 'p/1', 'f.pdf', 'application/pdf', 10, 'x');
set local role authenticated; select pg_temp.as_user('c1');
do $$ begin perform pg_temp.expect(format('delete from service_documents where service_id=%L and key=''piece''', (select v from _t where k='svc')), 'in_use'); end $$;
-- public : tarif courant lisible, historique et audit non
reset role; set local role anon; select set_config('request.jwt.claim.sub','',true);
do $$ declare s uuid := (select v from _t where k='svc'); begin
  assert (select count(*) from service_pricing where service_id=s)=2, 'tarifs lisibles publiquement (pour l''affichage)';
  assert (select count(*) from audit_logs)=0;
end $$;
rollback;
\echo SERVICE_ADMIN_TESTS_OK
