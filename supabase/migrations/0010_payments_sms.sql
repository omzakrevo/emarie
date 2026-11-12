-- 0010 — Phase 6 : paiements (sandbox + adaptateurs), webhooks idempotents, quittances, remboursements à double validation,
-- réconciliation, notifications SMS en file d'attente. Aucun secret ni clé de prestataire n'est stocké en base.

-- Fournisseurs activés par commune (les secrets restent dans l'environnement du serveur, jamais ici)
create table public.payment_provider_configs (
  municipality_id uuid not null references public.municipalities(id) on delete cascade,
  provider text not null check (provider in ('sandbox','orange_money','moov_money')),
  enabled boolean not null default false,
  merchant_label text,
  updated_at timestamptz not null default now(),
  primary key (municipality_id, provider)
);
alter table public.payment_provider_configs enable row level security;
create policy ppc_read on public.payment_provider_configs for select using (public.has_permission(municipality_id, 'payments.read') or public.has_permission(municipality_id, 'municipality.settings.manage'));
create policy ppc_write on public.payment_provider_configs for all using (public.has_permission(municipality_id, 'municipality.settings.manage')) with check (public.has_permission(municipality_id, 'municipality.settings.manage'));

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  municipality_id uuid not null,
  application_id uuid not null,
  amount_xof int not null check (amount_xof > 0),                  -- calculé côté base à partir du tarif en vigueur, jamais fourni par le client
  currency text not null default 'XOF' check (currency = 'XOF'),
  provider text not null check (provider in ('sandbox','orange_money','moov_money')),
  mode text not null check (mode in ('sandbox','live')),
  status text not null default 'CREATED' check (status in ('CREATED','PENDING','PAID','FAILED','CANCELLED','REFUNDED')),
  payer_phone text,
  price_id uuid,
  provider_reference text,
  idempotency_key text not null check (length(idempotency_key) between 8 and 80),
  needs_review boolean not null default false, review_reason text,
  failure_reason text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), paid_at timestamptz,
  foreign key (application_id, municipality_id) references public.applications(id, municipality_id),
  unique (id, municipality_id), unique (municipality_id, idempotency_key)
);
create unique index payments_one_active on public.payments (application_id) where status in ('CREATED','PENDING','PAID');   -- anti double-paiement
create unique index payments_provider_ref on public.payments (provider, provider_reference) where provider_reference is not null;
create index on public.payments (municipality_id, created_at desc);
create trigger trg_payments_updated before update on public.payments for each row execute function public.set_updated_at();

create table public.payment_webhooks (
  id uuid primary key default gen_random_uuid(),
  provider text not null, event_id text not null,
  signature_valid boolean not null,
  payload jsonb not null,
  received_at timestamptz not null default now(), processed_at timestamptz, result text,
  unique (provider, event_id)                                       -- un même événement n'est jamais traité deux fois
);
create table public.receipts (
  id uuid primary key default gen_random_uuid(),
  municipality_id uuid not null, application_id uuid not null,
  payment_id uuid not null unique,
  receipt_number text not null,
  amount_xof int not null, is_sandbox boolean not null,
  pdf_path text, pdf_sha256 text,
  issued_at timestamptz not null default now(),
  foreign key (payment_id, municipality_id) references public.payments(id, municipality_id),
  unique (municipality_id, receipt_number)
);
create table public.refunds (
  id uuid primary key default gen_random_uuid(),
  municipality_id uuid not null, payment_id uuid not null,
  amount_xof int not null check (amount_xof > 0),
  reason text not null check (length(btrim(reason)) between 3 and 300),
  status text not null default 'requested' check (status in ('requested','approved','rejected','executed')),
  requested_by uuid not null references public.profiles(id), decided_by uuid references public.profiles(id), executed_by uuid references public.profiles(id),
  provider_reference text,
  created_at timestamptz not null default now(), decided_at timestamptz, executed_at timestamptz,
  foreign key (payment_id, municipality_id) references public.payments(id, municipality_id)
);
alter table public.payments enable row level security; alter table public.payment_webhooks enable row level security;
alter table public.receipts enable row level security; alter table public.refunds enable row level security;
create policy payments_read on public.payments for select using (public.has_permission(municipality_id, 'payments.read'));
create policy receipts_read on public.receipts for select using (public.has_permission(municipality_id, 'payments.read'));
create policy refunds_read on public.refunds for select using (public.has_permission(municipality_id, 'payments.read'));
-- payment_webhooks : aucune policy (service_role uniquement)

