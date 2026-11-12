\set ON_ERROR_STOP on
begin;
create temp table _t (k text primary key, v uuid); grant all on _t to authenticated, anon;
insert into municipalities (slug,name,region,province,reference_prefix) values ('test-a','Commune A','Région A','Province A','TSA'),('test-b','Commune B','R','P','TSB');
insert into _t select 'mA', id from municipalities where slug='test-a'; insert into _t select 'mB', id from municipalities where slug='test-b';
select seed_default_services(v), seed_default_roles(v), seed_default_templates(v) from _t where k in ('mA','mB');
insert into auth.users (id,email) select ('00000000-0000-0000-0000-0000000000'||x)::uuid, x||'@t.invalid' from unnest(array['d1','d2','d3']) x;
insert into municipality_members (municipality_id, profile_id, role_id)
select (select v from _t where k=m), ('00000000-0000-0000-0000-0000000000'||u)::uuid, (select id from roles where municipality_id=(select v from _t where k=m) and code=rc)
from (values ('mA','d1','admin_commune'),('mA','d2','agent_accueil'),('mB','d3','admin_commune')) x(m,u,rc);

create or replace function pg_temp.as_user(p text) returns void language plpgsql as $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000'||p, true); end $$;
create or replace function pg_temp.expect(p_sql text, p_msg text) returns void language plpgsql as $$
begin begin execute p_sql; raise exception 'AUCUNE ERREUR (attendu: %) : %', p_msg, p_sql;
 exception when others then if sqlerrm like 'AUCUNE ERREUR%' then raise; end if; assert sqlerrm = p_msg, format('attendu "%s", obtenu "%s" pour %s', p_msg, sqlerrm, p_sql); end; end $$;
create or replace function pg_temp.mkapp(p_code text, p_ref text, p_status text, p_data jsonb) returns uuid language plpgsql as $$
declare nid uuid := gen_random_uuid(); m uuid := (select t.v from _t t where t.k='mA'); begin
  insert into applications (id, municipality_id, service_id, status, reference, submitted_at) values (nid, m, (select id from services where municipality_id=m and code=p_code), p_status, p_ref, now());
  insert into application_data values (nid, m, p_data); return nid; end $$;

-- Modèles provisoires présents, publiés, une seule version publiée par modèle
do $$ begin
  assert (select count(*) from document_template_versions where status='published' and is_provisional and municipality_id in (select v from _t))=4, 'modèles provisoires publiés (2 communes x 2)';
end $$;

insert into _t select 'x', pg_temp.mkapp('certificat_residence','TSA-2026-900001','VALIDATED','{"nom":"FICTIF","prenoms":"Test","domicile":"Quartier fictif","date_naissance":"1990-05-17"}');
insert into _t select 'y', pg_temp.mkapp('certificat_residence','TSA-2026-900002','VALIDATED','{"nom":"FICTIF2"}');
insert into _t select 'z', pg_temp.mkapp('extrait_naissance','TSA-2026-900003','VALIDATED','{"nom":"DECLARE","prenoms":"Declare","date_naissance":"2000-01-01","lieu_naissance":"Declare"}');
insert into civil_registry_checks (municipality_id, application_id, outcome, registry_ref, registry_data, checked_by)
values ((select v from _t where k='mA'), (select v from _t where k='z'), 'found', 'REG-TEST-42', '{"nom":"REGISTRE","prenoms":"Officiel","date_naissance":"1999-12-31","lieu_naissance":"Ville du registre"}', '00000000-0000-0000-0000-0000000000d1');

set local role authenticated; select pg_temp.as_user('d2');   -- agent d'accueil
do $$ begin
  perform pg_temp.expect(format('select prepare_document(%L)', (select v from _t where k='x')), 'forbidden');
end $$;

