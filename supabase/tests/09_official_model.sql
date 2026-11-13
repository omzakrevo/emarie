\set ON_ERROR_STOP on
begin;
-- Mise à niveau : le modèle livré de Niankorodougou (v1 jamais validé) est passé en v2, v1 archivée ; réglages du modèle officiel
do $$ declare m uuid := (select id from municipalities where slug='niankorodougou'); n int; begin
  select count(*) into n from document_template_versions v join document_templates t on t.id=v.template_id where t.municipality_id=m and v.status='published' and v.version=2 and v.is_provisional;
  assert n=2, 'v2 publiée (provisoire) pour les 2 modèles : '||n;
  select count(*) into n from document_template_versions v join document_templates t on t.id=v.template_id where t.municipality_id=m and v.status='archived' and v.version=1;
  assert n=2, 'v1 archivée';
  assert (select value->>'format' from municipality_settings where municipality_id=m and key='documents.number_format.CR') = '{year}-{seq3}/RTNY/PLRB/CNKDG/M/SG';
  assert (select content->>'title' from document_template_versions v join document_templates t on t.id=v.template_id where t.municipality_id=m and t.code='extrait_naissance' and v.status='published') like E'EXTRAIT\nD''ACTE DE NAISSANCE';
  assert (select content #>> '{header,right,1}' from document_template_versions v join document_templates t on t.id=v.template_id where t.municipality_id=m and t.code='extrait_naissance' and v.status='published') = 'La Patrie ou la Mort, nous Vaincrons';
end $$;

-- Format de numéro configurable : valide ou repli sur le format par défaut
insert into municipalities (slug,name,region,province,reference_prefix) values ('fmt','Commune F','R','P','FMT');
do $$ declare m uuid := (select id from municipalities where slug='fmt'); a text; b text; c text; d text; begin
  a := next_document_number(m,'CR');                                   -- sans réglage : défaut
  assert a ~ '^FMT-CR-[0-9]{4}-000001$', a;
  insert into municipality_settings values (m,'documents.number_format.CR','{"format":"{year}-{seq3}/AB/CD"}');
  b := next_document_number(m,'CR'); assert b ~ '^[0-9]{4}-002/AB/CD$', b;
  update municipality_settings set value='{"format":"sans-compteur"}' where municipality_id=m and key='documents.number_format.CR';
  c := next_document_number(m,'CR'); assert c ~ '^FMT-CR-[0-9]{4}-000003$', 'format sans jeton {seq} refusé : '||c;
  update municipality_settings set value='{"format":"<script>{seq}"}' where municipality_id=m and key='documents.number_format.CR';
  d := next_document_number(m,'CR'); assert d ~ '^FMT-CR-[0-9]{4}-000004$', 'caractères interdits refusés : '||d;
  update municipality_settings set value='{"format":"{prefix}/{year}/{seq}"}' where municipality_id=m and key='documents.number_format.CR';
  assert next_document_number(m,'CR') ~ '^FMT/[0-9]{4}/5$';
  assert next_document_number(m,'RC') ~ '^FMT-RC-[0-9]{4}-000001$', 'les autres types (quittances) ne sont pas affectés';
end $$;
rollback;
\echo OFFICIAL_MODEL_TESTS_OK
