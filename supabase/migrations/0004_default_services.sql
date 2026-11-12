-- 0004 — Services initiaux (Certificat de résidence, Extrait d'acte de naissance).
-- Champs = structure des modèles administratifs. AUCUN tarif ni justificatif imposé : à configurer par la mairie.
create or replace function public.seed_default_services(p_municipality uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_res uuid; v_nai uuid;
begin
  insert into services (municipality_id, code, icon, name, description, procedure, sort_order) values
   (p_municipality,'certificat_residence','home',
    '{"fr":"Certificat de résidence"}', '{"fr":"Attestation de domicile délivrée par la mairie."}',
    '{"fr":"Procédure à confirmer par la mairie. Le document est retiré physiquement à la mairie."}', 1),
   (p_municipality,'extrait_naissance','baby',
    '{"fr":"Extrait d''acte de naissance"}',
    '{"fr":"Extrait de l''acte de naissance, établi à partir du registre d''état civil."}',
    '{"fr":"Votre demande est vérifiée dans le registre officiel par l''officier d''état civil avant toute délivrance. Le document est retiré physiquement à la mairie."}', 2)
  on conflict (municipality_id, code) do nothing;
  select id into v_res from services where municipality_id = p_municipality and code = 'certificat_residence';
  select id into v_nai from services where municipality_id = p_municipality and code = 'extrait_naissance';

  -- (service, key, label, type, required, step, sort, options, visible_if)
  insert into service_fields (municipality_id, service_id, key, label, type, required, step, sort_order, options, visible_if)
  select p_municipality, s, k, jsonb_build_object('fr', l), t, r, st, so, o::jsonb, v::jsonb from (values
    (v_res,'nom','Nom','text',true,2,1,null,null),
    (v_res,'prenoms','Prénom(s)','text',true,2,2,null,null),
    (v_res,'sexe','Sexe','radio',true,2,3,'[{"value":"M","label":{"fr":"Masculin"}},{"value":"F","label":{"fr":"Féminin"}}]',null),
    (v_res,'date_naissance','Date de naissance','date',true,2,4,null,null),
    (v_res,'lieu_naissance','Lieu de naissance','text',true,2,5,null,null),
    (v_res,'telephone','Téléphone','phone',true,2,6,null,null),
    (v_res,'type_piece','Pièce d''identité','select',false,3,1,'[{"value":"cnib","label":{"fr":"CNIB"}},{"value":"passeport","label":{"fr":"Passeport"}}]',null),
    (v_res,'numero_piece','Numéro de la pièce','text',false,3,2,null,'{"field":"type_piece","op":"in","value":["cnib","passeport"]}'),
    (v_res,'date_delivrance_piece','Date de délivrance de la pièce','date',false,3,3,null,'{"field":"type_piece","op":"in","value":["cnib","passeport"]}'),
    (v_res,'organisme_delivrance','Organisme ayant délivré la pièce','text',false,3,4,null,'{"field":"type_piece","op":"in","value":["cnib","passeport"]}'),
    (v_res,'nom_pere','Nom et prénoms du père','text',false,3,5,null,null),
    (v_res,'nom_mere','Nom et prénoms de la mère','text',false,3,6,null,null),
    (v_res,'profession','Profession','text',false,3,7,null,null),
    (v_res,'domicile','Domicile (quartier, village)','textarea',true,3,8,null,null),
    (v_nai,'nom','Nom','text',true,2,1,null,null),
    (v_nai,'prenoms','Prénom(s)','text',true,2,2,null,null),
    (v_nai,'sexe','Sexe','radio',true,2,3,'[{"value":"M","label":{"fr":"Masculin"}},{"value":"F","label":{"fr":"Féminin"}}]',null),
    (v_nai,'date_naissance','Date de naissance','date',true,2,4,null,null),
    (v_nai,'lieu_naissance','Lieu de naissance','text',true,2,5,null,null),
    (v_nai,'telephone','Téléphone','phone',true,2,6,null,null),
    (v_nai,'heure_naissance','Heure de naissance (si connue)','time',false,3,1,null,null),
    (v_nai,'nom_pere','Nom et prénoms du père','text',false,3,2,null,null),
    (v_nai,'nom_mere','Nom et prénoms de la mère','text',false,3,3,null,null),
    (v_nai,'numero_acte_connu','Numéro de l''acte (si vous le connaissez)','text',false,3,4,null,null),
    (v_nai,'qualite_demandeur','Vous faites la demande en tant que','select',true,3,5,
       '[{"value":"lui_meme","label":{"fr":"La personne concernée"}},{"value":"parent","label":{"fr":"Un parent"}},{"value":"mandataire","label":{"fr":"Un mandataire"}}]',null),
    (v_nai,'nom_demandeur','Nom et prénoms du demandeur','text',true,3,6,null,'{"field":"qualite_demandeur","op":"in","value":["parent","mandataire"]}')
  ) as x(s,k,l,t,r,st,so,o,v)
  on conflict (service_id, key) do nothing;
end $$;
revoke all on function public.seed_default_services(uuid) from public, anon, authenticated;

select public.seed_default_services(id) from public.municipalities where slug = 'niankorodougou';
