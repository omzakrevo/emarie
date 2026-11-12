import "server-only";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { getCurrentMunicipality } from "@/server/tenancy";

export type PermissionCode = string;

/** Utilisateur authentifié (vérifié auprès de Supabase Auth, pas seulement lu dans le cookie). */
export async function requireUser() {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) redirect("/admin/connexion");
  return data.user;
}

/**
 * Exige une permission dans la commune courante. La décision vient de la base
 * (public.has_permission), la même fonction que celle utilisée par les politiques RLS.
 */
export async function requirePermission(code: PermissionCode) {
  const user = await requireUser();
  const municipality = await getCurrentMunicipality();
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("has_permission", { p_municipality: municipality.id, p_code: code });
  if (error || data !== true) redirect("/admin/connexion?error=forbidden");
  return { user, municipality };
}

/** Membre actif (n'importe quel rôle) de la commune courante. */
export async function requireMember() {
  const user = await requireUser();
  const municipality = await getCurrentMunicipality();
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("municipality_members")
    .select("id, roles(code,label)")
    .eq("municipality_id", municipality.id)
    .eq("profile_id", user.id)
    .eq("is_active", true)
    .maybeSingle();
  if (!data) redirect("/admin/connexion?error=forbidden");
  return { user, municipality, member: data };
}
