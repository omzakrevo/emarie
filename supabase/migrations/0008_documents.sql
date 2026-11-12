-- 0008 — Phase 5 : modèles versionnés, documents émis, signature physique, retrait, bucket privé des PDF, logo.
-- Les modèles livrés sont PROVISOIRES (mode.pdf non reçu) : filigrane « SPÉCIMEN » et mise à disposition bloquée tant
-- qu'une version n'a pas été validée officiellement par la mairie.

-- Extrait de naissance : le document n'est JAMAIS construit sur les données déclarées, mais sur celles relevées au registre.
alter table public.civil_registry_checks add column registry_data jsonb;
alter table public.civil_registry_checks add constraint registry_found_has_data check (outcome = 'not_found' or registry_data is not null) not valid;
drop function public.record_registry_check(uuid, text, text, text);
create or replace function public.record_registry_check(p_application uuid, p_outcome text, p_registry_ref text, p_registry_data jsonb default null, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare a applications%rowtype; v_code text; k text;
begin
  if auth.uid() is null then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into a from applications where id = p_application for update;
  if not found or not has_permission(a.municipality_id, 'applications.read') then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not has_permission(a.municipality_id, 'civil_registry.verify') then raise exception 'forbidden' using errcode = '42501'; end if;
  select code into v_code from services where id = a.service_id;
  if v_code <> 'extrait_naissance' or a.status <> 'UNDER_REVIEW' then raise exception 'invalid_input'; end if;
  if p_outcome not in ('found','not_found') then raise exception 'invalid_input'; end if;
  if p_outcome = 'found' then
    if coalesce(btrim(p_registry_ref),'') = '' or p_registry_data is null or jsonb_typeof(p_registry_data) <> 'object' then raise exception 'invalid_input'; end if;
    for k in select jsonb_object_keys(p_registry_data) loop
      if k not in ('nom','prenoms','sexe','date_naissance','heure_naissance','lieu_naissance','nom_pere','nom_mere')
         or jsonb_typeof(p_registry_data -> k) <> 'string' or length(p_registry_data ->> k) > 200 then raise exception 'invalid_input'; end if;
    end loop;
    if coalesce(btrim(p_registry_data ->> 'nom'),'') = '' or coalesce(btrim(p_registry_data ->> 'prenoms'),'') = ''
       or coalesce(p_registry_data ->> 'date_naissance','') !~ '^\d{4}-\d{2}-\d{2}$' or coalesce(btrim(p_registry_data ->> 'lieu_naissance'),'') = '' then raise exception 'invalid_input'; end if;
  end if;
  insert into civil_registry_checks (municipality_id, application_id, outcome, registry_ref, registry_data, note, checked_by)
  values (a.municipality_id, p_application, p_outcome, nullif(btrim(p_registry_ref),''), case when p_outcome = 'found' then p_registry_data end, nullif(btrim(p_note),''), auth.uid());
  perform write_audit(a.municipality_id, 'registry_check', 'application', p_application, jsonb_build_object('outcome', p_outcome));
end $$;
revoke all on function public.record_registry_check(uuid,text,text,jsonb,text) from public, anon;
grant execute on function public.record_registry_check(uuid,text,text,jsonb,text) to authenticated, service_role;

-- Modèles
create table public.document_templates (
  id uuid primary key default gen_random_uuid(),
  municipality_id uuid not null references public.municipalities(id) on delete cascade,
  code text not null check (code in ('extrait_naissance','certificat_residence')),
  name text not null,
  created_at timestamptz not null default now(),
  unique (municipality_id, code), unique (id, municipality_id)
);
create table public.document_template_versions (
  id uuid primary key default gen_random_uuid(),
  municipality_id uuid not null,
  template_id uuid not null,
  version int not null check (version > 0),
  status text not null default 'draft' check (status in ('draft','published','archived')),
  content jsonb not null check (jsonb_typeof(content) = 'object'),
  is_provisional boolean not null default true,      -- true tant que la mairie n'a pas validé officiellement ce modèle
  validated_by uuid references public.profiles(id), validated_at timestamptz,
  created_by uuid references public.profiles(id), published_at timestamptz,
  created_at timestamptz not null default now(),
  unique (template_id, version), unique (id, municipality_id),
  foreign key (template_id, municipality_id) references public.document_templates(id, municipality_id) on delete cascade
);
create unique index one_published_version on public.document_template_versions (template_id) where status = 'published';

create or replace function public.template_version_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' and pg_trigger_depth() = 1 then raise exception 'document_locked'; end if;
    return old;
  end if;
  if old.status = 'draft' then return new; end if;
  -- publiée -> archivée uniquement ; rien d'autre ne change, jamais
  if old.status = 'published' and new.status = 'archived'
     and new.content = old.content and new.version = old.version and new.is_provisional = old.is_provisional and new.template_id = old.template_id then return new; end if;
  raise exception 'document_locked';
end $$;
create trigger trg_tv_guard before update or delete on public.document_template_versions for each row execute function public.template_version_guard();

alter table public.document_templates enable row level security;
alter table public.document_template_versions enable row level security;
create policy tpl_read on public.document_templates for select using (public.has_permission(municipality_id, 'templates.manage'));
create policy tv_read on public.document_template_versions for select using (public.has_permission(municipality_id, 'templates.manage'));
create policy tv_insert on public.document_template_versions for insert
  with check (status = 'draft' and is_provisional and created_by = auth.uid() and public.has_permission(municipality_id, 'templates.manage'));
create policy tv_update on public.document_template_versions for update
  using (status = 'draft' and public.has_permission(municipality_id, 'templates.manage'))
  with check (status = 'draft' and is_provisional and public.has_permission(municipality_id, 'templates.manage'));
create policy tv_delete on public.document_template_versions for delete using (status = 'draft' and public.has_permission(municipality_id, 'templates.manage'));

create or replace function public.publish_template_version(p_version uuid, p_official boolean) returns void
language plpgsql security definer set search_path = public as $$
declare v document_template_versions%rowtype;
begin
  select * into v from document_template_versions where id = p_version for update;
  if not found or auth.uid() is null or not has_permission(v.municipality_id, 'templates.publish') then raise exception 'forbidden' using errcode = '42501'; end if;
  if v.status <> 'draft' then raise exception 'transition_not_allowed'; end if;
  update document_template_versions set status = 'archived' where template_id = v.template_id and status = 'published';
  update document_template_versions set status = 'published', published_at = now(),
    is_provisional = not coalesce(p_official, false),
    validated_by = case when p_official then auth.uid() end, validated_at = case when p_official then now() end
  where id = p_version;
  perform write_audit(v.municipality_id, 'template_publish', 'template_version', p_version, jsonb_build_object('version', v.version, 'official', coalesce(p_official, false)));
end $$;
revoke all on function public.publish_template_version(uuid,boolean) from public, anon;
grant execute on function public.publish_template_version(uuid,boolean) to authenticated, service_role;

-- Documents émis
create table public.issued_documents (
  id uuid primary key default gen_random_uuid(),
  municipality_id uuid not null,
  application_id uuid not null,
  template_version_id uuid not null,
  document_number text not null,
  snapshot jsonb not null,                       -- valeurs figées au moment de la génération
  is_specimen boolean not null,
  status text not null default 'pending' check (status in ('pending','generated','superseded')),
  pdf_path text, pdf_sha256 text,
  generated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(), finalized_at timestamptz,
  printed_at timestamptz, printed_by uuid references public.profiles(id),
  handed_at timestamptz, handed_by uuid references public.profiles(id),
  locked_at timestamptz,                         -- posé à la signature : document définitivement immuable
  superseded_at timestamptz, superseded_reason text,
  foreign key (application_id, municipality_id) references public.applications(id, municipality_id),
  foreign key (template_version_id, municipality_id) references public.document_template_versions(id, municipality_id),
  unique (id, municipality_id)
);
create unique index one_live_document on public.issued_documents (application_id) where status in ('pending','generated');
create index on public.issued_documents (municipality_id, created_at desc);

create or replace function public.issued_document_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then if pg_trigger_depth() = 1 then raise exception 'document_locked'; end if; return old; end if;
  if old.locked_at is not null then raise exception 'document_locked'; end if;
  if old.pdf_sha256 is not null and (new.pdf_sha256 is distinct from old.pdf_sha256 or new.pdf_path is distinct from old.pdf_path
     or new.snapshot <> old.snapshot or new.document_number <> old.document_number or new.template_version_id <> old.template_version_id)
    then raise exception 'document_locked'; end if;
  return new;
end $$;
create trigger trg_issued_guard before update or delete on public.issued_documents for each row execute function public.issued_document_guard();

create table public.signatures (
  id uuid primary key default gen_random_uuid(),
  municipality_id uuid not null, application_id uuid not null,
  issued_document_id uuid not null unique,
  signer_name text not null check (length(btrim(signer_name)) between 2 and 120),
  signer_title text not null check (length(btrim(signer_title)) between 2 and 120),
  confirmed_by uuid not null references public.profiles(id),
  confirmed_at timestamptz not null default clock_timestamp(),
  foreign key (issued_document_id, municipality_id) references public.issued_documents(id, municipality_id)
);
create table public.withdrawals (
  id uuid primary key default gen_random_uuid(),
  municipality_id uuid not null, application_id uuid not null,
  issued_document_id uuid not null unique,
  withdrawn_by_name text not null check (length(btrim(withdrawn_by_name)) between 2 and 120),
  relationship text not null check (length(btrim(relationship)) between 2 and 60),
  id_type text not null check (id_type in ('cnib','passeport','permis','autre')),
  id_number_last4 text not null check (length(id_number_last4) between 2 and 4),   -- minimisation : quatre derniers caractères seulement
  agent_id uuid not null references public.profiles(id),
  withdrawn_at timestamptz not null default clock_timestamp(),
  foreign key (issued_document_id, municipality_id) references public.issued_documents(id, municipality_id)
);
create trigger trg_sig_ro before update or delete on public.signatures for each row execute function public.events_append_only();
create trigger trg_wd_ro before update or delete on public.withdrawals for each row execute function public.events_append_only();
alter table public.issued_documents enable row level security;
alter table public.signatures enable row level security;
alter table public.withdrawals enable row level security;
create policy issued_read on public.issued_documents for select using (public.has_permission(municipality_id, 'applications.read'));
create policy sig_read on public.signatures for select using (public.has_permission(municipality_id, 'applications.read'));
create policy wd_read on public.withdrawals for select using (public.has_permission(municipality_id, 'applications.read'));

-- Numérotation administrative atomique des documents générés par la mairie (hors extrait : son numéro vient du registre)
create or replace function public.next_document_number(p_municipality uuid, p_kind text) returns text
language plpgsql security definer set search_path = public as $$
declare v_year int := extract(year from now() at time zone 'Africa/Ouagadougou')::int; v_n bigint; v_prefix text;
begin
  insert into numbering_counters as c (municipality_id, kind, year, last_value) values (p_municipality, 'doc_' || p_kind, v_year, 1)
  on conflict (municipality_id, kind, year) do update set last_value = c.last_value + 1 returning last_value into v_n;
  select reference_prefix into v_prefix from municipalities where id = p_municipality;
  return format('%s-%s-%s-%s', v_prefix, upper(p_kind), v_year, lpad(v_n::text, 6, '0'));
end $$;
revoke all on function public.next_document_number(uuid,text) from public, anon, authenticated;

-- Avancement d'une demande par une fonction documentaire (jamais via agent_transition : transitions « enabled=false »)
create or replace function public._advance(p_application uuid, p_from text, p_to text, p_permission text) returns applications
language plpgsql security definer set search_path = public as $$
declare a applications%rowtype;
begin
  if auth.uid() is null then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into a from applications where id = p_application for update;
  if not found or not has_permission(a.municipality_id, 'applications.read') then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not has_permission(a.municipality_id, p_permission) then raise exception 'forbidden' using errcode = '42501'; end if;
  if a.status <> p_from then raise exception 'transition_not_allowed'; end if;
  update applications set status = p_to where id = a.id;
  insert into application_events (municipality_id, application_id, from_status, to_status, actor_type, actor_id) values (a.municipality_id, a.id, p_from, p_to, 'agent', auth.uid());
  perform write_audit(a.municipality_id, 'doc_' || lower(p_to), 'application', a.id, jsonb_build_object('from', p_from, 'to', p_to));
  return a;
end $$;
revoke all on function public._advance(uuid,text,text,text) from public, anon, authenticated;

create or replace function public.prepare_document(p_application uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare a applications%rowtype; v_code text; v_tv document_template_versions%rowtype; v_m municipalities%rowtype;
        v_data jsonb; v_chk civil_registry_checks%rowtype; v_snap jsonb; v_num text; v_doc issued_documents%rowtype;
begin
  if auth.uid() is null then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into a from applications where id = p_application for update;
  if not found or not has_permission(a.municipality_id, 'applications.read') then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not has_permission(a.municipality_id, 'documents.generate') then raise exception 'forbidden' using errcode = '42501'; end if;
  if a.status <> 'VALIDATED' then raise exception 'transition_not_allowed'; end if;
  select code into v_code from services where id = a.service_id;
  select v.* into v_tv from document_template_versions v join document_templates t on t.id = v.template_id
    where t.municipality_id = a.municipality_id and t.code = v_code and v.status = 'published';
  if not found then raise exception 'template_missing'; end if;
  select * into v_m from municipalities where id = a.municipality_id;

  select * into v_doc from issued_documents where application_id = a.id and status = 'pending';   -- reprise après échec de rendu : même numéro
  if found then
    return jsonb_build_object('document_id', v_doc.id, 'snapshot', v_doc.snapshot, 'content', (select content from document_template_versions where id = v_doc.template_version_id),
      'template_version', (select version from document_template_versions where id = v_doc.template_version_id), 'is_specimen', v_doc.is_specimen, 'template_code', v_code);
  end if;

  if v_code = 'extrait_naissance' then
    select * into v_chk from civil_registry_checks where application_id = a.id order by seq desc limit 1;
    if not found or v_chk.outcome <> 'found' then raise exception 'registry_check_required'; end if;
    v_data := v_chk.registry_data || jsonb_build_object('numero_acte', v_chk.registry_ref);   -- données du REGISTRE uniquement
    v_num := v_chk.registry_ref;                                                              -- aucun numéro d'acte inventé
  else
    select data into v_data from application_data where application_id = a.id;
    -- régénération avant signature : on conserve le numéro déjà attribué à cette demande (pas de trou dans la numérotation)
    select document_number into v_num from issued_documents where application_id = a.id order by created_at desc limit 1;
    if v_num is null then v_num := next_document_number(a.municipality_id, 'CR'); end if;
  end if;
  v_snap := coalesce(v_data, '{}'::jsonb) || jsonb_build_object('document_number', v_num, 'commune', v_m.name, 'province', v_m.province, 'region', v_m.region,
    'lieu_delivrance', v_m.name, 'date_delivrance', (now() at time zone 'Africa/Ouagadougou')::date::text);
  insert into issued_documents (municipality_id, application_id, template_version_id, document_number, snapshot, is_specimen, generated_by)
  values (a.municipality_id, a.id, v_tv.id, v_num, v_snap, v_tv.is_provisional, auth.uid()) returning * into v_doc;
  return jsonb_build_object('document_id', v_doc.id, 'snapshot', v_snap, 'content', v_tv.content, 'template_version', v_tv.version, 'is_specimen', v_tv.is_provisional, 'template_code', v_code);
end $$;

create or replace function public._doc(p_doc uuid) returns issued_documents
language sql stable security definer set search_path = public as $$ select * from issued_documents where id = p_doc $$;
revoke all on function public._doc(uuid) from public, anon, authenticated;

create or replace function public.finalize_document(p_doc uuid, p_pdf_path text, p_sha256 text) returns void
language plpgsql security definer set search_path = public as $$
declare d issued_documents%rowtype;
begin
  select * into d from issued_documents where id = p_doc for update;
  if not found or not has_permission(d.municipality_id, 'applications.read') then raise exception 'not_found' using errcode = 'P0002'; end if;
  if d.status <> 'pending' or p_pdf_path is null or p_sha256 !~ '^[0-9a-f]{64}$' then raise exception 'invalid_input'; end if;
  perform _advance(d.application_id, 'VALIDATED', 'DOCUMENT_GENERATED', 'documents.generate');
  update issued_documents set pdf_path = p_pdf_path, pdf_sha256 = p_sha256, status = 'generated', finalized_at = now() where id = p_doc;
end $$;

create or replace function public.discard_document(p_doc uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare d issued_documents%rowtype; a applications%rowtype;
begin
  select * into d from issued_documents where id = p_doc for update;
  if not found or not has_permission(d.municipality_id, 'applications.read') then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not has_permission(d.municipality_id, 'documents.generate') then raise exception 'forbidden' using errcode = '42501'; end if;
  if d.locked_at is not null then raise exception 'document_locked'; end if;
  if coalesce(btrim(p_reason),'') = '' then raise exception 'note_required'; end if;
  select * into a from applications where id = d.application_id for update;
  if a.status not in ('DOCUMENT_GENERATED','PRINTED','PENDING_SIGNATURE') and not (a.status = 'VALIDATED' and d.status = 'pending') then raise exception 'transition_not_allowed'; end if;
  update issued_documents set status = 'superseded', superseded_at = now(), superseded_reason = btrim(p_reason) where id = p_doc;
  if a.status <> 'VALIDATED' then
    update applications set status = 'VALIDATED' where id = a.id;
    insert into application_events (municipality_id, application_id, from_status, to_status, actor_type, actor_id) values (a.municipality_id, a.id, a.status, 'VALIDATED', 'agent', auth.uid());
  end if;
  perform write_audit(d.municipality_id, 'doc_discard', 'issued_document', p_doc, jsonb_build_object('reason', btrim(p_reason)));
end $$;

create or replace function public.mark_printed(p_doc uuid) returns void language plpgsql security definer set search_path = public as $$
declare d issued_documents%rowtype;
begin
  select * into d from issued_documents where id = p_doc for update;
  if not found or d.status <> 'generated' then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform _advance(d.application_id, 'DOCUMENT_GENERATED', 'PRINTED', 'documents.print');
  update issued_documents set printed_at = now(), printed_by = auth.uid() where id = p_doc;
end $$;
create or replace function public.hand_to_signer(p_doc uuid) returns void language plpgsql security definer set search_path = public as $$
declare d issued_documents%rowtype;
begin
  select * into d from issued_documents where id = p_doc for update;
  if not found or d.status <> 'generated' then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform _advance(d.application_id, 'PRINTED', 'PENDING_SIGNATURE', 'documents.print');
  update issued_documents set handed_at = now(), handed_by = auth.uid() where id = p_doc;
end $$;
create or replace function public.confirm_signature(p_doc uuid, p_signer_name text, p_signer_title text) returns void
language plpgsql security definer set search_path = public as $$
declare d issued_documents%rowtype;
begin
  select * into d from issued_documents where id = p_doc for update;
  if not found or d.status <> 'generated' then raise exception 'not_found' using errcode = 'P0002'; end if;
  if length(btrim(coalesce(p_signer_name,''))) < 2 or length(btrim(coalesce(p_signer_title,''))) < 2 then raise exception 'invalid_input'; end if;
  perform _advance(d.application_id, 'PENDING_SIGNATURE', 'SIGNED', 'documents.sign_confirm');
  insert into signatures (municipality_id, application_id, issued_document_id, signer_name, signer_title, confirmed_by)
  values (d.municipality_id, d.application_id, p_doc, btrim(p_signer_name), btrim(p_signer_title), auth.uid());
  update issued_documents set locked_at = now() where id = p_doc;     -- à partir d'ici : immuable
end $$;
create or replace function public.release_document(p_doc uuid) returns void language plpgsql security definer set search_path = public as $$
declare d issued_documents%rowtype;
begin
  select * into d from issued_documents where id = p_doc;
  if not found or d.status <> 'generated' then raise exception 'not_found' using errcode = 'P0002'; end if;
  if d.is_specimen then raise exception 'specimen_not_releasable'; end if;
  perform _advance(d.application_id, 'SIGNED', 'READY_FOR_PICKUP', 'documents.release');
end $$;
create or replace function public.record_withdrawal(p_doc uuid, p_name text, p_relationship text, p_id_type text, p_id_number text, p_identity_verified boolean) returns void
language plpgsql security definer set search_path = public as $$
declare d issued_documents%rowtype; v_n text := regexp_replace(coalesce(p_id_number,''), '\s', '', 'g');
begin
  select * into d from issued_documents where id = p_doc;
  if not found or d.status <> 'generated' then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not coalesce(p_identity_verified, false) then raise exception 'verification_required'; end if;
  if length(v_n) < 4 or length(btrim(coalesce(p_name,''))) < 2 or length(btrim(coalesce(p_relationship,''))) < 2 or p_id_type not in ('cnib','passeport','permis','autre') then raise exception 'invalid_input'; end if;
  perform _advance(d.application_id, 'READY_FOR_PICKUP', 'WITHDRAWN', 'documents.withdraw');
  insert into withdrawals (municipality_id, application_id, issued_document_id, withdrawn_by_name, relationship, id_type, id_number_last4, agent_id)
  values (d.municipality_id, d.application_id, p_doc, btrim(p_name), btrim(p_relationship), p_id_type, right(v_n, 4), auth.uid());
end $$;

revoke all on function public.prepare_document(uuid), public.finalize_document(uuid,text,text), public.discard_document(uuid,text), public.mark_printed(uuid),
  public.hand_to_signer(uuid), public.confirm_signature(uuid,text,text), public.release_document(uuid), public.record_withdrawal(uuid,text,text,text,text,boolean) from public, anon;
grant execute on function public.prepare_document(uuid), public.finalize_document(uuid,text,text), public.discard_document(uuid,text), public.mark_printed(uuid),
  public.hand_to_signer(uuid), public.confirm_signature(uuid,text,text), public.release_document(uuid), public.record_withdrawal(uuid,text,text,text,text,boolean) to authenticated, service_role;

-- Stockage : PDF privés ; logos publics (non sensibles)
do $$ begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public) values ('issued-documents','issued-documents', false) on conflict (id) do update set public = false;
    insert into storage.buckets (id, name, public) values ('municipality-logos','municipality-logos', true) on conflict (id) do update set public = true;
  end if;
end $$;
