-- 0013 — Modèles reproduisant la STRUCTURE du modèle officiel fourni (mode.pdf) : en-tête à tirets, devise, mention à gauche,
-- lignes à points de conduite, date de naissance en toutes lettres, bandeau de titre, numéro de certificat configurable,
-- nom de l'officier imprimé sous la signature. Aucune donnée personnelle, signature ni cachet de l'exemple n'est reproduite.
-- Les modèles restent « provisoires » (filigrane SPÉCIMEN) tant que la mairie n'a pas validé la reproduction.

create or replace function public._default_template_content(p_code text) returns jsonb
language sql immutable set search_path = public as $$
  select case p_code
  when 'extrait_naissance' then $json$
  {"schema":1,
   "page":{"margins_mm":{"top":14,"right":18,"bottom":12,"left":18},"font":"serif","size_pt":12},
   "header":{"left":["REGION DES {{region}}","PROVINCE DE LA {{province}}","COMMUNE DE {{commune}}","MAIRIE"],"right":["BURKINA FASO","La Patrie ou la Mort, nous Vaincrons"],"show_logo":true,"dashed":true},
   "layout":{"mention_align":"left","reference_align":"center","title_style":"underline","body_italic":false,"row_style":"leader"},
   "mention":"ETAT-CIVIL",
   "title":"EXTRAIT\nD'ACTE DE NAISSANCE",
   "reference_line":"N° {{numero_acte}}/ du {{date_acte_num}}/",
   "blocks":[{"type":"rows","rows":[
     {"label":"Nom :","value":"{{nom}}"},
     {"label":"Prénom(s) :","value":"{{prenoms}}","label2":"Sexe :","value2":"{{sexe}}"},
     {"label":"Né(e) : le","value":"{{date_naissance_lettres}} ({{date_naissance_num}})","label2":"à","value2":"{{heure_naissance}}"},
     {"label":"A :","value":"{{lieu_naissance}}"},
     {"label":"{{filiation}} :","value":"{{nom_pere}}"},
     {"label":"Et de :","value":"{{nom_mere}}"}]}],
   "closing":{"text":"Certifie le présent extrait conforme aux indications portées sur le registre.","place_date":"Délivré à {{lieu_delivrance}}, le {{date_delivrance}}."},
   "signature":{"title_line":"L'Officier de L'Etat Civil","show_signature_box":true,"show_stamp_box":true,"show_tax_stamp_box":true,"tax_stamp_label":"Timbre communal","show_signer_name":true}}
  $json$::jsonb
  when 'certificat_residence' then $json$
  {"schema":1,
   "page":{"margins_mm":{"top":14,"right":16,"bottom":12,"left":16},"font":"sans","size_pt":11},
   "header":{"left":["REGION DES {{region}}","PROVINCE DE LA {{province}}","COMMUNE DE {{commune}}","MAIRIE"],"right":["BURKINA FASO","La Patrie Ou la Mort, Nous Vaincrons"],"show_logo":true,"dashed":true},
   "layout":{"mention_align":"left","reference_align":"left","title_style":"banner","body_italic":true,"row_style":"leader"},
   "mention":"SECRETARIAT GENERAL",
   "title":"Certificat de Résidence",
   "reference_line":"N°{{document_number}}",
   "blocks":[
     {"type":"paragraph","text":"Je soussigné, Officier d'Etat-Civil de la Commune de {{commune}}, certifie que :"},
     {"type":"rows","rows":[
       {"label":"{{civilite}} :","value":"{{nom}}","value2":"{{prenoms}}"},
       {"label":"Né(e) : le","value":"{{date_naissance_num}}","label2":"A","value2":"{{lieu_naissance}}"},
       {"label":"{{piece_label}} : N°","value":"{{numero_piece}}","label2":"du","value2":"{{date_delivrance_piece_num}}"},
       {"label":"Délivré (e) par","value":"{{organisme_delivrance}}"},
       {"label":"{{filiation}} :","value":"{{nom_pere}}","label2":"et de","value2":"{{nom_mere}}"},
       {"label":"Exerçant la profession :","value":"{{profession}}"},
       {"label":"Est domicilié à","value":"{{domicile}}"}]}],
   "closing":{"text":"En foi de quoi, le présent certificat lui est délivré pour servir et valoir ce que de droit.","place_date":"{{lieu_delivrance}}, le {{date_delivrance}}."},
   "signature":{"title_line":"L'officier d'Etat-Civil","show_signature_box":true,"show_stamp_box":true,"show_tax_stamp_box":true,"tax_stamp_label":"Timbre communal","show_signer_name":true}}
  $json$::jsonb
  end
