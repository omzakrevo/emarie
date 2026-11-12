-- 0011 — Notifications SMS : modèles par événement/langue, file d'attente, reprises, historique.
-- Aucun fournisseur SMS n'est intégré : le mode « test » n'envoie RIEN et l'historique le dit (statut test_sent).

create table public.notification_templates (
  id uuid primary key default gen_random_uuid(),
  municipality_id uuid not null references public.municipalities(id) on delete cascade,
  event text not null check (event in ('application_submitted','payment_confirmed','under_review','info_required','validated','document_signed','ready_for_pickup','withdrawn')),
  locale text not null check (locale in ('fr','dyu')),
  body text not null check (length(btrim(body)) between 5 and 320),   -- {commune} et {reference} seuls autorisés (contrôlé côté serveur)
  is_active boolean not null default true,
  updated_at timestamptz not null default now(),
  unique (municipality_id, event, locale)
);
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  municipality_id uuid not null, application_id uuid not null,
  source_event_id uuid not null unique,                 -- une notification par événement d'historique (pas de doublon)
  event text not null, locale text not null,
  to_phone text not null, body text not null,
  status text not null default 'queued' check (status in ('queued','sending','sent','test_sent','dead')),
  attempts int not null default 0, next_attempt_at timestamptz not null default now(), last_error text,
  provider text, provider_message_id text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), sent_at timestamptz,
  foreign key (application_id, municipality_id) references public.applications(id, municipality_id) on delete cascade
);
create index on public.notifications (status, next_attempt_at);
create index on public.notifications (municipality_id, created_at desc);
alter table public.notification_templates enable row level security; alter table public.notifications enable row level security;
create policy nt_read on public.notification_templates for select using (public.has_permission(municipality_id, 'sms.manage'));
create policy nt_write on public.notification_templates for all using (public.has_permission(municipality_id, 'sms.manage')) with check (public.has_permission(municipality_id, 'sms.manage'));
create policy notif_read on public.notifications for select using (public.has_permission(municipality_id, 'sms.manage'));

create or replace function public.seed_default_notification_templates(p_municipality uuid) returns void
language sql security definer set search_path = public as $$
  insert into notification_templates (municipality_id, event, locale, body) values
    (p_municipality, 'application_submitted', 'fr', '{commune} : votre demande {reference} est enregistrée. Suivez-la sur le portail avec votre code de suivi.'),
    (p_municipality, 'payment_confirmed', 'fr', '{commune} : paiement reçu pour la demande {reference}.'),
    (p_municipality, 'under_review', 'fr', '{commune} : votre demande {reference} est en cours de vérification.'),
    (p_municipality, 'info_required', 'fr', '{commune} : des informations complémentaires sont demandées pour la demande {reference}. Consultez le suivi.'),
    (p_municipality, 'validated', 'fr', '{commune} : votre demande {reference} est validée.'),
    (p_municipality, 'document_signed', 'fr', '{commune} : le document de la demande {reference} est signé.'),
    (p_municipality, 'ready_for_pickup', 'fr', '{commune} : votre document (demande {reference}) est prêt. Retrait à la mairie sur présentation d''une pièce d''identité.'),
    (p_municipality, 'withdrawn', 'fr', '{commune} : le document de la demande {reference} a été retiré.')
  on conflict (municipality_id, event, locale) do nothing;
$$;
revoke all on function public.seed_default_notification_templates(uuid) from public, anon, authenticated;

