-- 0005 — Paramètres publics : seules les clés préfixées "public." sont lisibles sans authentification
-- (présentation de la mairie/commune, horaires). Tout le reste reste réservé aux membres.
create policy settings_public_read on public.municipality_settings
  for select using (key like 'public.%' and exists (select 1 from municipalities m where m.id = municipality_id and m.is_active));
