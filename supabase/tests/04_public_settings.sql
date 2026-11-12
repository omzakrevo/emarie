\set ON_ERROR_STOP on
begin;
insert into municipality_settings (municipality_id, key, value)
select id, k, '{"fr":"x"}' from municipalities, (values ('public.opening_hours'),('payments.secret_note')) v(k) where slug='niankorodougou';
set local role anon; select set_config('request.jwt.claim.sub','',true);
do $$ declare n int; begin
  select count(*) into n from municipality_settings where key like 'public.%'; assert n=1, 'clé publique lisible, vu '||n;
  select count(*) into n from municipality_settings where key not like 'public.%'; assert n=0, 'clé non publique invisible, vu '||n;
  begin insert into municipality_settings select id,'public.x','{}' from municipalities limit 1; raise exception 'anon écrit des paramètres';
  exception when insufficient_privilege then null; end;
end $$;
rollback;
\echo PUBLIC_SETTINGS_TESTS_OK
