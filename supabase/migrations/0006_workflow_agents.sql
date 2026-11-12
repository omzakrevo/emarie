-- 0006 — Phase 4 : workflow imposé par la base, notes internes, vérification au registre, audit, gestion des agents, statistiques.
-- Les codes d'erreur (message) sont stables : transition_not_allowed, note_required, payment_required, registry_check_required,
-- forbidden, not_found, role_escalation, last_admin, invalid_input. L'interface les traduit.

alter table public.profiles add column if not exists email text;
update public.profiles p set email = u.email from auth.users u where u.id = p.id and p.email is null;
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, phone, email, full_name)
  values (new.id, new.phone, new.email, nullif(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;
  return new;
end $$;
create policy profiles_admin_read on public.profiles for select using (
  exists (select 1 from municipality_members m where m.profile_id = profiles.id and public.has_permission(m.municipality_id, 'agents.manage')));

-- Audit (ajout seul)
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  municipality_id uuid not null references public.municipalities(id) on delete cascade,
  actor_id uuid,
  action text not null,
  entity text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index on public.audit_logs (municipality_id, created_at desc);
create trigger trg_audit_ro before update or delete on public.audit_logs
  for each row execute function public.events_append_only();
alter table public.audit_logs enable row level security;
create policy audit_read on public.audit_logs for select using (public.has_permission(municipality_id, 'audit.read'));

create or replace function public.write_audit(p_municipality uuid, p_action text, p_entity text, p_entity_id uuid, p_meta jsonb default '{}')
returns void language sql security definer set search_path = public as $$
  insert into audit_logs (municipality_id, actor_id, action, entity, entity_id, metadata)
  values (p_municipality, auth.uid(), p_action, p_entity, p_entity_id, coalesce(p_meta, '{}'::jsonb));
$$;
revoke all on function public.write_audit(uuid,text,text,uuid,jsonb) from public, anon, authenticated;

-- Table des transitions (globale). enabled=false : réservé aux fonctions dédiées des phases suivantes.
create table public.workflow_transitions (
  from_status text not null, to_status text not null,
  permission text not null references public.permissions(code),
  requires_note boolean not null default false,
  enabled boolean not null default true,
  primary key (from_status, to_status)
);
alter table public.workflow_transitions enable row level security;
create policy wt_read on public.workflow_transitions for select using (auth.uid() is not null);
insert into public.workflow_transitions (from_status, to_status, permission, requires_note, enabled) values
  ('SUBMITTED','UNDER_REVIEW','applications.review',false,true),   -- exige workflow.skip_payment tant que le paiement n'existe pas
  ('PAID','UNDER_REVIEW','applications.review',false,true),
  ('UNDER_REVIEW','ADDITIONAL_INFO_REQUIRED','applications.review',true,true),
  ('ADDITIONAL_INFO_REQUIRED','UNDER_REVIEW','applications.review',false,true),
  ('UNDER_REVIEW','REJECTED','applications.reject',true,true),
  ('UNDER_REVIEW','VALIDATED','applications.validate',false,true),
  -- Phase 5 (documents, signature, retrait) : désactivées ici ; pas de contournement des enregistrements dédiés
  ('VALIDATED','DOCUMENT_GENERATED','documents.generate',false,false),
  ('DOCUMENT_GENERATED','PRINTED','documents.print',false,false),
  ('PRINTED','PENDING_SIGNATURE','documents.print',false,false),
  ('PENDING_SIGNATURE','SIGNED','documents.sign_confirm',false,false),
  ('SIGNED','READY_FOR_PICKUP','documents.release',false,false),
  ('READY_FOR_PICKUP','WITHDRAWN','documents.withdraw',false,false);

create table public.application_notes (
  id uuid primary key default gen_random_uuid(),
  municipality_id uuid not null,
  application_id uuid not null,
  author_id uuid not null references public.profiles(id),
  body text not null check (length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now(),
  foreign key (application_id, municipality_id) references public.applications(id, municipality_id) on delete cascade
);
create index on public.application_notes (application_id, created_at);
alter table public.application_notes enable row level security;
create policy notes_read on public.application_notes for select using (public.has_permission(municipality_id, 'applications.read'));
create policy notes_insert on public.application_notes for insert
  with check (author_id = auth.uid() and public.has_permission(municipality_id, 'applications.review'));
create trigger trg_notes_ro before update or delete on public.application_notes
  for each row execute function public.events_append_only();

-- Vérification au registre d'état civil : saisie par l'officier habilité, jamais déduite ni inventée.
create table public.civil_registry_checks (
  id uuid primary key default gen_random_uuid(),
  municipality_id uuid not null,
  application_id uuid not null,
  outcome text not null check (outcome in ('found','not_found')),
  registry_ref text,                    -- numéro/référence relevé dans le registre papier ou numérique officiel
  note text,
  checked_by uuid not null references public.profiles(id),
  checked_at timestamptz not null default clock_timestamp(),
  seq bigint generated always as identity,          -- ordre total des vérifications (le dernier résultat fait foi)
  check (outcome = 'not_found' or length(btrim(coalesce(registry_ref,''))) > 0),
  foreign key (application_id, municipality_id) references public.applications(id, municipality_id) on delete cascade
);
alter table public.civil_registry_checks enable row level security;
create policy registry_read on public.civil_registry_checks for select using (public.has_permission(municipality_id, 'applications.read'));
create trigger trg_registry_ro before update or delete on public.civil_registry_checks
  for each row execute function public.events_append_only();

create or replace function public.record_registry_check(p_application uuid, p_outcome text, p_registry_ref text, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare a applications%rowtype; v_code text;
begin
  if auth.uid() is null then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into a from applications where id = p_application for update;
  if not found or not has_permission(a.municipality_id, 'applications.read') then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not has_permission(a.municipality_id, 'civil_registry.verify') then raise exception 'forbidden' using errcode = '42501'; end if;
  select code into v_code from services where id = a.service_id;
  if v_code <> 'extrait_naissance' or a.status <> 'UNDER_REVIEW' then raise exception 'invalid_input'; end if;
  if p_outcome not in ('found','not_found') or (p_outcome = 'found' and coalesce(btrim(p_registry_ref),'') = '') then raise exception 'invalid_input'; end if;
  insert into civil_registry_checks (municipality_id, application_id, outcome, registry_ref, note, checked_by)
  values (a.municipality_id, p_application, p_outcome, nullif(btrim(p_registry_ref),''), nullif(btrim(p_note),''), auth.uid());
  perform write_audit(a.municipality_id, 'registry_check', 'application', p_application, jsonb_build_object('outcome', p_outcome));
end $$;

-- Transition de workflow : SEUL chemin autorisé pour changer le statut côté personnel.
create or replace function public.agent_transition(p_application uuid, p_to text, p_public_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare a applications%rowtype; t workflow_transitions%rowtype; v_code text; v_skip boolean; v_chk text;
begin
  if auth.uid() is null then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into a from applications where id = p_application for update;
  if not found or not has_permission(a.municipality_id, 'applications.read') then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into t from workflow_transitions where from_status = a.status and to_status = p_to;
  if not found or not t.enabled then raise exception 'transition_not_allowed'; end if;
  if not has_permission(a.municipality_id, t.permission) then raise exception 'forbidden' using errcode = '42501'; end if;
  if t.requires_note and coalesce(btrim(p_public_note), '') = '' then raise exception 'note_required'; end if;

  if a.status = 'SUBMITTED' then   -- tant que le paiement en ligne n'existe pas : option explicite de la mairie
    select coalesce((value ->> 'enabled')::boolean, false) into v_skip from municipality_settings
      where municipality_id = a.municipality_id and key = 'workflow.skip_payment';
    if not coalesce(v_skip, false) then raise exception 'payment_required'; end if;
  end if;

  select code into v_code from services where id = a.service_id;
  if p_to = 'VALIDATED' and v_code = 'extrait_naissance' then
    if not has_permission(a.municipality_id, 'civil_registry.verify') then raise exception 'forbidden' using errcode = '42501'; end if;
    select outcome into v_chk from civil_registry_checks where application_id = a.id order by seq desc limit 1;
    if v_chk is distinct from 'found' then raise exception 'registry_check_required'; end if;
  end if;

  update applications set status = p_to where id = a.id;
  insert into application_events (municipality_id, application_id, from_status, to_status, actor_type, actor_id, public_note)
  values (a.municipality_id, a.id, a.status, p_to, 'agent', auth.uid(), nullif(btrim(p_public_note), ''));
  perform write_audit(a.municipality_id, 'transition', 'application', a.id, jsonb_build_object('from', a.status, 'to', p_to));
end $$;

-- Gestion des agents : aucune écriture directe, anti-escalade de privilèges, dernier administrateur protégé.
drop policy members_admin_write on public.municipality_members;

create or replace function public.my_permissions(p_municipality uuid) returns setof text
language sql stable security definer set search_path = public as $$
  select rp.permission_code from municipality_members m
  join role_permissions rp on rp.role_id = m.role_id and rp.municipality_id = m.municipality_id
  where m.profile_id = auth.uid() and m.is_active and m.municipality_id = p_municipality
$$;

create or replace function public._role_within_my_permissions(p_municipality uuid, p_role uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (
    select 1 from role_permissions rp where rp.role_id = p_role and rp.municipality_id = p_municipality
      and rp.permission_code not in (select public.my_permissions(p_municipality)))
$$;
revoke all on function public._role_within_my_permissions(uuid,uuid) from public, anon, authenticated;

create or replace function public._other_active_admin_exists(p_municipality uuid, p_except_member uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from municipality_members m join roles r on r.id = m.role_id
    where m.municipality_id = p_municipality and m.is_active and r.code = 'admin_commune' and m.id <> p_except_member)
$$;
revoke all on function public._other_active_admin_exists(uuid,uuid) from public, anon, authenticated;

create or replace function public.add_member(p_municipality uuid, p_profile uuid, p_role uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null or not has_permission(p_municipality, 'agents.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  if not exists (select 1 from roles where id = p_role and municipality_id = p_municipality) then raise exception 'invalid_input'; end if;
  if not _role_within_my_permissions(p_municipality, p_role) then raise exception 'role_escalation'; end if;
  insert into municipality_members (municipality_id, profile_id, role_id) values (p_municipality, p_profile, p_role)
  on conflict (municipality_id, profile_id) do update set role_id = excluded.role_id, is_active = true
  returning id into v_id;
  perform write_audit(p_municipality, 'member_add', 'member', v_id, jsonb_build_object('role', p_role));
  return v_id;
end $$;

create or replace function public.set_member_role(p_member uuid, p_role uuid) returns void
language plpgsql security definer set search_path = public as $$
declare m municipality_members%rowtype; v_old text;
begin
  select * into m from municipality_members where id = p_member for update;
  if not found or auth.uid() is null or not has_permission(m.municipality_id, 'agents.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  if not exists (select 1 from roles where id = p_role and municipality_id = m.municipality_id) then raise exception 'invalid_input'; end if;
  if not _role_within_my_permissions(m.municipality_id, p_role) or not _role_within_my_permissions(m.municipality_id, m.role_id)
    then raise exception 'role_escalation'; end if;
  select code into v_old from roles where id = m.role_id;
  if v_old = 'admin_commune' and m.is_active and p_role <> m.role_id and not _other_active_admin_exists(m.municipality_id, m.id)
    then raise exception 'last_admin'; end if;
  update municipality_members set role_id = p_role where id = p_member;
  perform write_audit(m.municipality_id, 'member_role', 'member', p_member, jsonb_build_object('role', p_role));
end $$;

create or replace function public.set_member_active(p_member uuid, p_active boolean) returns void
language plpgsql security definer set search_path = public as $$
declare m municipality_members%rowtype; v_code text;
begin
  select * into m from municipality_members where id = p_member for update;
  if not found or auth.uid() is null or not has_permission(m.municipality_id, 'agents.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  if not _role_within_my_permissions(m.municipality_id, m.role_id) then raise exception 'role_escalation'; end if;
  select code into v_code from roles where id = m.role_id;
  if not p_active and v_code = 'admin_commune' and m.is_active and not _other_active_admin_exists(m.municipality_id, m.id)
    then raise exception 'last_admin'; end if;
  update municipality_members set is_active = p_active where id = p_member;
  perform write_audit(m.municipality_id, 'member_active', 'member', p_member, jsonb_build_object('active', p_active));
end $$;

-- Statistiques du tableau de bord (agrégats d'une seule commune, permission vérifiée)
create or replace function public.dashboard_stats(p_municipality uuid, p_from date default null, p_to date default null, p_service uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_status jsonb; v_service jsonb;
begin
  if auth.uid() is null or not (has_permission(p_municipality, 'applications.read') or has_permission(p_municipality, 'reports.read'))
    then raise exception 'forbidden' using errcode = '42501'; end if;
  select coalesce(jsonb_object_agg(status, n), '{}'::jsonb) into v_status from (
    select status, count(*) n from applications
    where municipality_id = p_municipality and status <> 'DRAFT'
      and (p_from is null or submitted_at >= p_from) and (p_to is null or submitted_at < p_to + 1)
      and (p_service is null or service_id = p_service)
    group by status) s;
  select coalesce(jsonb_agg(jsonb_build_object('code', code, 'name', name, 'count', n) order by n desc), '[]'::jsonb) into v_service from (
    select sv.code, sv.name, count(a.id) n from services sv
    left join applications a on a.service_id = sv.id and a.status <> 'DRAFT'
      and (p_from is null or a.submitted_at >= p_from) and (p_to is null or a.submitted_at < p_to + 1)
    where sv.municipality_id = p_municipality and (p_service is null or sv.id = p_service)
    group by sv.code, sv.name) x;
  return jsonb_build_object('by_status', v_status, 'by_service', v_service,
    'payments_total_xof', null);  -- Phase 6 : aucune donnée de paiement n'existe encore
end $$;

revoke all on function public.record_registry_check(uuid,text,text,text), public.agent_transition(uuid,text,text),
  public.my_permissions(uuid), public.add_member(uuid,uuid,uuid), public.set_member_role(uuid,uuid), public.set_member_active(uuid,boolean),
  public.dashboard_stats(uuid,date,date,uuid) from public, anon;
grant execute on function public.record_registry_check(uuid,text,text,text), public.agent_transition(uuid,text,text),
  public.my_permissions(uuid), public.add_member(uuid,uuid,uuid), public.set_member_role(uuid,uuid), public.set_member_active(uuid,boolean),
  public.dashboard_stats(uuid,date,date,uuid) to authenticated, service_role;

-- Rôles : plus d'écriture directe ; modification d'une permission par fonction (anti-escalade, admin_commune immuable)
drop policy if exists roles_admin_write on public.roles;
drop policy if exists role_perms_admin_write on public.role_permissions;

create or replace function public.set_role_permission(p_role uuid, p_permission text, p_granted boolean) returns void
language plpgsql security definer set search_path = public as $$
declare r roles%rowtype;
begin
  select * into r from roles where id = p_role;
  if not found or auth.uid() is null or not has_permission(r.municipality_id, 'roles.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  if r.code = 'admin_commune' then raise exception 'role_escalation'; end if;       -- rôle administrateur non modifiable
  if not exists (select 1 from permissions where code = p_permission) then raise exception 'invalid_input'; end if;
  if p_permission not in (select public.my_permissions(r.municipality_id)) then raise exception 'role_escalation'; end if;
  if p_granted then
    insert into role_permissions (role_id, municipality_id, permission_code) values (p_role, r.municipality_id, p_permission) on conflict do nothing;
  else
    delete from role_permissions where role_id = p_role and permission_code = p_permission;
  end if;
  perform write_audit(r.municipality_id, 'role_permission', 'role', p_role, jsonb_build_object('permission', p_permission, 'granted', p_granted));
end $$;
revoke all on function public.set_role_permission(uuid,text,boolean) from public, anon;
grant execute on function public.set_role_permission(uuid,text,boolean) to authenticated, service_role;

-- Pré-contrôle sans effet de bord (utilisé avant d'inviter un compte)
create or replace function public.can_assign_role(p_municipality uuid, p_role uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and has_permission(p_municipality, 'agents.manage')
     and exists (select 1 from roles where id = p_role and municipality_id = p_municipality)
     and _role_within_my_permissions(p_municipality, p_role)
$$;
revoke all on function public.can_assign_role(uuid,uuid) from public, anon;
grant execute on function public.can_assign_role(uuid,uuid) to authenticated, service_role;