$$;
revoke all on function public._default_template_content(text) from public, anon, authenticated;

create or replace function public.seed_default_templates(p_municipality uuid) returns void
language plpgsql security definer set search_path = public as $$
declare t record;
begin
  insert into document_templates (municipality_id, code, name) values
    (p_municipality, 'certificat_residence', 'Certificat de résidence'),
    (p_municipality, 'extrait_naissance', 'Extrait d''acte de naissance')
  on conflict (municipality_id, code) do nothing;
  for t in select id, code from document_templates where municipality_id = p_municipality loop
    insert into document_template_versions (municipality_id, template_id, version, status, content, is_provisional, published_at)
    select p_municipality, t.id, 1, 'published', _default_template_content(t.code), true, now()
    where not exists (select 1 from document_template_versions where template_id = t.id);
  end loop;
end $$;
revoke all on function public.seed_default_templates(uuid) from public, anon, authenticated;

-- Mise à niveau des communes existantes dont le modèle livré (v1) n'a jamais été validé ni modifié
do $$
declare t record;
begin
  for t in select dt.id, dt.code, dt.municipality_id from document_templates dt
           where exists (select 1 from document_template_versions v where v.template_id = dt.id and v.version = 1 and v.status = 'published' and v.is_provisional and v.validated_by is null)
             and not exists (select 1 from document_template_versions v where v.template_id = dt.id and v.version > 1) loop
    update document_template_versions set status = 'archived' where template_id = t.id and status = 'published';
    insert into document_template_versions (municipality_id, template_id, version, status, content, is_provisional, published_at)
    values (t.municipality_id, t.id, 2, 'published', _default_template_content(t.code), true, now());
  end loop;
end $$;

-- Extrait : date de l'acte relevée au registre (« N° 191/ du 20/10/1998 »)
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
      if k not in ('nom','prenoms','sexe','date_naissance','heure_naissance','lieu_naissance','nom_pere','nom_mere','date_acte')
         or jsonb_typeof(p_registry_data -> k) <> 'string' or length(p_registry_data ->> k) > 200 then raise exception 'invalid_input'; end if;
    end loop;
    if coalesce(btrim(p_registry_data ->> 'nom'),'') = '' or coalesce(btrim(p_registry_data ->> 'prenoms'),'') = ''
       or coalesce(p_registry_data ->> 'date_naissance','') !~ '^\d{4}-\d{2}-\d{2}$' or coalesce(btrim(p_registry_data ->> 'lieu_naissance'),'') = ''
       or (p_registry_data ? 'date_acte' and p_registry_data ->> 'date_acte' !~ '^\d{4}-\d{2}-\d{2}$') then raise exception 'invalid_input'; end if;
  end if;
  insert into civil_registry_checks (municipality_id, application_id, outcome, registry_ref, registry_data, note, checked_by)
  values (a.municipality_id, p_application, p_outcome, nullif(btrim(p_registry_ref),''), case when p_outcome = 'found' then p_registry_data end, nullif(btrim(p_note),''), auth.uid());
  perform write_audit(a.municipality_id, 'registry_check', 'application', p_application, jsonb_build_object('outcome', p_outcome));
end $$;

