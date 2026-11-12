-- 0003 — Catalogue de services, demandes, fichiers, événements, limitation de débit, annonces.
-- Principe : les invités n'ont AUCUN accès direct ; tout passe par le serveur (service_role) avec vérification du secret.

create table public.services (
  id uuid primary key default gen_random_uuid(),
  municipality_id uuid not null references public.municipalities(id) on delete cascade,
  code text not null check (code ~ '^[a-z0-9_]{2,40}$'),
  icon text not null default 'file-text',
  name jsonb not null,            -- {"fr": "...", "dyu": "..."}
  description jsonb not null default '{}'::jsonb,
  procedure jsonb not null default '{}'::jsonb,   -- texte de procédure par langue (à confirmer par la mairie)
  indicative_delay_days int check (indicative_delay_days is null or indicative_delay_days >= 0),
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (municipality_id, code),
  unique (id, municipality_id)
);
create trigger trg_services_updated before update on public.services for each row execute function public.set_updated_at();

create table public.service_fields (
  id uuid primary key default gen_random_uuid(),
  municipality_id uuid not null,
  service_id uuid not null,
  key text not null check (key ~ '^[a-z][a-z0-9_]{1,40}$'),
  label jsonb not null,
  help jsonb not null default '{}'::jsonb,
  type text not null check (type in ('text','textarea','date','time','select','radio','phone','number')),
  required boolean not null default false,
  options jsonb,                  -- [{"value":"m","label":{"fr":"Masculin"}}]
  validation jsonb not null default '{}'::jsonb,  -- {"min":2,"max":120,"pattern":"..."}
  visible_if jsonb,               -- {"field":"x","op":"eq|neq|in","value":...}
  step int not null check (step in (2,3)),
  sort_order int not null default 0,
  unique (service_id, key),
  foreign key (service_id, municipality_id) references public.services(id, municipality_id) on delete cascade
);

create table public.service_documents (
  id uuid primary key default gen_random_uuid(),
  municipality_id uuid not null,
  service_id uuid not null,
  key text not null check (key ~ '^[a-z][a-z0-9_]{1,40}$'),
  label jsonb not null,
  required boolean not null default true,
  max_size_kb int not null default 5120 check (max_size_kb between 100 and 10240),
  sort_order int not null default 0,
  unique (service_id, key),
  foreign key (service_id, municipality_id) references public.services(id, municipality_id) on delete cascade
);

create table public.service_pricing (
  id uuid primary key default gen_random_uuid(),
  municipality_id uuid not null,
  service_id uuid not null,
  amount_xof int not null check (amount_xof >= 0),
  valid_from date not null default current_date,
  valid_to date,
  created_at timestamptz not null default now(),
  foreign key (service_id, municipality_id) references public.services(id, municipality_id) on delete cascade,
  check (valid_to is null or valid_to >= valid_from)
);
create index on public.service_pricing (service_id, valid_from desc);

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  municipality_id uuid not null references public.municipalities(id) on delete cascade,
  title jsonb not null,
  body jsonb not null default '{}'::jsonb,
  is_published boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.announcements (municipality_id, published_at desc) where is_published;

create table public.applications (
  id uuid primary key default gen_random_uuid(),
  municipality_id uuid not null references public.municipalities(id) on delete cascade,
  service_id uuid not null,
  reference text,                         -- attribuée à la soumission uniquement
  status text not null default 'DRAFT' check (status in
    ('DRAFT','SUBMITTED','PAYMENT_PENDING','PAID','UNDER_REVIEW','ADDITIONAL_INFO_REQUIRED','REJECTED',
     'VALIDATED','DOCUMENT_GENERATED','PRINTED','PENDING_SIGNATURE','SIGNED','READY_FOR_PICKUP','WITHDRAWN')),
  profile_id uuid references public.profiles(id) on delete set null,   -- null = invité
  draft_token_hash text,                  -- invité : HMAC du jeton de reprise
  tracking_secret_hash text,              -- invité : HMAC du code de suivi
  contact_phone text,
  locale text not null default 'fr' check (locale in ('fr','dyu')),
  draft_expires_at timestamptz default (now() + interval '30 days'),
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (service_id, municipality_id) references public.services(id, municipality_id),
  unique (id, municipality_id),
  check (status = 'DRAFT' or reference is not null)
);
create unique index applications_reference_uq on public.applications (municipality_id, reference) where reference is not null;
create index on public.applications (municipality_id, status, created_at desc);
create index on public.applications (profile_id) where profile_id is not null;
create trigger trg_applications_updated before update on public.applications for each row execute function public.set_updated_at();

create table public.application_data (
  application_id uuid primary key,
  municipality_id uuid not null,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  foreign key (application_id, municipality_id) references public.applications(id, municipality_id) on delete cascade
);

create table public.application_files (
  id uuid primary key default gen_random_uuid(),
  municipality_id uuid not null,
  application_id uuid not null,
  document_key text not null,
  storage_path text not null unique,
  original_name text not null,
  mime_type text not null check (mime_type in ('application/pdf','image/jpeg','image/png','image/webp')),
  size_bytes int not null check (size_bytes > 0),
  sha256 text not null,
  created_at timestamptz not null default now(),
  foreign key (application_id, municipality_id) references public.applications(id, municipality_id) on delete cascade
);
create index on public.application_files (application_id);

-- Historique : append-only. public_note = seul texte visible par le citoyen (motif de rejet, complément demandé).
create table public.application_events (
  id uuid primary key default gen_random_uuid(),
  municipality_id uuid not null,
  application_id uuid not null,
  from_status text,
  to_status text not null,
  actor_type text not null check (actor_type in ('system','citizen','guest','agent')),
  actor_id uuid,
  public_note text,
  created_at timestamptz not null default now(),
  foreign key (application_id, municipality_id) references public.applications(id, municipality_id) on delete cascade
);
create index on public.application_events (application_id, created_at);

