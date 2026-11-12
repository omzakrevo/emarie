import { createServerSupabase } from "@/lib/supabase/server";
import { getT } from "@/i18n/server";
import { getAdminContext, requireCan } from "@/server/admin/context";
import { AddAgentForm, MemberRow } from "./forms";

export default async function Page() {
  const ctx = await getAdminContext(); requireCan(ctx, "agents.manage");
  const { t } = await getT();
  const sb = await createServerSupabase();
  const [{ data: roles }, { data: members }] = await Promise.all([
    sb.from("roles").select("id, label").eq("municipality_id", ctx.municipality.id).order("label"),
    sb.from("municipality_members").select("id, role_id, is_active, profiles(full_name, email)").eq("municipality_id", ctx.municipality.id).order("created_at"),
  ]);
  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-bold text-brand-900">{t("adm.ag.title")}</h1>
      <AddAgentForm roles={roles ?? []} />
      <ul className="flex flex-col gap-2">{(members ?? []).map((m) => {
        const p = m.profiles as unknown as { full_name: string | null; email: string | null } | null;
        return <MemberRow key={m.id} memberId={m.id} name={p?.full_name ?? ""} email={p?.email ?? ""} roleId={m.role_id} active={m.is_active} roles={roles ?? []} />;
      })}</ul>
    </div>
  );
}
