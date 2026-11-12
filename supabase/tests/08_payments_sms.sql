\set ON_ERROR_STOP on
begin;
create temp table _t (k text primary key, v uuid); grant all on _t to authenticated, anon, service_role;
insert into municipalities (slug,name,region,province,reference_prefix) values ('test-a','Commune A','R','P','TSA'),('test-b','Commune B','R','P','TSB');
insert into _t select 'mA', id from municipalities where slug='test-a'; insert into _t select 'mB', id from municipalities where slug='test-b';
select seed_default_services(v), seed_default_roles(v), seed_default_notification_templates(v) from _t where k in ('mA','mB');
insert into auth.users (id,email) select ('00000000-0000-0000-0000-0000000000'||x)::uuid, x||'@t.invalid' from unnest(array['a1','a2','a3','a4']) x;
insert into municipality_members (municipality_id, profile_id, role_id)
select (select v from _t where k=m), ('00000000-0000-0000-0000-0000000000'||u)::uuid, (select id from roles where municipality_id=(select v from _t where k=m) and code=rc)
from (values ('mA','a1','admin_commune'),('mA','a2','caissier'),('mA','a3','admin_commune'),('mB','a4','admin_commune')) x(m,u,rc);
insert into payment_provider_configs (municipality_id, provider, enabled) values ((select v from _t where k='mA'),'sandbox',true),((select v from _t where k='mA'),'orange_money',false);

create or replace function pg_temp.as_user(p text) returns void language plpgsql as $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000'||p, true); end $$;
create or replace function pg_temp.expect(p_sql text, p_msg text) returns void language plpgsql as $$
begin begin execute p_sql; raise exception 'AUCUNE ERREUR (attendu: %) : %', p_msg, p_sql;
 exception when others then if sqlerrm like 'AUCUNE ERREUR%' then raise; end if; assert sqlerrm = p_msg, format('attendu "%s", obtenu "%s" pour %s', p_msg, sqlerrm, p_sql); end; end $$;
create or replace function pg_temp.mkapp(p_ref text, p_phone text) returns uuid language plpgsql as $$
declare nid uuid := gen_random_uuid(); m uuid := (select t.v from _t t where t.k='mA'); begin
  insert into applications (id, municipality_id, service_id, status, reference, submitted_at, contact_phone)
  values (nid, m, (select id from services where municipality_id=m and code='certificat_residence'), 'DRAFT', null, null, p_phone);
  insert into application_data values (nid, m, '{"nom":"FICTIF"}'); return nid; end $$;