-- Numérotation : format configurable par commune et par type (setting « documents.number_format.<KIND> », ex. CR)
-- Jetons : {year} {seq} {seq3} {seq6} {prefix}. Doit contenir un jeton {seq*} (unicité). Sinon : format par défaut.
create or replace function public.next_document_number(p_municipality uuid, p_kind text) returns text
language plpgsql security definer set search_path = public as $$
declare v_year int := extract(year from now() at time zone 'Africa/Ouagadougou')::int; v_n bigint; v_prefix text; v_fmt text;
begin
  insert into numbering_counters as c (municipality_id, kind, year, last_value) values (p_municipality, 'doc_' || p_kind, v_year, 1)
  on conflict (municipality_id, kind, year) do update set last_value = c.last_value + 1 returning last_value into v_n;
  select reference_prefix into v_prefix from municipalities where id = p_municipality;
  select value ->> 'format' into v_fmt from municipality_settings where municipality_id = p_municipality and key = 'documents.number_format.' || p_kind;
  if v_fmt is not null and v_fmt ~ '^[A-Za-z0-9{}/_. -]{3,60}$' and v_fmt ~ '\{seq(3|6)?\}' then
    return replace(replace(replace(replace(replace(v_fmt, '{year}', v_year::text), '{prefix}', v_prefix), '{seq3}', lpad(v_n::text, 3, '0')), '{seq6}', lpad(v_n::text, 6, '0')), '{seq}', v_n::text);
  end if;
  return format('%s-%s-%s-%s', v_prefix, upper(p_kind), v_year, lpad(v_n::text, 6, '0'));
end $$;
revoke all on function public.next_document_number(uuid,text) from public, anon, authenticated;

-- prepare_document : ajoute le nom imprimé de l'officier (setting « documents.signer_name », jamais pré-rempli)
create or replace function public.prepare_document(p_application uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare a applications%rowtype; v_code text; v_tv document_template_versions%rowtype; v_m municipalities%rowtype;
        v_data jsonb; v_chk civil_registry_checks%rowtype; v_snap jsonb; v_num text; v_doc issued_documents%rowtype; v_signer text;
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

  select * into v_doc from issued_documents where application_id = a.id and status = 'pending';
  if found then
    return jsonb_build_object('document_id', v_doc.id, 'snapshot', v_doc.snapshot, 'content', (select content from document_template_versions where id = v_doc.template_version_id),
      'template_version', (select version from document_template_versions where id = v_doc.template_version_id), 'is_specimen', v_doc.is_specimen, 'template_code', v_code);
  end if;

  if v_code = 'extrait_naissance' then
    select * into v_chk from civil_registry_checks where application_id = a.id order by seq desc limit 1;
    if not found or v_chk.outcome <> 'found' then raise exception 'registry_check_required'; end if;
    v_data := v_chk.registry_data || jsonb_build_object('numero_acte', v_chk.registry_ref);
    v_num := v_chk.registry_ref;
  else
    select data into v_data from application_data where application_id = a.id;
    select document_number into v_num from issued_documents where application_id = a.id order by created_at desc limit 1;
    if v_num is null then v_num := next_document_number(a.municipality_id, 'CR'); end if;
  end if;
  select coalesce(value ->> 'name', '') into v_signer from municipality_settings where municipality_id = a.municipality_id and key = 'documents.signer_name';
  v_snap := coalesce(v_data, '{}'::jsonb) || jsonb_build_object('document_number', v_num, 'commune', v_m.name, 'province', v_m.province, 'region', v_m.region,
    'lieu_delivrance', v_m.name, 'date_delivrance', (now() at time zone 'Africa/Ouagadougou')::date::text, 'signer_name', coalesce(v_signer, ''));
  insert into issued_documents (municipality_id, application_id, template_version_id, document_number, snapshot, is_specimen, generated_by)
  values (a.municipality_id, a.id, v_tv.id, v_num, v_snap, v_tv.is_provisional, auth.uid()) returning * into v_doc;
  return jsonb_build_object('document_id', v_doc.id, 'snapshot', v_snap, 'content', v_tv.content, 'template_version', v_tv.version, 'is_specimen', v_tv.is_provisional, 'template_code', v_code);
end $$;
revoke all on function public.prepare_document(uuid) from public, anon;
grant execute on function public.prepare_document(uuid) to authenticated, service_role;

-- Format de numéro du certificat de Niankorodougou, relevé sur le modèle fourni (à confirmer par la mairie)
insert into public.municipality_settings (municipality_id, key, value)
select id, 'documents.number_format.CR', '{"format": "{year}-{seq3}/RTNY/PLRB/CNKDG/M/SG"}'::jsonb from public.municipalities where slug = 'niankorodougou'
on conflict (municipality_id, key) do nothing;
