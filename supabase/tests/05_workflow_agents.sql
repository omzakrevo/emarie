\set ON_ERROR_STOP on
begin;
create temp table _t (k text primary key, v uuid); grant all on _t to authenticated, anon;
create temp table _r (k text primary key, v text); grant all on _r to authenticated, anon;

insert into municipalities (slug,name,region,province,reference_prefix) values ('test-a','A','R','P','TSA'),('test-b','B','R','P','TSB');
insert into _t select 'mA', id from municipalities where slug='test-a';
insert into _t select 'mB', id from municipalities where slug='test-b';
select seed_default_services(v), seed_default_roles(v) from _t where k in ('mA','mB');

-- utilisateurs : admin(a), officier(b), accueil(c), secrétaire(d), agent d'une autre commune(e), citoyen(f)
insert into auth.users (id,email) select ('00000000-0000-0000-0000-0000000000'||x)::uuid, x||'@test.invalid' from unnest(array['b1','b2','b3','b4','b5','b6']) x;
insert into municipality_members (municipality_id, profile_id, role_id)
select (select v from _t where k = case when u in ('b5') then 'mB' else 'mA' end),
       ('00000000-0000-0000-0000-0000000000'||u)::uuid,
       (select id from roles where municipality_id=(select v from _t where k = case when u='b5' then 'mB' else 'mA' end) and code=rc)
from (values ('b1','admin_commune'),('b2','officier_etat_civil'),('b3','agent_accueil'),('b4','secretaire_general'),('b5','admin_commune')) x(u,rc);

-- demandes (service_role simulé par superuser) : 1 résidence, 1 naissance, en SUBMITTED
insert into applications (id, municipality_id, service_id, status, reference, submitted_at)
select gen_random_uuid(), (select v from _t where k='mA'), s.id, 'SUBMITTED', 'TSA-2026-00000'||row_number() over (), now()
from services s where s.municipality_id=(select v from _t where k='mA');
insert into _t select 'res', a.id from applications a join services s on s.id=a.service_id where s.code='certificat_residence' and a.municipality_id=(select v from _t where k='mA');
insert into _t select 'nai', a.id from applications a join services s on s.id=a.service_id where s.code='extrait_naissance' and a.municipality_id=(select v from _t where k='mA');
insert into application_data select id, municipality_id, '{"nom":"FICTIF"}' from applications;

create or replace function pg_temp.as_user(p text) returns void language plpgsql as $$ begin
  perform set_config('request.jwt.claim.sub', ('00000000-0000-0000-0000-0000000000'||p), true); end $$;
create or replace function pg_temp.expect(p_sql text, p_msg text) returns void language plpgsql as $$
begin
  begin execute p_sql; raise exception 'AUCUNE ERREUR (attendu: %) : %', p_msg, p_sql;
  exception when others then
    if sqlerrm like 'AUCUNE ERREUR%' then raise; end if;
    assert sqlerrm = p_msg, format('attendu "%s", obtenu "%s" pour: %s', p_msg, sqlerrm, p_sql);
  end;
