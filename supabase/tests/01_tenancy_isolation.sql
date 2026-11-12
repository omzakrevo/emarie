-- Tests d'isolation multi-communes. Échoue (ERROR) au premier écart.
\set ON_ERROR_STOP on
begin;
create temp table _ids (k text primary key, v uuid);
grant all on _ids to authenticated, anon;

insert into municipalities (slug, name, region, province, reference_prefix) values
  ('test-a','Commune test A','Région A','Province A','TSA'),
  ('test-b','Commune test B','Région B','Province B','TST');
insert into _ids select 'mA', id from municipalities where slug='test-a';
insert into _ids select 'mB', id from municipalities where slug='test-b';

insert into auth.users (id) values ('00000000-0000-0000-0000-00000000000a'),('00000000-0000-0000-0000-00000000000b');
insert into roles (municipality_id, code, label) select v,'admin','Admin' from _ids where k in ('mA','mB');
insert into role_permissions (role_id, municipality_id, permission_code)
  select r.id, r.municipality_id, p from roles r, unnest(array['municipality.settings.manage','roles.manage','agents.manage']) p
  where r.code = 'admin';
insert into municipality_members (municipality_id, profile_id, role_id)
  select r.municipality_id, case when r.municipality_id=(select v from _ids where k='mA')
         then '00000000-0000-0000-0000-00000000000a'::uuid else '00000000-0000-0000-0000-00000000000b'::uuid end, r.id
  from roles r where r.code = 'admin';
insert into municipality_settings values ((select v from _ids where k='mA'),'horaires','{"a":1}'),((select v from _ids where k='mB'),'horaires','{"b":1}');

-- Agent A
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',true);

do $$ declare n int; mb uuid := (select v from _ids where k='mB'); ma uuid := (select v from _ids where k='mA'); begin
  select count(*) into n from municipality_settings;
  assert n = 1, 'A doit voir 1 paramètre, vu: '||n;
  select count(*) into n from municipality_settings where municipality_id = mb;
  assert n = 0, 'A ne doit pas lire les paramètres de B';
  select count(*) into n from roles where municipality_id = mb;
  assert n = 0, 'A ne doit pas lire les rôles de B';
  select count(*) into n from municipality_members where municipality_id = mb;
  assert n = 0, 'A ne doit pas lire les membres de B';
  select count(*) into n from municipalities; -- lecture publique des communes actives
  assert n = 3, 'les communes actives sont publiques (pilote + 2 tests)';

  update municipality_settings set value='{"hack":1}' where municipality_id = mb;
  get diagnostics n = row_count;
  assert n = 0, 'A ne doit pas modifier les paramètres de B';

  begin
    insert into municipality_settings values (mb,'x','{}');
    raise exception 'INSERT cross-commune accepté !';
  exception when insufficient_privilege or check_violation then null; end;

  update municipality_settings set value='{"ok":1}' where municipality_id = ma;
  get diagnostics n = row_count;
  assert n = 1, 'A doit pouvoir modifier ses paramètres';

  begin
    perform next_reference(ma,'application');
    raise exception 'next_reference appelable par un utilisateur !';
  exception when insufficient_privilege then null; end;

  begin
    update municipalities set name='piraté' where id = mb;
    get diagnostics n = row_count;
    assert n = 0, 'A ne doit pas modifier la commune B';
  end;
end $$;

-- Anonyme : rien sauf communes actives
reset role; set local role anon;
select set_config('request.jwt.claim.sub','',true);
do $$ declare n int; begin
  select count(*) into n from municipality_settings; assert n=0, 'anon ne lit pas les paramètres';
  select count(*) into n from municipality_members; assert n=0, 'anon ne lit pas les membres';
  select count(*) into n from profiles; assert n=0, 'anon ne lit pas les profils';
  select count(*) into n from numbering_counters; assert n=0, 'anon ne lit pas les compteurs';
end $$;

-- FK composite : un membre ne peut pas recevoir le rôle d'une autre commune
reset role;
do $$ begin
  begin
    insert into municipality_members (municipality_id, profile_id, role_id)
    select (select v from _ids where k='mA'), '00000000-0000-0000-0000-00000000000b',
           (select id from roles where municipality_id=(select v from _ids where k='mB'));
    raise exception 'rôle inter-communes accepté !';
  exception when foreign_key_violation then null; end;
end $$;

-- Numérotation : format, séquence et indépendance par commune
do $$ declare r1 text; r2 text; r3 text; begin
  r1 := next_reference((select v from _ids where k='mA'),'application');
  r2 := next_reference((select v from _ids where k='mA'),'application');
  r3 := next_reference((select v from _ids where k='mB'),'application');
  assert r1 ~ '^TSA-[0-9]{4}-000001$', r1;
  assert r2 ~ '^TSA-[0-9]{4}-000002$', r2;
  assert r3 ~ '^TST-[0-9]{4}-000001$', r3;
end $$;
rollback;
\echo ISOLATION_TESTS_OK
