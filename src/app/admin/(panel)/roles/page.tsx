import { createServerSupabase } from "@/lib/supabase/server";
import { getT } from "@/i18n/server";
import { getAdminContext, requireCan } from "@/server/admin/context";
import { RoleMatrix } from "./matrix";

export default async function Page() {
  const ctx = await getAdminContext(); requireCan(ctx, "roles.manage");
  const { t } = await getT();
  const sb = await createServerSupabase(); const mid = ctx.municipality.id;
  const [{ data: roles }, { data: perms }, { data: rp }] = await Promise.all([
    sb.from("roles").select("id, code, label").eq("municipality_id", mid).order("label"),
    sb.from("permissions").select("code, description").order("code"),
    sb.from("role_permissions").select("role_id, permission_code").eq("municipality_id", mid),
  ]);
  return (<div className="flex flex-col gap-4"><h1 className="text-2xl font-bold text-brand-900">{t("adm.rl.title")}</h1>
    <RoleMatrix roles={roles ?? []} permissions={perms ?? []} granted={(rp ?? []).map((x) => `${x.role_id}|${x.permission_code}`)} mine={[...ctx.permissions]} /></div>);
}
