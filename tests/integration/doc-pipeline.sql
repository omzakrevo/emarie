\set ON_ERROR_STOP on
begin;
create temp table _t (k text primary key, v uuid); grant all on _t to authenticated;
insert into municipalities (slug,name,region,province,reference_prefix) values ('pipe','Commune Pipeline','Région P','Province P','PIP');
insert into _t select 'm', id from municipalities where slug='pipe';
select seed_default_services(v), seed_default_roles(v), seed_default_templates(v) from _t where k='m';
insert into auth.users (id,email) values ('00000000-0000-0000-0000-0000000000e1','e1@t.invalid');
insert into municipality_members (municipality_id, profile_id, role_id)
  select (select v from _t where k='m'), '00000000-0000-0000-0000-0000000000e1', id from roles where municipality_id=(select v from _t where k='m') and code='admin_commune';
insert into applications (id, municipality_id, service_id, status, reference, submitted_at)
  select '00000000-0000-0000-0000-00000000f001', (select v from _t where k='m'), id, 'VALIDATED', 'PIP-2026-000001', now() from services where municipality_id=(select v from _t where k='m') and code='extrait_naissance';
insert into application_data values ('00000000-0000-0000-0000-00000000f001', (select v from _t where k='m'), '{"nom":"DECLARENOM","prenoms":"Declare","date_naissance":"2000-01-01","lieu_naissance":"LieuDeclare"}');
insert into civil_registry_checks (municipality_id, application_id, outcome, registry_ref, registry_data, checked_by)
  values ((select v from _t where k='m'), '00000000-0000-0000-0000-00000000f001', 'found', 'REGREF-777',
  '{"nom":"REGISTRENOM","prenoms":"Officiel","sexe":"F","date_naissance":"1999-12-31","lieu_naissance":"LieuRegistre","nom_pere":"Pere Registre"}', '00000000-0000-0000-0000-0000000000e1');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000e1',true) \g /dev/null
select 'JSON:' || prepare_document('00000000-0000-0000-0000-00000000f001')::text;
rollback;
