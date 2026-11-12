-- 0001 — Socle multi-mairies : communes, profils, membres, rôles, numérotation atomique, RLS.
-- BROUILLON Phase 2 : non appliqué à un projet Supabase, non testé (voir docs/PHASE1).

create extension if not exists pgcrypto;

-- Utilitaire updated_at
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

create table public.municipalities (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,50}$'),
  subdomain text unique,
  name text not null,
  country text not null default 'Burkina Faso',
  region text not null,
  province text not null,
  address text,
  logo_path text,                       -- logo officiel configurable ; vide tant que non fourni
  contacts jsonb not null default '{}'::jsonb,
  reference_prefix text not null check (reference_prefix ~ '^[A-Z]{2,5}$'),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_municipalities_updated before update on public.municipalities
  for each row execute function public.set_updated_at();

create table public.municipality_settings (
  municipality_id uuid not null references public.municipalities(id) on delete cascade,
  key text not null,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (municipality_id, key)
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  preferred_language text not null default 'fr' check (preferred_language in ('fr','dyu')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_profiles_updated before update on public.profiles
  for each row execute function public.set_updated_at();

create table public.permissions (
  code text primary key,                -- ex. applications.validate
  description text not null
);

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  municipality_id uuid not null references public.municipalities(id) on delete cascade,
  code text not null,
  label text not null,
  unique (municipality_id, code),
  unique (id, municipality_id)          -- permet les FK composites anti-croisement
);

create table public.role_permissions (
  role_id uuid not null,
  municipality_id uuid not null,
  permission_code text not null references public.permissions(code),
  primary key (role_id, permission_code),
  foreign key (role_id, municipality_id) references public.roles(id, municipality_id) on delete cascade
);

create table public.municipality_members (
  id uuid primary key default gen_random_uuid(),
  municipality_id uuid not null references public.municipalities(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role_id uuid not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (municipality_id, profile_id),
  foreign key (role_id, municipality_id) references public.roles(id, municipality_id)
);
create index on public.municipality_members (profile_id) where is_active;

-- Numérotation atomique par commune / type / année (jamais côté frontend)
create table public.numbering_counters (
  municipality_id uuid not null references public.municipalities(id) on delete cascade,
  kind text not null,                   -- application | receipt | residence_cert | ...
  year int not null,
  last_value bigint not null default 0,
  primary key (municipality_id, kind, year)
);

create or replace function public.next_reference(p_municipality uuid, p_kind text)
returns text language plpgsql security definer set search_path = public as $$
declare v_year int := extract(year from now() at time zone 'Africa/Ouagadougou')::int;
        v_n bigint; v_prefix text;
begin
  insert into numbering_counters as c (municipality_id, kind, year, last_value)
  values (p_municipality, p_kind, v_year, 1)
  on conflict (municipality_id, kind, year)
  do update set last_value = c.last_value + 1
  returning last_value into v_n;
  select reference_prefix into v_prefix from municipalities where id = p_municipality;
  if v_prefix is null then raise exception 'unknown municipality'; end if;
  return format('%s-%s-%s', v_prefix, v_year, lpad(v_n::text, 6, '0'));
end $$;
revoke all on function public.next_reference(uuid, text) from public, anon, authenticated;
-- appelée uniquement par le backend (service_role) ou d'autres fonctions SECURITY DEFINER

-- Helpers RLS
create or replace function public.my_municipalities() returns setof uuid
language sql stable security definer set search_path = public as $$
  select municipality_id from municipality_members
  where profile_id = auth.uid() and is_active
$$;

create or replace function public.has_permission(p_municipality uuid, p_code text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from municipality_members m
    join role_permissions rp on rp.role_id = m.role_id and rp.municipality_id = m.municipality_id
    where m.profile_id = auth.uid() and m.is_active
      and m.municipality_id = p_municipality and rp.permission_code = p_code)
$$;

-- RLS
alter table public.municipalities enable row level security;
alter table public.municipality_settings enable row level security;
alter table public.profiles enable row level security;
alter table public.permissions enable row level security;
alter table public.roles enable row level security;
alter table public.role_permissions enable row level security;
alter table public.municipality_members enable row level security;
alter table public.numbering_counters enable row level security;  -- aucune policy : service_role / fonctions seulement

-- Infos publiques d'une commune (page d'accueil) : lecture ouverte des communes actives
create policy municipalities_public_read on public.municipalities
  for select using (is_active);
create policy municipalities_admin_update on public.municipalities
  for update using (public.has_permission(id, 'municipality.settings.manage'))
  with check (public.has_permission(id, 'municipality.settings.manage'));

create policy settings_member_read on public.municipality_settings
  for select using (municipality_id in (select public.my_municipalities()));
create policy settings_admin_write on public.municipality_settings
  for all using (public.has_permission(municipality_id, 'municipality.settings.manage'))
  with check (public.has_permission(municipality_id, 'municipality.settings.manage'));

create policy profiles_self on public.profiles
  for select using (id = auth.uid());
create policy profiles_self_update on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

create policy permissions_read on public.permissions
  for select using (auth.uid() is not null);

create policy roles_member_read on public.roles
  for select using (municipality_id in (select public.my_municipalities()));
create policy roles_admin_write on public.roles
  for all using (public.has_permission(municipality_id, 'roles.manage'))
  with check (public.has_permission(municipality_id, 'roles.manage'));

create policy role_perms_member_read on public.role_permissions
  for select using (municipality_id in (select public.my_municipalities()));
create policy role_perms_admin_write on public.role_permissions
  for all using (public.has_permission(municipality_id, 'roles.manage'))
  with check (public.has_permission(municipality_id, 'roles.manage'));

create policy members_read on public.municipality_members
  for select using (profile_id = auth.uid() or public.has_permission(municipality_id, 'agents.manage'));
create policy members_admin_write on public.municipality_members
  for all using (public.has_permission(municipality_id, 'agents.manage'))
  with check (public.has_permission(municipality_id, 'agents.manage'));

-- Permissions de base (le seed des rôles par commune viendra dans seed.sql)
insert into public.permissions (code, description) values
  ('municipality.settings.manage', 'Gérer les paramètres de la mairie'),
  ('roles.manage', 'Gérer les rôles et permissions'),
  ('agents.manage', 'Gérer les agents')
on conflict do nothing;
