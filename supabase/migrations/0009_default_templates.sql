-- 0009 — Modèles PROVISOIRES (structure déduite de la liste de champs du cahier des charges ; mode.pdf non reçu).
-- Les formulations juridiques ci-dessous sont des PLACEHOLDERS à remplacer par les formulations validées par la mairie.
-- Tant qu'une version n'est pas validée officiellement : filigrane SPÉCIMEN et mise à disposition au retrait bloquée.
create or replace function public.seed_default_templates(p_municipality uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_res uuid; v_nai uuid;
begin
  insert into document_templates (municipality_id, code, name) values
    (p_municipality, 'certificat_residence', 'Certificat de résidence'),
    (p_municipality, 'extrait_naissance', 'Extrait d''acte de naissance')
  on conflict (municipality_id, code) do nothing;
  select id into v_res from document_templates where municipality_id = p_municipality and code = 'certificat_residence';
  select id into v_nai from document_templates where municipality_id = p_municipality and code = 'extrait_naissance';

  insert into document_template_versions (municipality_id, template_id, version, status, content, is_provisional, published_at)
  select p_municipality, v_res, 1, 'published', $json$
  {"schema":1,
   "page":{"margins_mm":{"top":15,"right":18,"bottom":15,"left":18},"font":"serif","size_pt":11},
   "header":{"left":["Région des {{region}}","Province de la {{province}}","Commune de {{commune}}","MAIRIE"],"right":["RÉPUBLIQUE DU BURKINA FASO"],"show_logo":true},
   "mention":"SECRÉTARIAT GÉNÉRAL",
   "title":"CERTIFICAT DE RÉSIDENCE",
   "reference_line":"N° {{document_number}}",
   "blocks":[
     {"type":"paragraph","text":"[TEXTE PROVISOIRE] Il est certifié que la personne dont l'identité suit réside dans la commune de {{commune}}."},
     {"type":"rows","rows":[
       {"label":"Nom","value":"{{nom}}"},{"label":"Prénom(s)","value":"{{prenoms}}"},
       {"label":"Né(e) le","value":"{{date_naissance}}"},{"label":"Lieu de naissance","value":"{{lieu_naissance}}"},
       {"label":"Pièce d'identité","value":"{{type_piece}}"},{"label":"Numéro","value":"{{numero_piece}}"},
       {"label":"Délivrée le","value":"{{date_delivrance_piece}}"},{"label":"Délivrée par","value":"{{organisme_delivrance}}"},
       {"label":"Père","value":"{{nom_pere}}"},{"label":"Mère","value":"{{nom_mere}}"},
       {"label":"Profession","value":"{{profession}}"},{"label":"Domicile","value":"{{domicile}}"}]}],
   "closing":{"text":"[TEXTE PROVISOIRE] En foi de quoi, le présent certificat est délivré pour servir et valoir ce que de droit.","place_date":"Fait à {{lieu_delivrance}}, le {{date_delivrance}}"},
   "signature":{"title_line":"Le signataire habilité","show_signature_box":true,"show_stamp_box":true,"show_tax_stamp_box":true,"tax_stamp_label":"Timbre communal (si requis)"}}
  $json$::jsonb, true, now()
  where not exists (select 1 from document_template_versions where template_id = v_res);

  insert into document_template_versions (municipality_id, template_id, version, status, content, is_provisional, published_at)
  select p_municipality, v_nai, 1, 'published', $json$
  {"schema":1,
   "page":{"margins_mm":{"top":15,"right":18,"bottom":15,"left":18},"font":"serif","size_pt":11},
   "header":{"left":["Région des {{region}}","Province de la {{province}}","Commune de {{commune}}","MAIRIE"],"right":["RÉPUBLIQUE DU BURKINA FASO"],"show_logo":true},
   "mention":"ÉTAT-CIVIL",
   "title":"EXTRAIT D'ACTE DE NAISSANCE",
   "reference_line":"Acte n° {{numero_acte}}",
   "blocks":[
     {"type":"paragraph","text":"[TEXTE PROVISOIRE] Extrait du registre des actes de naissance de la commune de {{commune}}."},
     {"type":"rows","rows":[
       {"label":"Nom","value":"{{nom}}"},{"label":"Prénom(s)","value":"{{prenoms}}"},{"label":"Sexe","value":"{{sexe}}"},
       {"label":"Né(e) le","value":"{{date_naissance}}"},{"label":"Heure de naissance","value":"{{heure_naissance}}"},
       {"label":"Lieu de naissance","value":"{{lieu_naissance}}"},
       {"label":"Père","value":"{{nom_pere}}"},{"label":"Mère","value":"{{nom_mere}}"}]}],
   "closing":{"text":"[TEXTE PROVISOIRE] Pour extrait conforme au registre.","place_date":"Fait à {{lieu_delivrance}}, le {{date_delivrance}}"},
   "signature":{"title_line":"L'officier d'état civil","show_signature_box":true,"show_stamp_box":true,"show_tax_stamp_box":true,"tax_stamp_label":"Timbre communal (si requis)"}}
  $json$::jsonb, true, now()
  where not exists (select 1 from document_template_versions where template_id = v_nai);
end $$;
revoke all on function public.seed_default_templates(uuid) from public, anon, authenticated;
select public.seed_default_templates(id) from public.municipalities where slug = 'niankorodougou';