create or replace function public.events_append_only() returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' then raise exception 'application_events est en ajout seul'; end if;
  if tg_op = 'DELETE' and pg_trigger_depth() = 1 then raise exception 'application_events est en ajout seul'; end if;
  return old;
end $$;
create trigger trg_events_ro before update or delete on public.application_events
  for each row execute function public.events_append_only();

-- Limitation de débit atomique (connexion, OTP, suivi invité…)
create table public.rate_limits (
  key text primary key,
  window_start timestamptz not null default now(),
  hits int not null default 0
);
create or replace function public.rate_limit_hit(p_key text, p_max int, p_window_seconds int) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_hits int;
begin
  insert into rate_limits as r (key, window_start, hits) values (p_key, now(), 1)
  on conflict (key) do update set
    hits = case when r.window_start < now() - make_interval(secs => p_window_seconds) then 1 else r.hits + 1 end,
    window_start = case when r.window_start < now() - make_interval(secs => p_window_seconds) then now() else r.window_start end
  returning hits into v_hits;
  return v_hits <= p_max;   -- true = autorisé
end $$;

-- Soumission : référence officielle attribuée côté base, de façon atomique
create or replace function public.submit_application(p_id uuid, p_secret_hash text) returns text
language plpgsql security definer set search_path = public as $$
declare a applications%rowtype; v_ref text;
begin
  select * into a from applications where id = p_id for update;
  if not found then raise exception 'demande introuvable'; end if;
  if a.status <> 'DRAFT' then raise exception 'demande déjà soumise'; end if;
  if not exists (select 1 from application_data where application_id = p_id) then raise exception 'demande vide'; end if;
  v_ref := next_reference(a.municipality_id, 'application');
  update applications set reference = v_ref, status = 'SUBMITTED', submitted_at = now(),
         tracking_secret_hash = p_secret_hash, draft_token_hash = null, draft_expires_at = null
   where id = p_id;
  insert into application_events (municipality_id, application_id, from_status, to_status, actor_type, actor_id)
  values (a.municipality_id, p_id, 'DRAFT', 'SUBMITTED', case when a.profile_id is null then 'guest' else 'citizen' end, a.profile_id);
  return v_ref;
end $$;

revoke all on function public.rate_limit_hit(text,int,int), public.submit_application(uuid,text)
  from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text,int,int), public.submit_application(uuid,text) to service_role;

-- RLS
alter table public.services enable row level security;
alter table public.service_fields enable row level security;
alter table public.service_documents enable row level security;
alter table public.service_pricing enable row level security;
alter table public.announcements enable row level security;
alter table public.applications enable row level security;
alter table public.application_data enable row level security;
alter table public.application_files enable row level security;
alter table public.application_events enable row level security;
alter table public.rate_limits enable row level security;

-- Catalogue : lecture publique des services actifs d'une commune active
create policy services_public_read on public.services for select
  using (is_active and exists (select 1 from municipalities m where m.id = municipality_id and m.is_active));
create policy services_staff_read on public.services for select using (public.has_permission(municipality_id,'services.manage'));
create policy services_staff_write on public.services for all
  using (public.has_permission(municipality_id,'services.manage')) with check (public.has_permission(municipality_id,'services.manage'));

create policy fields_public_read on public.service_fields for select
  using (exists (select 1 from services s where s.id = service_id and s.is_active));
create policy fields_staff_write on public.service_fields for all
  using (public.has_permission(municipality_id,'services.manage')) with check (public.has_permission(municipality_id,'services.manage'));

create policy docs_public_read on public.service_documents for select
  using (exists (select 1 from services s where s.id = service_id and s.is_active));
create policy docs_staff_write on public.service_documents for all
  using (public.has_permission(municipality_id,'services.manage')) with check (public.has_permission(municipality_id,'services.manage'));

create policy pricing_public_read on public.service_pricing for select
  using (exists (select 1 from services s where s.id = service_id and s.is_active));
create policy pricing_staff_write on public.service_pricing for all
  using (public.has_permission(municipality_id,'pricing.manage')) with check (public.has_permission(municipality_id,'pricing.manage'));

create policy announcements_public_read on public.announcements for select using (is_published);
create policy announcements_staff_write on public.announcements for all
  using (public.has_permission(municipality_id,'services.manage')) with check (public.has_permission(municipality_id,'services.manage'));

-- Demandes : le citoyen connecté voit les siennes ; le personnel selon permission. Aucune écriture directe.
create policy applications_read on public.applications for select
  using (profile_id = auth.uid() or public.has_permission(municipality_id,'applications.read'));
create policy app_data_read on public.application_data for select
  using (exists (select 1 from applications a where a.id = application_id
         and (a.profile_id = auth.uid() or public.has_permission(a.municipality_id,'applications.read'))));
create policy app_files_read on public.application_files for select
  using (exists (select 1 from applications a where a.id = application_id
         and (a.profile_id = auth.uid() or public.has_permission(a.municipality_id,'applications.read'))));
create policy app_events_read on public.application_events for select
  using (exists (select 1 from applications a where a.id = application_id
         and (a.profile_id = auth.uid() or public.has_permission(a.municipality_id,'applications.read'))));
-- rate_limits : aucune policy (service_role / fonctions uniquement)

-- Bucket privé pour les justificatifs (aucune policy storage => aucun accès direct du navigateur)
do $$ begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public) values ('application-files','application-files', false)
    on conflict (id) do update set public = false;
  end if;
end $$;