end $$;
grant execute on function pg_temp.as_user(text), pg_temp.expect(text,text) to authenticated;
-- (pg_temp.* nécessite un accès : on s'en tient à la session courante ci-dessous)

set local role authenticated;
select pg_temp.as_user('b2'); -- officier
do $$ declare res uuid := (select v from _t where k='res'); nai uuid := (select v from _t where k='nai'); begin
  -- sans l'option skip_payment : aucune instruction possible
  perform pg_temp.expect(format('select agent_transition(%L,''UNDER_REVIEW'')', res), 'payment_required');
end $$;

reset role;
insert into municipality_settings values ((select v from _t where k='mA'),'workflow.skip_payment','{"enabled": true}');
set local role authenticated; select pg_temp.as_user('b2');

do $$ declare res uuid := (select v from _t where k='res'); nai uuid := (select v from _t where k='nai'); n int; begin
  perform agent_transition(res,'UNDER_REVIEW');
  assert (select status from applications where id=res)='UNDER_REVIEW';
  assert (select count(*) from application_events where application_id=res and actor_type='agent' and to_status='UNDER_REVIEW')=1;
  -- transitions invalides / désactivées (Phase 5)
  perform pg_temp.expect(format('select agent_transition(%L,''WITHDRAWN'')', res), 'transition_not_allowed');
  perform pg_temp.expect(format('select agent_transition(%L,''DOCUMENT_GENERATED'')', res), 'transition_not_allowed');
  -- motifs obligatoires
  perform pg_temp.expect(format('select agent_transition(%L,''REJECTED'')', res), 'note_required');
  perform pg_temp.expect(format('select agent_transition(%L,''ADDITIONAL_INFO_REQUIRED'','' '')', res), 'note_required');
  perform agent_transition(res,'ADDITIONAL_INFO_REQUIRED','Merci de préciser le quartier.');
  assert (select public_note from application_events where application_id=res and to_status='ADDITIONAL_INFO_REQUIRED')='Merci de préciser le quartier.';
  perform agent_transition(res,'UNDER_REVIEW');
  perform agent_transition(res,'VALIDATED');
  assert (select status from applications where id=res)='VALIDATED';

  -- Extrait de naissance : validation impossible sans vérification au registre
  perform agent_transition(nai,'UNDER_REVIEW');
  perform pg_temp.expect(format('select agent_transition(%L,''VALIDATED'')', nai), 'registry_check_required');
  perform pg_temp.expect(format('select record_registry_check(%L,''found'','''')', nai), 'invalid_input');           -- numéro obligatoire
  perform record_registry_check(nai,'not_found',null,'Aucun acte correspondant');
  perform pg_temp.expect(format('select agent_transition(%L,''VALIDATED'')', nai), 'registry_check_required');      -- dernier résultat = introuvable
  perform record_registry_check(nai,'found','REG-FICTIF-123');
  perform agent_transition(nai,'VALIDATED');
  assert (select status from applications where id=nai)='VALIDATED';
  perform pg_temp.expect(format('select record_registry_check(%L,''found'',''X'')', res), 'invalid_input');          -- pas un extrait de naissance
  -- ajout seul : sans politique UPDATE/DELETE, la RLS laisse 0 ligne modifiable (le trigger protège en plus le propriétaire)
  update civil_registry_checks set outcome='found'; get diagnostics n = row_count; assert n=0, 'registry modifiable';
  update application_events set to_status='PAID'; get diagnostics n = row_count; assert n=0, 'events modifiables';
  delete from application_events; get diagnostics n = row_count; assert n=0, 'events supprimables';
  update audit_logs set action='x'; get diagnostics n = row_count; assert n=0, 'audit modifiable';
  select count(*) into n from audit_logs where action='transition'; assert n=0, 'officier sans audit.read : '||n;
end $$;

-- Agent d'accueil : peut lire/instruire mais ni rejeter, ni valider, ni vérifier le registre
reset role; update applications set status='UNDER_REVIEW' where id=(select v from _t where k='res');
set local role authenticated; select pg_temp.as_user('b3');
do $$ declare res uuid := (select v from _t where k='res'); begin
  perform pg_temp.expect(format('select agent_transition(%L,''REJECTED'',''non'')', res), 'forbidden');
  perform pg_temp.expect(format('select agent_transition(%L,''VALIDATED'')', res), 'forbidden');
  perform pg_temp.expect(format('select record_registry_check(%L,''found'',''X'')', (select v from _t where k='nai')), 'forbidden');
  insert into application_notes (municipality_id, application_id, author_id, body)
    values ((select v from _t where k='mA'), res, '00000000-0000-0000-0000-0000000000b3', 'Pièce illisible (observation interne)');
  begin insert into application_notes (municipality_id, application_id, author_id, body)
    values ((select v from _t where k='mA'), res, '00000000-0000-0000-0000-0000000000b2', 'usurpation'); raise exception 'usurpation acceptée';
  exception when insufficient_privilege then null; end;
end $$;

-- Agent d'une autre commune : ne voit rien, ne peut rien
select pg_temp.as_user('b5');
do $$ declare res uuid := (select v from _t where k='res'); begin
  assert (select count(*) from applications)=0;
  assert (select count(*) from application_notes)=0;
  perform pg_temp.expect(format('select agent_transition(%L,''VALIDATED'')', res), 'not_found');
  perform pg_temp.expect(format('select dashboard_stats(%L)', (select v from _t where k='mA')), 'forbidden');
end $$;
-- Citoyen / anonyme
select pg_temp.as_user('b6');
do $$ declare res uuid := (select v from _t where k='res'); begin
  perform pg_temp.expect(format('select agent_transition(%L,''VALIDATED'')', res), 'not_found');
  perform pg_temp.expect(format('select dashboard_stats(%L)', (select v from _t where k='mA')), 'forbidden');
  assert (select count(*) from application_notes)=0;
end $$;
reset role; set local role anon; select set_config('request.jwt.claim.sub','',true);
do $$ begin
  begin perform agent_transition(gen_random_uuid(),'VALIDATED'); raise exception 'anon a pu agir'; exception when insufficient_privilege then null; end;
end $$;

-- Gestion des agents
reset role; set local role authenticated; select pg_temp.as_user('b4'); -- secrétaire : pas agents.manage
do $$ declare mA uuid := (select v from _t where k='mA'); begin
  perform pg_temp.expect(format('select add_member(%L,%L,%L)', mA, '00000000-0000-0000-0000-0000000000b6', (select id from roles where municipality_id=mA and code='caissier')), 'forbidden');
end $$;
reset role; -- donner agents.manage à la secrétaire pour tester l'escalade
insert into role_permissions (role_id, municipality_id, permission_code)
select id, municipality_id, 'agents.manage' from roles where municipality_id=(select v from _t where k='mA') and code='secretaire_general';
set local role authenticated; select pg_temp.as_user('b4');
do $$ declare mA uuid := (select v from _t where k='mA'); adm uuid := (select id from roles where municipality_id=mA and code='admin_commune'); cais uuid := (select id from roles where municipality_id=mA and code='caissier'); mid uuid; begin
  -- escalade : la secrétaire ne peut pas créer d'admin ni toucher à un admin
  perform pg_temp.expect(format('select add_member(%L,%L,%L)', mA, '00000000-0000-0000-0000-0000000000b6', adm), 'role_escalation');
  perform pg_temp.expect(format('select set_member_role(%L,%L)', (select id from municipality_members where profile_id='00000000-0000-0000-0000-0000000000b1'), cais), 'role_escalation');
  perform pg_temp.expect(format('select set_member_active(%L,false)', (select id from municipality_members where profile_id='00000000-0000-0000-0000-0000000000b1')), 'role_escalation');
  assert not can_assign_role(mA, adm) and can_assign_role(mA, cais), 'can_assign_role';
  -- rôle d'une autre commune refusé
  perform pg_temp.expect(format('select add_member(%L,%L,%L)', mA, '00000000-0000-0000-0000-0000000000b6', (select id from roles where municipality_id=(select v from _t where k='mB') limit 1)), 'invalid_input');
  -- autorisé : rôle dans son périmètre
  mid := add_member(mA, '00000000-0000-0000-0000-0000000000b6', cais);
  assert (select role_id from municipality_members where id=mid)=cais;
  perform set_member_active(mid,false);
  assert not (select is_active from municipality_members where id=mid);
  -- écriture directe interdite
  declare n int; begin
    update municipality_members set role_id=adm where id=mid; get diagnostics n = row_count;
    assert n=0, 'update direct sur municipality_members accepté ('||n||' ligne)';
    delete from municipality_members where id=mid; get diagnostics n = row_count;
    assert n=0, 'delete direct sur municipality_members accepté';
  end;
  begin insert into municipality_members (municipality_id, profile_id, role_id) values (mA,'00000000-0000-0000-0000-0000000000b3',adm);
    raise exception 'insert direct accepté'; exception when insufficient_privilege or unique_violation then null; end;
end $$;
-- Dernier administrateur protégé
select pg_temp.as_user('b1');
do $$ declare mA uuid := (select v from _t where k='mA'); self uuid := (select id from municipality_members where profile_id='00000000-0000-0000-0000-0000000000b1'); begin
  perform pg_temp.expect(format('select set_member_active(%L,false)', self), 'last_admin');
  perform pg_temp.expect(format('select set_member_role(%L,%L)', self, (select id from roles where municipality_id=mA and code='caissier')), 'last_admin');
end $$;

-- Statistiques
reset role; set local role authenticated; select pg_temp.as_user('b1');
do $$ declare mA uuid := (select v from _t where k='mA'); j jsonb; begin
  j := dashboard_stats(mA);
  assert (j->'by_status'->>'VALIDATED')::int=1 and (j->'by_status'->>'UNDER_REVIEW')::int=1, j::text;
  assert jsonb_array_length(j->'by_service')=2;
  assert (j->'payments_total_xof') = 'null'::jsonb, 'aucun montant de paiement inventé';
  j := dashboard_stats(mA, current_date+1, null, null); assert j->'by_status' = '{}'::jsonb, 'filtre de dates';
  j := dashboard_stats(mA, null, null, (select id from services where municipality_id=mA and code='extrait_naissance'));
  assert jsonb_array_length(j->'by_service')=1 and (j->'by_status'->>'VALIDATED')::int=1, j::text;
  -- audit lisible par l'admin
  assert (select count(*) from audit_logs where action='transition')>=5;
end $$;
-- Rôles : modification contrôlée
reset role; insert into role_permissions (role_id, municipality_id, permission_code)
  select id, municipality_id, 'roles.manage' from roles where municipality_id=(select v from _t where k='mA') and code='secretaire_general';
set local role authenticated; select pg_temp.as_user('b4');
do $$ declare mA uuid := (select v from _t where k='mA'); cais uuid := (select id from roles where municipality_id=mA and code='caissier'); n int; begin
  perform set_role_permission(cais, 'documents.print', true);                      -- permission que la secrétaire possède
  assert exists (select 1 from role_permissions where role_id=cais and permission_code='documents.print');
  perform set_role_permission(cais, 'documents.print', false);
  assert not exists (select 1 from role_permissions where role_id=cais and permission_code='documents.print');
  perform pg_temp.expect(format('select set_role_permission(%L,''payments.refund'',true)', cais), 'role_escalation');   -- qu'elle ne possède pas
  perform pg_temp.expect(format('select set_role_permission(%L,''documents.print'',false)', (select id from roles where municipality_id=mA and code='admin_commune')), 'role_escalation');
  perform pg_temp.expect(format('select set_role_permission(%L,''inconnue'',true)', cais), 'invalid_input');
  delete from role_permissions where role_id=cais; get diagnostics n = row_count; assert n=0, 'écriture directe role_permissions';
  delete from roles where id=cais; get diagnostics n = row_count; assert n=0, 'suppression directe de rôle';
end $$;
select pg_temp.as_user('b3'); -- agent d'accueil : pas roles.manage
do $$ begin perform pg_temp.expect(format('select set_role_permission(%L,''documents.print'',true)', (select id from roles where municipality_id=(select v from _t where k='mA') and code='caissier')), 'forbidden'); end $$;
rollback;
\echo WORKFLOW_TESTS_OK
