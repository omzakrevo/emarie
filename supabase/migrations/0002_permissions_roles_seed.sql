-- 0002 — Catalogue de permissions, rôles par défaut par commune, profil auto, commune pilote.
-- Les rôles par défaut sont une PROPOSITION à faire valider par la mairie (modifiable ensuite en admin).

insert into public.permissions (code, description) values
  ('citizens.read','Consulter les citoyens'),
  ('applications.read','Consulter les demandes'),
  ('applications.review','Instruire une demande, demander un complément'),
  ('applications.reject','Rejeter une demande'),
  ('applications.validate','Valider une demande'),
  ('civil_registry.verify','Vérifier au registre d''état civil (officier habilité)'),
  ('documents.generate','Générer un document'),
  ('documents.print','Enregistrer l''impression'),
  ('documents.sign_confirm','Confirmer la signature physique'),
  ('documents.release','Marquer le document prêt au retrait'),
  ('documents.withdraw','Enregistrer le retrait'),
  ('templates.manage','Modifier les modèles administratifs'),
  ('templates.publish','Publier une version de modèle'),
  ('services.manage','Gérer les services'),
  ('pricing.manage','Gérer les tarifs'),
  ('payments.read','Consulter les paiements et quittances'),
  ('payments.refund','Autoriser un remboursement'),
  ('sms.manage','Gérer les modèles et envois SMS'),
  ('reports.read','Statistiques et rapports'),
  ('audit.read','Consulter le journal d''audit')
on conflict (code) do nothing;

-- Rôles par défaut d'une commune (idempotent). Réutilisable pour toute nouvelle commune.
create or replace function public.seed_default_roles(p_municipality uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  r record;
begin
  for r in select * from (values
    ('admin_commune','Administrateur de la mairie', (select array_agg(code) from permissions)),
    ('secretaire_general','Secrétaire général', array['applications.read','applications.review','applications.validate','applications.reject',
       'documents.generate','documents.print','documents.sign_confirm','documents.release','templates.manage','templates.publish',
       'reports.read','payments.read','citizens.read','audit.read']),
    ('officier_etat_civil','Officier d''état civil', array['applications.read','applications.review','applications.validate','applications.reject',
       'civil_registry.verify','documents.generate','documents.print','documents.sign_confirm','documents.release','documents.withdraw','citizens.read']),
    ('agent_accueil','Agent d''accueil', array['applications.read','applications.review','documents.withdraw','citizens.read']),
    ('caissier','Caissier', array['applications.read','payments.read','reports.read'])
  ) as t(code,label,perms)
  loop
    insert into roles (municipality_id, code, label) values (p_municipality, r.code, r.label)
      on conflict (municipality_id, code) do nothing;
    insert into role_permissions (role_id, municipality_id, permission_code)
      select ro.id, p_municipality, unnest(r.perms) from roles ro
      where ro.municipality_id = p_municipality and ro.code = r.code
      on conflict do nothing;
  end loop;
end $$;
revoke all on function public.seed_default_roles(uuid) from public, anon, authenticated;

-- Création automatique du profil à l'inscription Supabase Auth
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, phone, full_name)
  values (new.id, new.phone, nullif(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Commune pilote. Adresse, contacts, logo : volontairement vides (à saisir/confirmer par la mairie).
insert into public.municipalities (slug, subdomain, name, region, province, reference_prefix)
values ('niankorodougou','niankorodougou','Niankorodougou','Tannounyan','Léraba','NIA')
on conflict (slug) do nothing;
select public.seed_default_roles(id) from public.municipalities where slug = 'niankorodougou';