-- Candidature soumise via la fonction officielle (déclenche l'événement SUBMITTED)
insert into _t select 'app1', pg_temp.mkapp(null, '+22670000001');
insert into _t select 'app2', pg_temp.mkapp(null, null);
select submit_application((select v from _t where k='app1'), 'h') \gset sub1_
select submit_application((select v from _t where k='app2'), 'h') \gset sub2_

-- SMS : une notification mise en file, texte sans donnée personnelle ; aucune pour une demande sans téléphone
do $$ declare n notifications%rowtype; begin
  select * into n from notifications where application_id=(select v from _t where k='app1');
  assert n.event='application_submitted' and n.status='queued' and n.to_phone='+22670000001', 'notification SUBMITTED';
  assert n.body like 'Commune A : votre demande TSA-%' and n.body !~ 'FICTIF', n.body;
  assert (select count(*) from notifications where application_id=(select v from _t where k='app2'))=0, 'sans téléphone : rien en file';
end $$;

-- Paiement : tarif inconnu / fournisseur désactivé
do $$ begin
  perform pg_temp.expect(format('select initiate_payment(%L,''sandbox'',''70000001'',''key-aaaaaaaa'',''sandbox'')', (select v from _t where k='app1')), 'price_unknown');
  perform pg_temp.expect(format('select initiate_payment(%L,''orange_money'',''70000001'',''key-bbbbbbbb'',''live'')', (select v from _t where k='app1')), 'provider_disabled');
  perform pg_temp.expect(format('select initiate_payment(%L,''sandbox'',''70000001'',''key-cccccccc'',''live'')', (select v from _t where k='app1')), 'invalid_input');   -- sandbox interdit en mode live
end $$;
insert into service_pricing (municipality_id, service_id, amount_xof, valid_from)
  select (select v from _t where k='mA'), id, 1000, current_date - 1 from services where municipality_id=(select v from _t where k='mA') and code='certificat_residence';

do $$ declare j jsonb; j2 jsonb; pid uuid; begin
  j := initiate_payment((select v from _t where k='app1'), 'sandbox', '70000001', 'key-dddddddd', 'sandbox');
  pid := (j->>'payment_id')::uuid; assert (j->>'amount_xof')::int=1000 and not (j->>'free')::boolean, j::text;       -- montant issu de la base
  assert (select status from applications where id=(select v from _t where k='app1'))='PAYMENT_PENDING';
  -- idempotence : même clé -> même paiement ; autre clé -> un seul paiement actif par demande
  j2 := initiate_payment((select v from _t where k='app1'), 'sandbox', '70000001', 'key-dddddddd', 'sandbox'); assert (j2->>'payment_id')::uuid = pid and (j2->>'reused')::boolean;
  perform pg_temp.expect(format('select initiate_payment(%L,''sandbox'',''70000001'',''key-eeeeeeee'',''sandbox'')', (select v from _t where k='app1')), 'payment_in_progress');
  insert into _t values ('pay1', pid);
  perform mark_payment_pending(pid, 'SBX-REF-1');
  assert (select status from payments where id=pid)='PENDING';
end $$;

-- Résultats : prestataire erroné, montant discordant, succès, rejeu
do $$ declare pid uuid := (select v from _t where k='pay1'); app uuid := (select v from _t where k='app1'); begin
  perform pg_temp.expect(format('select apply_payment_result(%L,''orange_money'',''PAID'',''SBX-REF-1'',1000)', pid), 'invalid_input');
  assert apply_payment_result(pid,'sandbox','PAID','SBX-REF-1',900)='needs_review', 'montant discordant';
  assert (select status from payments where id=pid)='PENDING' and (select needs_review from payments where id=pid) and (select status from applications where id=app)='PAYMENT_PENDING', 'jamais PAID sur montant faux';
  assert apply_payment_result(pid,'sandbox','PAID','AUTRE-REF',1000)='needs_review', 'référence discordante';
  assert apply_payment_result(pid,'sandbox','PAID','SBX-REF-1',1000)='paid';
  assert (select status from applications where id=app)='PAID' and (select paid_at is not null from payments where id=pid);
  assert apply_payment_result(pid,'sandbox','PAID','SBX-REF-1',1000)='duplicate', 'rejeu sans effet';
  assert apply_payment_result(pid,'sandbox','FAILED',null,null)='duplicate', 'un paiement PAID ne repasse pas en échec';
  assert (select count(*) from application_events where application_id=app and to_status='PAID')=1, 'un seul événement PAID';
  assert (select count(*) from notifications where application_id=app and event='payment_confirmed')=1, 'SMS paiement en file, une seule fois';
end $$;

-- Quittance : numéro atomique, idempotent
do $$ declare pid uuid := (select v from _t where k='pay1'); r1 jsonb; r2 jsonb; begin
  r1 := issue_receipt(pid); r2 := issue_receipt(pid);
  assert r1->>'receipt_number' ~ '^TSA-RC-[0-9]{4}-000001$' and r1->>'receipt_id' = r2->>'receipt_id', r1::text;
  assert (r1->>'is_sandbox')::boolean and not (r1->>'has_pdf')::boolean;
  perform finalize_receipt((r1->>'receipt_id')::uuid, 'm/r.pdf', repeat('a',64));
  assert (select pdf_sha256 from receipts where payment_id=pid)=repeat('a',64);
  perform finalize_receipt((r1->>'receipt_id')::uuid, 'm/other.pdf', repeat('b',64));
  assert (select pdf_path from receipts where payment_id=pid)='m/r.pdf', 'quittance déjà finalisée : non réécrite';
end $$;

-- Échec -> demande de nouveau payable ; nouvelle tentative autorisée
insert into _t select 'app3', pg_temp.mkapp(null, '+22670000003');
do $$ declare app uuid := (select v from _t where k='app3'); j jsonb; pid uuid; begin
  perform submit_application(app,'h');
  j := initiate_payment(app,'sandbox','70000003','key-ffffffff','sandbox'); pid := (j->>'payment_id')::uuid;
  perform mark_payment_pending(pid,'SBX-REF-3');
  assert apply_payment_result(pid,'sandbox','FAILED',null,null)='failed';
  assert (select status from applications where id=app)='SUBMITTED' and (select status from payments where id=pid)='FAILED';
  j := initiate_payment(app,'sandbox','70000003','key-gggggggg','sandbox'); assert (j->>'payment_id')::uuid <> pid, 'nouvelle tentative';
  perform fail_payment_creation((j->>'payment_id')::uuid, 'prestataire injoignable');
  assert (select status from applications where id=app)='SUBMITTED';
end $$;
-- Gratuit : aucun paiement
insert into service_pricing (municipality_id, service_id, amount_xof, valid_from) select (select v from _t where k='mA'), id, 0, current_date from services where municipality_id=(select v from _t where k='mA') and code='extrait_naissance';
insert into applications (id, municipality_id, service_id, status, reference, submitted_at) select gen_random_uuid(), (select v from _t where k='mA'), id, 'SUBMITTED', 'TSA-2026-777777', now() from services where municipality_id=(select v from _t where k='mA') and code='extrait_naissance';
do $$ declare app uuid := (select id from applications where reference='TSA-2026-777777'); j jsonb; begin
  j := initiate_payment(app,'sandbox','70000009','key-hhhhhhhh','sandbox'); assert (j->>'free')::boolean;
  assert (select status from applications where id=app)='PAID' and not exists (select 1 from payments where application_id=app);
end $$;

-- Webhooks : unicité, rejet des invalides
do $$ declare w1 uuid; w2 uuid; begin
  w1 := record_webhook('sandbox','evt-1','{"a":1}'::jsonb,true); w2 := record_webhook('sandbox','evt-1','{"a":1}'::jsonb,true);
  assert w1 is not null and w2 is null, 'rejeu détecté';
  assert record_webhook('sandbox','evt-x','{}'::jsonb,false) is null;
  assert (select count(*) from payment_webhooks where not signature_valid)=1, 'webhook invalide conservé pour audit';
  perform mark_webhook_processed(w1,'paid'); assert (select result from payment_webhooks where id=w1)='paid';
end $$;

-- Droits : anonyme / citoyen / autre commune / caissier
reset role; set local role anon; select set_config('request.jwt.claim.sub','',true);
do $$ begin
  assert (select count(*) from payments)=0 and (select count(*) from receipts)=0 and (select count(*) from notifications)=0 and (select count(*) from refunds)=0 and (select count(*) from payment_webhooks)=0;
  begin perform initiate_payment(gen_random_uuid(),'sandbox','1','kkkkkkkkkk','sandbox'); raise exception 'anon'; exception when insufficient_privilege then null; end;
  begin perform apply_payment_result(gen_random_uuid(),'sandbox','PAID','x',1); raise exception 'anon'; exception when insufficient_privilege then null; end;
  begin perform claim_notifications(5); raise exception 'anon'; exception when insufficient_privilege then null; end;
end $$;
reset role; set local role authenticated; select pg_temp.as_user('a4');   -- admin d'une autre commune
do $$ begin
  assert (select count(*) from payments)=0 and (select count(*) from notifications)=0;
  perform pg_temp.expect(format('select reconciliation_report(%L)', (select v from _t where k='mA')), 'forbidden');
  perform pg_temp.expect(format('select request_refund(%L,100,''test'')', (select v from _t where k='pay1')), 'forbidden');
  begin perform apply_payment_result(gen_random_uuid(),'sandbox','PAID','x',1); raise exception 'auth'; exception when insufficient_privilege then null; end;   -- un agent ne peut pas forger un résultat
  begin perform initiate_payment(gen_random_uuid(),'sandbox','1','kkkkkkkkkk','sandbox'); raise exception 'auth'; exception when insufficient_privilege then null; end;
end $$;

-- Caissier : lecture des paiements et de la réconciliation, pas de remboursement
select pg_temp.as_user('a2');
do $$ declare mA uuid := (select v from _t where k='mA'); j jsonb; begin
  assert (select count(*) from payments)>=2 and (select count(*) from receipts)=1;
  j := reconciliation_report(mA);
  assert jsonb_array_length(j->'anomalies'->'needs_review')=1, 'paiement à revoir signalé : '||j::text;   -- (le paiement app1 a eu un montant discordant)
  assert jsonb_array_length(j->'anomalies'->'paid_without_receipt')=0;
  perform pg_temp.expect(format('select request_refund(%L,100,''erreur'')', (select v from _t where k='pay1')), 'forbidden');
  assert (select count(*) from notifications)=0, 'le caissier ne lit pas les SMS (sms.manage requis)';
end $$;

-- Remboursements : double validation
select pg_temp.as_user('a1');
do $$ declare pid uuid := (select v from _t where k='pay1'); r1 uuid; r2 uuid; begin
  perform pg_temp.expect(format('select request_refund(%L,1001,''trop'')', pid), 'invalid_input');
  perform pg_temp.expect(format('select request_refund(%L,100,''x'')', pid), 'invalid_input');
  r1 := request_refund(pid, 600, 'Double paiement constaté');
  perform pg_temp.expect(format('select request_refund(%L,500,''cumul trop élevé'')', pid), 'invalid_input');     -- 600 + 500 > 1000
  perform pg_temp.expect(format('select decide_refund(%L,true)', r1), 'self_approval');                          -- jamais seul
  perform pg_temp.expect(format('select mark_refund_executed(%L,''REF-1'')', r1), 'transition_not_allowed');       -- non approuvé
  perform pg_temp.as_user('a3');
  perform decide_refund(r1, true);
  perform pg_temp.expect(format('select decide_refund(%L,true)', r1), 'transition_not_allowed');
  perform pg_temp.expect(format('select mark_refund_executed(%L,'' '')', r1), 'invalid_input');
  perform mark_refund_executed(r1, 'MM-REMB-001');
  assert (select status from payments where id=pid)='PAID', 'remboursement partiel : paiement toujours PAID';
  r2 := request_refund(pid, 400, 'Solde'); perform pg_temp.as_user('a1'); perform decide_refund(r2, true); perform mark_refund_executed(r2, 'MM-REMB-002');
  assert (select status from payments where id=pid)='REFUNDED', 'remboursé en totalité';
  assert (select count(*) from audit_logs where action like 'refund_%')>=6, 'journalisé';
end $$;

-- Tableau de bord : seuls les paiements RÉELS comptent (le sandbox ne fabrique jamais de recette)
do $$ declare mA uuid := (select v from _t where k='mA'); j jsonb; begin
  j := dashboard_stats(mA); assert (j->>'payments_total_xof')::int = 0, 'sandbox exclu du total : '||j::text;
end $$;

-- File SMS : réservation, reprises, abandon, relance
reset role; update notifications set next_attempt_at = now() - interval '1 hour';
set local role service_role;
do $$ declare c int; n notifications%rowtype; id1 uuid; begin
  select count(*) into c from claim_notifications(100); assert c >= 3, 'notifications réservées : '||c;
  assert (select count(*) from claim_notifications(100))=0, 'pas de double réservation';
  select id into id1 from notifications where event='application_submitted' and application_id=(select v from _t where k='app1');
  perform complete_notification(id1, false, false, 'x', null, 'timeout');
  select * into n from notifications where id=id1; assert n.status='queued' and n.attempts=1 and n.next_attempt_at > now() + interval '30 seconds' and n.next_attempt_at < now() + interval '2 minutes', 'reprise à 1 min';
  update notifications set next_attempt_at=now() where id=id1; perform claim_notifications(100);
  perform complete_notification(id1, false, false, 'x', null, 'timeout');
  select * into n from notifications where id=id1; assert n.attempts=2 and n.next_attempt_at > now() + interval '4 minutes', 'reprise à 5 min';
  update notifications set attempts=4, status='sending' where id=id1;
  perform complete_notification(id1, false, false, 'x', null, 'timeout');
  select * into n from notifications where id=id1; assert n.status='queued' and n.attempts=4;
  update notifications set attempts=5, status='sending' where id=id1;
  perform complete_notification(id1, false, false, 'x', null, 'timeout');
  assert (select status from notifications where id=id1)='dead', 'abandon après 5 tentatives';
  perform complete_notification((select id from notifications where status='sending' limit 1), true, true, 'test', null, null);
  assert (select count(*) from notifications where status='test_sent')=1, 'mode test distingué de « sent »';
end $$;
reset role; set local role authenticated; select pg_temp.as_user('a1');
do $$ declare id1 uuid; begin
  select id into id1 from notifications where status='dead' limit 1;
  assert id1 is not null and (select count(*) from notifications)>=3, 'admin lit les SMS';
  perform retry_notification(id1); assert (select status from notifications where id=id1)='queued' and (select attempts from notifications where id=id1)=0;
  perform pg_temp.expect(format('select retry_notification(%L)', id1), 'transition_not_allowed');
  update notification_templates set body='{commune} : ok {reference}' where event='withdrawn' and municipality_id=(select v from _t where k='mA');
end $$;
select pg_temp.as_user('a4');
do $$ begin
  assert (select count(*) from notifications)=0, 'autre commune : aucune notification';
  assert (select count(*) from notification_templates where municipality_id=(select v from _t where k='mA'))=0, 'autre commune : aucun modèle SMS';
  perform pg_temp.expect(format('select retry_notification(%L)', gen_random_uuid()), 'forbidden');
end $$;
rollback;
\echo PAYMENTS_SMS_TESTS_OK
