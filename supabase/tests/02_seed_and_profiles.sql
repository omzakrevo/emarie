\set ON_ERROR_STOP on
begin;
do $$ declare n int; m uuid; begin
  select id into m from municipalities where slug='niankorodougou';
  assert m is not null, 'commune pilote absente';
  assert (select region||'/'||province from municipalities where id=m) = 'Tannounyan/Léraba';
  assert (select address is null and logo_path is null and contacts = '{}'::jsonb from municipalities where id=m),
    'adresse/logo/contacts ne doivent pas être inventés';
  select count(*) into n from roles where municipality_id=m; assert n=5, 'rôles: '||n;
  -- idempotence
  perform seed_default_roles(m);
  select count(*) into n from roles where municipality_id=m; assert n=5, 'seed non idempotent';
  -- séparation des pouvoirs
  assert not exists (select 1 from role_permissions rp join roles r on r.id=rp.role_id
    where r.municipality_id=m and r.code='officier_etat_civil' and rp.permission_code='payments.refund');
  assert exists (select 1 from role_permissions rp join roles r on r.id=rp.role_id
    where r.municipality_id=m and r.code='officier_etat_civil' and rp.permission_code='civil_registry.verify');
  assert not exists (select 1 from role_permissions rp join roles r on r.id=rp.role_id
    where r.municipality_id=m and r.code in ('agent_accueil','caissier') and rp.permission_code='civil_registry.verify');
  -- profil automatique
  insert into auth.users (id, phone, raw_user_meta_data) values ('00000000-0000-0000-0000-0000000000c1','+22600000000','{"full_name":"Citoyen Fictif"}');
  assert (select full_name from profiles where id='00000000-0000-0000-0000-0000000000c1')='Citoyen Fictif';
end $$;
rollback;
\echo SEED_TESTS_OK