select pg_temp.as_user('d1');   -- admin
do $$ declare j jsonb; j2 jsonb; id1 uuid; begin
  j := prepare_document((select v from _t where k='x')); id1 := (j->>'document_id')::uuid;
  assert j->'snapshot'->>'document_number' ~ '^TSA-CR-[0-9]{4}-000001$', j::text;
  assert j->'snapshot'->>'commune'='Commune A' and j->'snapshot'->>'nom'='FICTIF' and (j->>'is_specimen')::boolean, j::text;
  j2 := prepare_document((select v from _t where k='x'));
  assert (j2->>'document_id')::uuid = id1 and j2->'snapshot'->>'document_number' = j->'snapshot'->>'document_number', 'reprise : même document et même numéro (pas de trou)';
  perform pg_temp.expect(format('select mark_printed(%L)', id1), 'not_found');                       -- pas encore finalisé
  perform finalize_document(id1, 'a/b/c.pdf', repeat('a',64));
  assert (select status from applications where id=(select v from _t where k='x'))='DOCUMENT_GENERATED';
  perform pg_temp.expect(format('select finalize_document(%L, ''x'', %L)', id1, repeat('b',64)), 'invalid_input');
  -- ordre imposé
  perform pg_temp.expect(format('select hand_to_signer(%L)', id1), 'transition_not_allowed');
  perform pg_temp.expect(format('select confirm_signature(%L,''Nom Signataire'',''Maire'')', id1), 'transition_not_allowed');
  perform mark_printed(id1); perform hand_to_signer(id1);
  assert (select status from applications where id=(select v from _t where k='x'))='PENDING_SIGNATURE';
  perform pg_temp.expect(format('select confirm_signature(%L,''A'','''')', id1), 'invalid_input');
  perform confirm_signature(id1, 'Nom Signataire', 'Le Maire');
  assert (select status from applications where id=(select v from _t where k='x'))='SIGNED';
  assert (select locked_at is not null from issued_documents where id=id1);
  assert (select count(*) from signatures where issued_document_id=id1)=1;
  -- immuabilité après signature (même pour un utilisateur avec droits ; ici via SQL direct en tant que propriétaire de la fonction)
  perform pg_temp.expect(format('select discard_document(%L,''raison'')', id1), 'document_locked');
  -- un modèle provisoire ne produit pas de document « prêt au retrait »
  perform pg_temp.expect(format('select release_document(%L)', id1), 'specimen_not_releasable');
  assert (select count(*) from application_events where application_id=(select v from _t where k='x') and actor_type='agent')=4, 'événements historisés';
end $$;
reset role;
do $$ begin
  begin update issued_documents set document_number='X' where application_id=(select v from _t where k='x'); raise exception 'document signé modifié';
  exception when others then assert sqlerrm='document_locked', sqlerrm; end;
  begin delete from issued_documents where application_id=(select v from _t where k='x'); raise exception 'document signé supprimé';
  exception when others then assert sqlerrm='document_locked', sqlerrm; end;
end $$;

-- Modèle : brouillon -> version officielle ; versions publiées immuables ; une seule publiée
set local role authenticated; select pg_temp.as_user('d1');
do $$ declare mA uuid := (select v from _t where k='mA'); t uuid := (select id from document_templates where municipality_id=(select v from _t where k='mA') and code='certificat_residence'); v2 uuid; n int; begin
  insert into document_template_versions (municipality_id, template_id, version, content, created_by)
    select mA, t, 2, content, '00000000-0000-0000-0000-0000000000d1' from document_template_versions where template_id=t and version=1 returning id into v2;
  update document_template_versions set content = jsonb_set(content, '{title}', '"CERTIFICAT DE RÉSIDENCE (V2)"') where id=v2; get diagnostics n=row_count; assert n=1, 'brouillon modifiable';
  begin update document_template_versions set status='published' where id=v2; raise exception 'publication directe acceptée';
  exception when insufficient_privilege then null; end;
  update document_template_versions set content='{}' where template_id=t and version=1; get diagnostics n=row_count; assert n=0, 'version publiée non modifiable (RLS)';
  perform pg_temp.as_user('d2');
  perform pg_temp.expect(format('select publish_template_version(%L,true)', v2), 'forbidden');
  perform pg_temp.as_user('d1');
  perform publish_template_version(v2, true);
  assert (select count(*) from document_template_versions where template_id=t and status='published')=1;
  assert (select status from document_template_versions where template_id=t and version=1)='archived', 'ancienne version archivée';
  assert (select not is_provisional and validated_by is not null from document_template_versions where id=v2), 'validation officielle tracée';
  perform pg_temp.expect(format('select publish_template_version(%L,true)', v2), 'transition_not_allowed');
end $$;
reset role;
do $$ declare t uuid := (select id from document_templates where municipality_id=(select v from _t where k='mA') and code='certificat_residence'); begin
  begin update document_template_versions set content='{"x":1}' where template_id=t and version=2; raise exception 'version publiée modifiée'; exception when others then assert sqlerrm='document_locked', sqlerrm; end;
  begin delete from document_template_versions where template_id=t and version=1; raise exception 'version archivée supprimée'; exception when others then assert sqlerrm='document_locked', sqlerrm; end;
end $$;

-- Parcours complet avec le modèle officiel : régénération avant signature, retrait avec identité
set local role authenticated; select pg_temp.as_user('d1');
do $$ declare j jsonb; d uuid; d2 uuid; begin
  j := prepare_document((select v from _t where k='y')); d := (j->>'document_id')::uuid;
  assert not (j->>'is_specimen')::boolean and (j->>'template_version')::int = 2, 'version du modèle conservée : '||j::text;
  assert j->'snapshot'->>'document_number' ~ '000002$';
  perform finalize_document(d, 'p/1.pdf', repeat('c',64)); perform mark_printed(d);
  perform pg_temp.expect(format('select discard_document(%L,'' '')', d), 'note_required');
  perform discard_document(d, 'Erreur de saisie');                                    -- avant signature : autorisé
  assert (select status from applications where id=(select v from _t where k='y'))='VALIDATED' and (select status from issued_documents where id=d)='superseded';
  j := prepare_document((select v from _t where k='y')); d2 := (j->>'document_id')::uuid; assert d2 <> d;
  assert j->'snapshot'->>'document_number' ~ '000002$', 'numéro conservé à la régénération : '||j::text;
  perform finalize_document(d2, 'p/2.pdf', repeat('d',64)); perform mark_printed(d2); perform hand_to_signer(d2);
  perform confirm_signature(d2, 'Signataire Fictif', 'Le Maire'); perform release_document(d2);
  assert (select status from applications where id=(select v from _t where k='y'))='READY_FOR_PICKUP';
  perform pg_temp.as_user('d2');                                                       -- l'agent d'accueil enregistre le retrait
  perform pg_temp.expect(format('select record_withdrawal(%L,''Jean Fictif'',''Lui-même'',''cnib'',''B1234567'',false)', d2), 'verification_required');
  perform pg_temp.expect(format('select record_withdrawal(%L,''J'',''Lui-même'',''cnib'',''B1234567'',true)', d2), 'invalid_input');
  perform record_withdrawal(d2, 'Jean Fictif', 'Lui-même', 'cnib', 'B1234567', true);
  assert (select status from applications where id=(select v from _t where k='y'))='WITHDRAWN';
  assert (select id_number_last4 from withdrawals where issued_document_id=d2)='4567', 'seuls les 4 derniers caractères conservés';
  perform pg_temp.expect(format('select record_withdrawal(%L,''Jean Fictif'',''Lui-même'',''cnib'',''B1234567'',true)', d2), 'transition_not_allowed');
  assert (select count(*) from withdrawals)=1;
end $$;

-- Extrait : le document reprend le REGISTRE, jamais le déclaré ; numéro d'acte = celui du registre
select pg_temp.as_user('d1');
do $$ declare j jsonb; begin
  j := prepare_document((select v from _t where k='z'));
  assert j->'snapshot'->>'nom'='REGISTRE' and j->'snapshot'->>'prenoms'='Officiel' and j->'snapshot'->>'lieu_naissance'='Ville du registre', 'données du registre : '||j::text;
  assert j->'snapshot'->>'numero_acte'='REG-TEST-42' and j->'snapshot'->>'document_number'='REG-TEST-42', 'numéro du registre';
  assert not (j->'snapshot') ? 'DECLARE' and j->'snapshot'->>'nom' <> 'DECLARE';
end $$;

-- Isolation : agent d'une autre commune
select pg_temp.as_user('d3');
do $$ begin
  perform pg_temp.expect(format('select prepare_document(%L)', (select v from _t where k='z')), 'not_found');
  assert (select count(*) from issued_documents)=0 and (select count(*) from document_template_versions where municipality_id=(select v from _t where k='mA'))=0;
end $$;
-- Citoyen anonyme
reset role;
do $$ begin assert (select last_value from numbering_counters where kind='doc_CR' and municipality_id=(select v from _t where k='mA'))=2, 'seuls 2 numéros de certificat consommés ; aucun pour l''extrait'; end $$; set local role anon; select set_config('request.jwt.claim.sub','',true);
do $$ begin
  assert (select count(*) from issued_documents)=0 and (select count(*) from document_template_versions)=0 and (select count(*) from withdrawals)=0 and (select count(*) from signatures)=0;
  begin perform prepare_document(gen_random_uuid()); raise exception 'anon'; exception when insufficient_privilege then null; end;
end $$;
rollback;
\echo DOCUMENTS_TESTS_OK
