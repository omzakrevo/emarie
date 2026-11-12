import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { getCurrentMunicipality } from "@/server/tenancy";

export interface AdminContext {
  userId: string; email: string | null; municipality: Awaited<ReturnType<typeof getCurrentMunicipality>>;
  permissions: Set<string>; roleLabel: string;
}

/** Contexte agent : utilisateur vérifié, commune courante, permissions lues en base (my_permissions). Redirige sinon. */
export const getAdminContext = cache(async (): Promise<AdminContext> => {
  const sb = await createServerSupabase();
  const { data: u } = await sb.auth.getUser();
  if (!u.user) redirect("/admin/connexion");
  const municipality = await getCurrentMunicipality();
  const [{ data: perms }, { data: member }] = await Promise.all([
    sb.rpc("my_permissions", { p_municipality: municipality.id }),
    sb.from("municipality_members").select("roles(label)").eq("municipality_id", municipality.id).eq("profile_id", u.user.id).eq("is_active", true).maybeSingle(),
  ]);
  if (!member) redirect("/admin/connexion?error=forbidden");
  return { userId: u.user.id, email: u.user.email ?? null, municipality, permissions: new Set((perms ?? []) as string[]),
    roleLabel: (member.roles as unknown as { label: string } | null)?.label ?? "" };
});
export const can = (ctx: AdminContext, code: string) => ctx.permissions.has(code);
export function requireCan(ctx: AdminContext, code: string) { if (!can(ctx, code)) redirect("/admin?error=forbidden"); }
