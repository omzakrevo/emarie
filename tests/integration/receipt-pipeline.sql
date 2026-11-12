\set ON_ERROR_STOP on
begin;
insert into municipalities (slug,name,region,province,reference_prefix) values ('pipe2','Commune Quittance','R','P','PIQ');
select seed_default_services(id) from municipalities where slug='pipe2';
insert into payment_provider_configs select id, 'sandbox', true from municipalities where slug='pipe2';
insert into service_pricing (municipality_id, service_id, amount_xof, valid_from)
  select m.id, s.id, 1500, current_date - 1 from municipalities m join services s on s.municipality_id=m.id where m.slug='pipe2' and s.code='certificat_residence';
insert into applications (id, municipality_id, service_id, contact_phone)
  select '00000000-0000-0000-0000-00000000f101', m.id, s.id, '+22670000001' from municipalities m join services s on s.municipality_id=m.id where m.slug='pipe2' and s.code='certificat_residence';
insert into application_data select '00000000-0000-0000-0000-00000000f101', municipality_id, '{"nom":"FICTIF"}' from applications where id='00000000-0000-0000-0000-00000000f101';
select submit_application('00000000-0000-0000-0000-00000000f101', 'h') \g /dev/null
select (initiate_payment('00000000-0000-0000-0000-00000000f101','sandbox','70000001','key-integration-1','sandbox')->>'payment_id') as pid \gset
select mark_payment_pending(:'pid'::uuid, 'SBX-INT-1') \g /dev/null
select apply_payment_result(:'pid'::uuid, 'sandbox', 'PAID', 'SBX-INT-1', 1500) \g /dev/null
select 'JSON:' || issue_receipt((:'pid')::uuid)::text;
rollback;
