-- 0007 — Administration des services : tarifs historisés, audit des changements de configuration, justificatifs protégés.

-- Tarifs : plus d'écriture directe ; changement par fonction (ferme le tarif en cours, conserve l'historique)
drop policy if exists pricing_staff_write on public.service_pricing;
create policy pricing_staff_read on public.service_pricing for select using (public.has_permission(municipality_id, 'pricing.manage'));

create or replace function public.set_service_price(p_service uuid, p_amount_xof int, p_valid_from date default current_date)
returns uuid language plpgsql security definer set search_path = public as $$
declare s services%rowtype; v_id uuid;
begin
  select * into s from services where id = p_service;
  if not found or auth.uid() is null or not has_permission(s.municipality_id, 'pricing.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_amount_xof is null or p_amount_xof < 0 or p_amount_xof > 10000000 or p_valid_from is null then raise exception 'invalid_input'; end if;
  -- ferme le tarif ouvert précédent (la veille de l'entrée en vigueur) ; refuse un effet rétroactif sur un tarif déjà clos
  if exists (select 1 from service_pricing where service_id = p_service and valid_from >= p_valid_from) then raise exception 'invalid_input'; end if;
  update service_pricing set valid_to = p_valid_from - 1 where service_id = p_service and valid_to is null;
  insert into service_pricing (municipality_id, service_id, amount_xof, valid_from) values (s.municipality_id, p_service, p_amount_xof, p_valid_from) returning id into v_id;
  perform write_audit(s.municipality_id, 'price_set', 'service', p_service, jsonb_build_object('amount_xof', p_amount_xof, 'valid_from', p_valid_from));
  return v_id;
end $$;
revoke all on function public.set_service_price(uuid,int,date) from public, anon;
grant execute on function public.set_service_price(uuid,int,date) to authenticated, service_role;

-- Audit automatique des changements de configuration (acteur = utilisateur connecté)
create or replace function public.audit_config_change() returns trigger language plpgsql security definer set search_path = public as $$
declare r record := coalesce(new, old);
begin
  insert into audit_logs (municipality_id, actor_id, action, entity, entity_id, metadata)
  values (r.municipality_id, auth.uid(), 'config_' || lower(tg_op), tg_table_name, r.id, jsonb_build_object('new', to_jsonb(new), 'old', to_jsonb(old)));
  return r;
end $$;
create trigger trg_audit_services after insert or update or delete on public.services for each row execute function public.audit_config_change();
create trigger trg_audit_fields after insert or update or delete on public.service_fields for each row execute function public.audit_config_change();
create trigger trg_audit_docs after insert or update or delete on public.service_documents for each row execute function public.audit_config_change();

-- Un justificatif déjà utilisé par des demandes ne peut pas être supprimé (désactivez-le en le rendant facultatif)
create or replace function public.protect_used_document() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from application_files f join applications a on a.id = f.application_id
             where a.service_id = old.service_id and f.document_key = old.key) then raise exception 'in_use'; end if;
  return old;
end $$;
create trigger trg_docs_protect before delete on public.service_documents for each row execute function public.protect_used_document();

-- Un champ ne se supprime pas (les libellés servent à relire les anciens dossiers) ; il se rend facultatif ou se masque
create or replace function public.forbid_field_delete() returns trigger language plpgsql as $$
begin
  if pg_trigger_depth() = 1 then raise exception 'in_use'; end if;   -- suppression en cascade (service supprimé) autorisée
  return old;
end $$;
create trigger trg_fields_nodelete before delete on public.service_fields for each row execute function public.forbid_field_delete();