-- Initiation : montant calculé ICI, un seul paiement actif par demande, idempotent par clé
create or replace function public.initiate_payment(p_application uuid, p_provider text, p_payer_phone text, p_idempotency_key text, p_mode text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare a applications%rowtype; v_amount int; v_price uuid; v_pay payments%rowtype;
begin
  select * into a from applications where id = p_application for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into v_pay from payments where municipality_id = a.municipality_id and idempotency_key = p_idempotency_key;
  if found then return jsonb_build_object('payment_id', v_pay.id, 'amount_xof', v_pay.amount_xof, 'status', v_pay.status, 'free', false, 'reused', true); end if;
  if p_provider not in ('sandbox','orange_money','moov_money') or p_mode not in ('sandbox','live') or (p_mode = 'live' and p_provider = 'sandbox') then raise exception 'invalid_input'; end if;
  if not exists (select 1 from payment_provider_configs where municipality_id = a.municipality_id and provider = p_provider and enabled) then raise exception 'provider_disabled'; end if;
  if a.status <> 'SUBMITTED' then
    if exists (select 1 from payments where application_id = a.id and status in ('CREATED','PENDING','PAID')) then raise exception 'payment_in_progress'; end if;
    raise exception 'transition_not_allowed';
  end if;
  select sp.id, sp.amount_xof into v_price, v_amount from service_pricing sp
   where sp.service_id = a.service_id and sp.valid_from <= current_date and (sp.valid_to is null or sp.valid_to >= current_date) order by sp.valid_from desc limit 1;
  if v_amount is null then raise exception 'price_unknown'; end if;
  if v_amount = 0 then   -- gratuit : aucune transaction
    update applications set status = 'PAID' where id = a.id;
    insert into application_events (municipality_id, application_id, from_status, to_status, actor_type) values (a.municipality_id, a.id, 'SUBMITTED', 'PAID', 'system');
    return jsonb_build_object('free', true, 'amount_xof', 0);
  end if;
  insert into payments (municipality_id, application_id, amount_xof, provider, mode, payer_phone, price_id, idempotency_key)
  values (a.municipality_id, a.id, v_amount, p_provider, p_mode, nullif(btrim(p_payer_phone), ''), v_price, p_idempotency_key) returning * into v_pay;
  update applications set status = 'PAYMENT_PENDING' where id = a.id;
  insert into application_events (municipality_id, application_id, from_status, to_status, actor_type) values (a.municipality_id, a.id, 'SUBMITTED', 'PAYMENT_PENDING', 'system');
  return jsonb_build_object('payment_id', v_pay.id, 'amount_xof', v_amount, 'status', v_pay.status, 'free', false, 'reused', false);
end $$;

create or replace function public.mark_payment_pending(p_payment uuid, p_provider_reference text) returns void
language plpgsql security definer set search_path = public as $$
begin
  update payments set status = 'PENDING', provider_reference = nullif(btrim(p_provider_reference), '') where id = p_payment and status = 'CREATED';
  if not found then raise exception 'transition_not_allowed'; end if;
end $$;

-- Échec avant tout débit (prestataire injoignable…) : la demande redevient payable
create or replace function public.fail_payment_creation(p_payment uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare p payments%rowtype;
begin
  select * into p from payments where id = p_payment for update;
  if not found or p.status <> 'CREATED' then return; end if;
  update payments set status = 'FAILED', failure_reason = left(p_reason, 200) where id = p.id;
  update applications set status = 'SUBMITTED' where id = p.application_id and status = 'PAYMENT_PENDING';
  insert into application_events (municipality_id, application_id, from_status, to_status, actor_type, public_note)
  values (p.municipality_id, p.application_id, 'PAYMENT_PENDING', 'SUBMITTED', 'system', 'Paiement non abouti. Vous pouvez réessayer.');
end $$;

-- Résultat vérifié d'un prestataire. Idempotent ; ne passe PAID que si montant ET prestataire correspondent.
create or replace function public.apply_payment_result(p_payment uuid, p_provider text, p_status text, p_provider_reference text, p_amount_xof int) returns text
language plpgsql security definer set search_path = public as $$
declare p payments%rowtype; a applications%rowtype;
begin
  select * into p from payments where id = p_payment for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p.provider <> p_provider or p_status not in ('PAID','FAILED','CANCELLED') then raise exception 'invalid_input'; end if;
  if p.status in ('PAID','REFUNDED') then return 'duplicate'; end if;
  if p.status in ('FAILED','CANCELLED') and p_status <> 'PAID' then return 'duplicate'; end if;
  select * into a from applications where id = p.application_id for update;

  if p_status = 'PAID' then
    if p_amount_xof is distinct from p.amount_xof or (p.provider_reference is not null and p_provider_reference is distinct from p.provider_reference) then
      update payments set needs_review = true, review_reason = 'amount_or_reference_mismatch' where id = p.id;   -- jamais PAID sur un montant discordant
      return 'needs_review';
    end if;
    update payments set status = 'PAID', paid_at = now(), provider_reference = coalesce(provider_reference, nullif(btrim(p_provider_reference), '')) where id = p.id;
    if a.status = 'PAYMENT_PENDING' then
      update applications set status = 'PAID' where id = a.id;
      insert into application_events (municipality_id, application_id, from_status, to_status, actor_type) values (a.municipality_id, a.id, 'PAYMENT_PENDING', 'PAID', 'system');
    else
      update payments set needs_review = true, review_reason = 'paid_but_application_not_pending' where id = p.id;  -- argent reçu, dossier dans un autre état : revue manuelle
    end if;
    return 'paid';
  end if;

  update payments set status = p_status, failure_reason = p_status where id = p.id;
  if a.status = 'PAYMENT_PENDING' then
    update applications set status = 'SUBMITTED' where id = a.id;
    insert into application_events (municipality_id, application_id, from_status, to_status, actor_type, public_note)
    values (a.municipality_id, a.id, 'PAYMENT_PENDING', 'SUBMITTED', 'system', 'Paiement non abouti. Vous pouvez réessayer.');
  end if;
  return 'failed';
end $$;

create or replace function public.record_webhook(p_provider text, p_event_id text, p_payload jsonb, p_valid boolean) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not p_valid then
    insert into payment_webhooks (provider, event_id, signature_valid, payload, result) values (p_provider, 'invalid:' || gen_random_uuid(), false, p_payload, 'rejected') returning id into v_id;
    return null;
  end if;
  insert into payment_webhooks (provider, event_id, signature_valid, payload) values (p_provider, p_event_id, true, p_payload)
  on conflict (provider, event_id) do nothing returning id into v_id;
  return v_id;                       -- null = événement déjà reçu (rejeu) : rien à refaire
end $$;
create or replace function public.mark_webhook_processed(p_id uuid, p_result text) returns void language sql security definer set search_path = public as
$$ update payment_webhooks set processed_at = now(), result = left(p_result, 100) where id = p_id $$;

-- Quittance : numéro atomique par commune/année, idempotent
create or replace function public.issue_receipt(p_payment uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p payments%rowtype; r receipts%rowtype; v_m municipalities%rowtype; v_ref text; v_svc jsonb;
begin
  select * into p from payments where id = p_payment for update;
  if not found or p.status not in ('PAID','REFUNDED') then raise exception 'transition_not_allowed'; end if;
  select * into r from receipts where payment_id = p.id;
  if not found then
    insert into receipts (municipality_id, application_id, payment_id, receipt_number, amount_xof, is_sandbox)
    values (p.municipality_id, p.application_id, p.id, next_document_number(p.municipality_id, 'RC'), p.amount_xof, p.mode = 'sandbox') returning * into r;
  end if;
  select * into v_m from municipalities where id = p.municipality_id;
  select a.reference, s.name into v_ref, v_svc from applications a join services s on s.id = a.service_id where a.id = p.application_id;
  return jsonb_build_object('receipt_id', r.id, 'receipt_number', r.receipt_number, 'amount_xof', r.amount_xof, 'is_sandbox', r.is_sandbox, 'issued_at', r.issued_at,
    'paid_at', p.paid_at, 'provider', p.provider, 'provider_reference', p.provider_reference, 'reference', v_ref, 'service', v_svc, 'commune', v_m.name,
    'has_pdf', r.pdf_sha256 is not null, 'municipality_id', p.municipality_id, 'application_id', p.application_id);
end $$;
create or replace function public.finalize_receipt(p_receipt uuid, p_pdf_path text, p_sha256 text) returns void language plpgsql security definer set search_path = public as $$
begin
  if p_sha256 !~ '^[0-9a-f]{64}$' then raise exception 'invalid_input'; end if;
  update receipts set pdf_path = p_pdf_path, pdf_sha256 = p_sha256 where id = p_receipt and pdf_sha256 is null;
end $$;

-- Remboursements : demande, décision PAR UNE AUTRE PERSONNE, exécution tracée
create or replace function public.request_refund(p_payment uuid, p_amount_xof int, p_reason text) returns uuid
language plpgsql security definer set search_path = public as $$
declare p payments%rowtype; v_used int; v_id uuid;
begin
  select * into p from payments where id = p_payment for update;
  if not found or auth.uid() is null or not has_permission(p.municipality_id, 'payments.refund') then raise exception 'forbidden' using errcode = '42501'; end if;
  if p.status <> 'PAID' then raise exception 'transition_not_allowed'; end if;
  select coalesce(sum(amount_xof), 0) into v_used from refunds where payment_id = p.id and status in ('requested','approved','executed');
  if p_amount_xof is null or p_amount_xof <= 0 or v_used + p_amount_xof > p.amount_xof or length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'invalid_input'; end if;
  insert into refunds (municipality_id, payment_id, amount_xof, reason, requested_by) values (p.municipality_id, p.id, p_amount_xof, btrim(p_reason), auth.uid()) returning id into v_id;
  perform write_audit(p.municipality_id, 'refund_request', 'refund', v_id, jsonb_build_object('amount_xof', p_amount_xof));
  return v_id;
end $$;
create or replace function public.decide_refund(p_refund uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = public as $$
declare r refunds%rowtype;
begin
  select * into r from refunds where id = p_refund for update;
  if not found or auth.uid() is null or not has_permission(r.municipality_id, 'payments.refund') then raise exception 'forbidden' using errcode = '42501'; end if;
  if r.status <> 'requested' then raise exception 'transition_not_allowed'; end if;
  if r.requested_by = auth.uid() then raise exception 'self_approval'; end if;     -- jamais seul
  update refunds set status = case when p_approve then 'approved' else 'rejected' end, decided_by = auth.uid(), decided_at = now() where id = r.id;
  perform write_audit(r.municipality_id, 'refund_decision', 'refund', r.id, jsonb_build_object('approved', p_approve));
end $$;
create or replace function public.mark_refund_executed(p_refund uuid, p_provider_reference text) returns void
language plpgsql security definer set search_path = public as $$
declare r refunds%rowtype; p payments%rowtype; v_done int;
begin
  select * into r from refunds where id = p_refund for update;
  if not found or auth.uid() is null or not has_permission(r.municipality_id, 'payments.refund') then raise exception 'forbidden' using errcode = '42501'; end if;
  if r.status <> 'approved' then raise exception 'transition_not_allowed'; end if;
  if length(btrim(coalesce(p_provider_reference, ''))) < 3 then raise exception 'invalid_input'; end if;
  update refunds set status = 'executed', executed_by = auth.uid(), executed_at = now(), provider_reference = btrim(p_provider_reference) where id = r.id;
  select * into p from payments where id = r.payment_id for update;
  select coalesce(sum(amount_xof), 0) into v_done from refunds where payment_id = p.id and status = 'executed';
  if v_done >= p.amount_xof then update payments set status = 'REFUNDED' where id = p.id; end if;
  perform write_audit(r.municipality_id, 'refund_executed', 'refund', r.id, jsonb_build_object('amount_xof', r.amount_xof));
end $$;

-- Réconciliation : totaux et anomalies d'une commune
create or replace function public.reconciliation_report(p_municipality uuid, p_from date default null, p_to date default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_tot jsonb; v_an jsonb;
begin
  if auth.uid() is null or not has_permission(p_municipality, 'payments.read') then raise exception 'forbidden' using errcode = '42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('provider', provider, 'mode', mode, 'status', status, 'count', n, 'amount_xof', s)), '[]'::jsonb) into v_tot from (
    select provider, mode, status, count(*) n, coalesce(sum(amount_xof), 0) s from payments
    where municipality_id = p_municipality and (p_from is null or created_at >= p_from) and (p_to is null or created_at < p_to + 1) group by 1, 2, 3 order by 1, 2, 3) x;
  select jsonb_build_object(
    'pending_stale', (select coalesce(jsonb_agg(id), '[]'::jsonb) from payments where municipality_id = p_municipality and status in ('CREATED','PENDING') and created_at < now() - interval '30 minutes'),
    'needs_review', (select coalesce(jsonb_agg(id), '[]'::jsonb) from payments where municipality_id = p_municipality and needs_review),
    'paid_without_receipt', (select coalesce(jsonb_agg(p.id), '[]'::jsonb) from payments p where p.municipality_id = p_municipality and p.status in ('PAID','REFUNDED') and not exists (select 1 from receipts r where r.payment_id = p.id and r.pdf_sha256 is not null)),
    'refunds_awaiting', (select coalesce(jsonb_agg(id), '[]'::jsonb) from refunds where municipality_id = p_municipality and status in ('requested','approved'))) into v_an;
  return jsonb_build_object('totals', v_tot, 'anomalies', v_an);
end $$;

-- Tableau de bord : montant réel des paiements confirmés (net des remboursements exécutés)
create or replace function public.dashboard_stats(p_municipality uuid, p_from date default null, p_to date default null, p_service uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_status jsonb; v_service jsonb; v_pay int; v_ref int;
begin
  if auth.uid() is null or not (has_permission(p_municipality, 'applications.read') or has_permission(p_municipality, 'reports.read')) then raise exception 'forbidden' using errcode = '42501'; end if;
  select coalesce(jsonb_object_agg(status, n), '{}'::jsonb) into v_status from (
    select status, count(*) n from applications where municipality_id = p_municipality and status <> 'DRAFT'
      and (p_from is null or submitted_at >= p_from) and (p_to is null or submitted_at < p_to + 1) and (p_service is null or service_id = p_service) group by status) s;
  select coalesce(jsonb_agg(jsonb_build_object('code', code, 'name', name, 'count', n) order by n desc), '[]'::jsonb) into v_service from (
    select sv.code, sv.name, count(a.id) n from services sv left join applications a on a.service_id = sv.id and a.status <> 'DRAFT'
      and (p_from is null or a.submitted_at >= p_from) and (p_to is null or a.submitted_at < p_to + 1)
    where sv.municipality_id = p_municipality and (p_service is null or sv.id = p_service) group by sv.code, sv.name) x;
  if has_permission(p_municipality, 'payments.read') then
    select coalesce(sum(p.amount_xof), 0) into v_pay from payments p join applications a on a.id = p.application_id
      where p.municipality_id = p_municipality and p.mode = 'live' and p.status in ('PAID','REFUNDED') and (p_from is null or p.paid_at >= p_from) and (p_to is null or p.paid_at < p_to + 1) and (p_service is null or a.service_id = p_service);
    select coalesce(sum(r.amount_xof), 0) into v_ref from refunds r join payments p on p.id = r.payment_id join applications a on a.id = p.application_id
      where r.municipality_id = p_municipality and r.status = 'executed' and p.mode = 'live' and (p_from is null or r.executed_at >= p_from) and (p_to is null or r.executed_at < p_to + 1) and (p_service is null or a.service_id = p_service);
  end if;
  return jsonb_build_object('by_status', v_status, 'by_service', v_service, 'payments_total_xof', case when v_pay is null then null else v_pay - v_ref end);  -- paiements sandbox exclus : aucun faux revenu
end $$;

revoke all on function public.initiate_payment(uuid,text,text,text,text), public.mark_payment_pending(uuid,text), public.fail_payment_creation(uuid,text),
  public.apply_payment_result(uuid,text,text,text,int), public.record_webhook(text,text,jsonb,boolean), public.mark_webhook_processed(uuid,text),
  public.issue_receipt(uuid), public.finalize_receipt(uuid,text,text) from public, anon, authenticated;
grant execute on function public.initiate_payment(uuid,text,text,text,text), public.mark_payment_pending(uuid,text), public.fail_payment_creation(uuid,text),
  public.apply_payment_result(uuid,text,text,text,int), public.record_webhook(text,text,jsonb,boolean), public.mark_webhook_processed(uuid,text),
  public.issue_receipt(uuid), public.finalize_receipt(uuid,text,text) to service_role;
revoke all on function public.request_refund(uuid,int,text), public.decide_refund(uuid,boolean), public.mark_refund_executed(uuid,text), public.reconciliation_report(uuid,date,date) from public, anon;
grant execute on function public.request_refund(uuid,int,text), public.decide_refund(uuid,boolean), public.mark_refund_executed(uuid,text), public.reconciliation_report(uuid,date,date) to authenticated, service_role;

do $$ begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public) values ('receipts','receipts', false) on conflict (id) do update set public = false;
  end if;
end $$;