-- Mise en file automatique à chaque événement d'historique pertinent. Aucune donnée personnelle dans le texte (référence + commune seulement).
create or replace function public.enqueue_notification() returns trigger language plpgsql security definer set search_path = public as $$
declare a applications%rowtype; v_event text; v_t notification_templates%rowtype; v_commune text;
begin
  v_event := case new.to_status when 'SUBMITTED' then 'application_submitted' when 'PAID' then 'payment_confirmed' when 'UNDER_REVIEW' then 'under_review'
    when 'ADDITIONAL_INFO_REQUIRED' then 'info_required' when 'VALIDATED' then 'validated' when 'SIGNED' then 'document_signed'
    when 'READY_FOR_PICKUP' then 'ready_for_pickup' when 'WITHDRAWN' then 'withdrawn' end;
  if v_event is null then return new; end if;
  select * into a from applications where id = new.application_id;
  if a.contact_phone is null or a.reference is null then return new; end if;
  select * into v_t from notification_templates where municipality_id = new.municipality_id and event = v_event and is_active and locale = a.locale;
  if not found then select * into v_t from notification_templates where municipality_id = new.municipality_id and event = v_event and is_active and locale = 'fr'; end if;
  if not found then return new; end if;
  select name into v_commune from municipalities where id = new.municipality_id;
  insert into notifications (municipality_id, application_id, source_event_id, event, locale, to_phone, body)
  values (new.municipality_id, new.application_id, new.id, v_event, v_t.locale, a.contact_phone, replace(replace(v_t.body, '{commune}', v_commune), '{reference}', a.reference))
  on conflict (source_event_id) do nothing;
  return new;
end $$;
create trigger trg_enqueue_notification after insert on public.application_events for each row execute function public.enqueue_notification();

-- Traitement de la file : réservation sans collision (SKIP LOCKED), reprises 1 min / 5 min / 30 min / 2 h puis abandon
create or replace function public.claim_notifications(p_limit int default 20) returns setof public.notifications
language sql security definer set search_path = public as $$
  update notifications n set status = 'sending', attempts = n.attempts + 1, updated_at = now()
  where n.id in (select id from notifications where (status = 'queued' and next_attempt_at <= now()) or (status = 'sending' and updated_at < now() - interval '10 minutes')
                 order by created_at for update skip locked limit greatest(1, least(p_limit, 100)))
  returning n.*;
$$;
create or replace function public.complete_notification(p_id uuid, p_ok boolean, p_test boolean, p_provider text, p_message_id text, p_error text) returns void
language plpgsql security definer set search_path = public as $$
declare n notifications%rowtype;
begin
  select * into n from notifications where id = p_id for update;
  if not found or n.status <> 'sending' then return; end if;
  if p_ok then
    update notifications set status = case when p_test then 'test_sent' else 'sent' end, sent_at = now(), provider = p_provider, provider_message_id = p_message_id, last_error = null, updated_at = now() where id = p_id;
  elsif n.attempts >= 5 then
    update notifications set status = 'dead', last_error = left(p_error, 200), updated_at = now() where id = p_id;
  else
    update notifications set status = 'queued', last_error = left(p_error, 200), updated_at = now(),
      next_attempt_at = now() + (case n.attempts when 1 then interval '1 minute' when 2 then interval '5 minutes' when 3 then interval '30 minutes' else interval '2 hours' end) where id = p_id;
  end if;
end $$;
create or replace function public.retry_notification(p_id uuid) returns void language plpgsql security definer set search_path = public as $$
declare n notifications%rowtype;
begin
  select * into n from notifications where id = p_id for update;
  if not found or auth.uid() is null or not has_permission(n.municipality_id, 'sms.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  if n.status <> 'dead' then raise exception 'transition_not_allowed'; end if;
  update notifications set status = 'queued', attempts = 0, next_attempt_at = now(), last_error = null where id = p_id;
  perform write_audit(n.municipality_id, 'sms_retry', 'notification', p_id, '{}'::jsonb);
end $$;
revoke all on function public.claim_notifications(int), public.complete_notification(uuid,boolean,boolean,text,text,text) from public, anon, authenticated;
grant execute on function public.claim_notifications(int), public.complete_notification(uuid,boolean,boolean,text,text,text) to service_role;
revoke all on function public.retry_notification(uuid) from public, anon;
grant execute on function public.retry_notification(uuid) to authenticated, service_role;

select public.seed_default_notification_templates(id) from public.municipalities where slug = 'niankorodougou';
