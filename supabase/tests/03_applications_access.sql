\set ON_ERROR_STOP on
begin;
create temp table _t (k text primary key, v uuid); grant all on _t to authenticated, anon;

insert into municipalities (slug,name,region,province,reference_prefix) values ('test-a','A','R','P','TSA'),('test-b','B','R','P','TSB');
insert into _t select 'mA', id from municipalities where slug='test-a';
insert into _t select 'mB', id from municipalities where slug='test-b';
select seed_default_services((select v from _t where k='mA'));
select seed_default_services((select v from _t where k='mB'));
select seed_default_roles((select v from _t where k='mA'));

insert into auth.users (id) values ('00000000-0000-0000-0000-0000000000a1'),('00000000-0000-0000-0000-0000000000a2'),('00000000-0000-0000-0000-0000000000a3');
-- a1, a2 = citoyens ; a3 = agent de test-a (officier d'état civil)
insert into municipality_members (municipality_id, profile_id, role_id)
  select (select v from _t where k='mA'), '00000000-0000-0000-0000-0000000000a3', id from roles
  where municipality_id=(select v from _t where k='mA') and code='officier_etat_civil';

-- demandes : 1 brouillon de a1 (A), 1 de a2 (A), 1 invité (A), 1 de a1 dans B
insert into applications (id, municipality_id, service_id, profile_id)
select gen_random_uuid(), m.v, (select id from services where municipality_id=m.v and code='certificat_residence'), p.id
from (values ('mA','00000000-0000-0000-0000-0000000000a1'::uuid),('mA','00000000-0000-0000-0000-0000000000a2'),('mA',null),('mB','00000000-0000-0000-0000-0000000000a1')) as x(k,pid)
join _t m on m.k = x.k left join profiles p on p.id = x.pid;
insert into application_data (application_id, municipality_id, data) select id, municipality_id, '{"nom":"FICTIF"}' from applications;
insert into application_events (municipality_id, application_id, to_status, actor_type) select municipality_id, id, 'DRAFT','system' from applications;

do $$ declare n int; begin
  -- Seed : 2 services, champs cohérents, aucun tarif/justificatif inventé
  select count(*) into n from services where municipality_id=(select v from _t where k='mA'); assert n=2;
  assert not exists (select 1 from service_pricing) and not exists (select 1 from service_documents), 'aucun tarif/justificatif par défaut';
  -- idempotence
  perform seed_default_services((select v from _t where k='mA'));
  select count(*) into n from services where municipality_id=(select v from _t where k='mA'); assert n=2;
end $$;

-- Anonyme (invité) : catalogue oui, demandes non
set local role anon; select set_config('request.jwt.claim.sub','',true);
do $$ declare n int; begin
  select count(*) into n from services; assert n>=4, 'catalogue public';
  select count(*) into n from service_fields; assert n>0;
  select count(*) into n from applications; assert n=0, 'anon ne lit aucune demande';
  select count(*) into n from application_data; assert n=0;
  select count(*) into n from application_files; assert n=0;
  select count(*) into n from application_events; assert n=0;
  begin insert into applications (municipality_id, service_id) select municipality_id, id from services limit 1;
    raise exception 'anon a pu créer une demande'; exception when insufficient_privilege then null; end;
  begin perform submit_application(gen_random_uuid(),'x'); raise exception 'anon appelle submit'; exception when insufficient_privilege then null; end;
  begin perform rate_limit_hit('k',1,60); raise exception 'anon appelle rate_limit'; exception when insufficient_privilege then null; end;
end $$;

-- Citoyen a1 : ne voit que ses demandes (A et B), pas celles de a2 ni l'invité
reset role; set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',true);
do $$ declare n int; begin
  select count(*) into n from applications; assert n=2, 'a1 voit 2 demandes, vu '||n;
  select count(*) into n from application_data; assert n=2;
  select count(*) into n from application_events; assert n=2;
  update applications set status='VALIDATED'; get diagnostics n = row_count; assert n=0, 'pas d''écriture directe';
  begin insert into applications (municipality_id, service_id) select municipality_id, id from services limit 1;
    raise exception 'insert direct accepté'; exception when insufficient_privilege then null; end;
end $$;

-- Agent a3 (officier test-a) : voit toutes les demandes de A, aucune de B
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',true);
do $$ declare n int; begin
  select count(*) into n from applications; assert n=3, 'agent A voit 3 demandes, vu '||n;
  select count(*) into n from applications where municipality_id=(select v from _t where k='mB'); assert n=0, 'agent A ne voit pas B';
  begin update services set is_active=false where municipality_id=(select v from _t where k='mA');
    get diagnostics n = row_count; assert n=0, 'officier sans services.manage'; end;
end $$;

-- Soumission (service_role) : référence atomique, statut, événement, jeton purgé
reset role; set local role service_role;
do $$ declare v_id uuid; r1 text; r2 text; st text; begin
  select id into v_id from applications where profile_id is null limit 1;
  r1 := submit_application(v_id, 'hash-secret');
  assert r1 ~ '^TSA-[0-9]{4}-000001$', r1;
  select status into st from applications where id=v_id; assert st='SUBMITTED';
  assert (select count(*) from application_events where application_id=v_id and to_status='SUBMITTED' and actor_type='guest')=1;
  begin perform submit_application(v_id,'x'); raise exception 'double soumission'; exception when raise_exception then
    assert sqlerrm like '%déjà soumise%', sqlerrm; end;
  select id into v_id from applications where profile_id='00000000-0000-0000-0000-0000000000a2';
  r2 := submit_application(v_id,'h2'); assert r2 ~ '000002$', r2;
  -- limitation de débit : 3 autorisés puis refus
  assert rate_limit_hit('t:1',3,60) and rate_limit_hit('t:1',3,60) and rate_limit_hit('t:1',3,60), 'trois premiers';
  assert not rate_limit_hit('t:1',3,60), 'quatrième refusé';
  assert rate_limit_hit('t:2',3,60), 'autre clé indépendante';
end $$;
-- Une demande non DRAFT doit avoir une référence
reset role;
do $$ begin
  begin update applications set status='PAID', reference=null where reference is not null;
    raise exception 'statut sans référence accepté'; exception when check_violation then null; end;
end $$;
-- Historique en ajout seul ; suppression en cascade autorisée
do $$ declare n int; begin
  begin update application_events set to_status='PAID'; raise exception 'update accepté'; exception when raise_exception then
    assert sqlerrm like '%ajout seul%', sqlerrm; end;
  begin delete from application_events; raise exception 'delete accepté'; exception when raise_exception then
    assert sqlerrm like '%ajout seul%', sqlerrm; end;
  delete from applications where reference is null and profile_id='00000000-0000-0000-0000-0000000000a1';
  get diagnostics n = row_count; assert n=2, 'cascade OK';
end $$;
-- Intégrité inter-communes : service d'une autre commune refusé
do $$ begin
  begin insert into applications (municipality_id, service_id)
    values ((select v from _t where k='mA'), (select id from services where municipality_id=(select v from _t where k='mB') limit 1));
    raise exception 'service croisé accepté'; exception when foreign_key_violation then null; end;
end $$;
rollback;
\echo APPLICATIONS_TESTS_OK
