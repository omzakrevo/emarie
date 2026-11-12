import { createServerSupabase } from "@/lib/supabase/server";
import { getT } from "@/i18n/server";
import { getAdminContext, requireCan } from "@/server/admin/context";
import { SettingsForm } from "./form";

export default async function Page() {
  const ctx = await getAdminContext(); requireCan(ctx, "municipality.settings.manage");
  const { t } = await getT();
  const sb = await createServerSupabase(); const m = ctx.municipality;
  const { data } = await sb.from("municipality_settings").select("key, value").eq("municipality_id", m.id);
  const get = (k: string) => (data?.find((r) => r.key === k)?.value ?? {}) as Record<string, string | boolean>;
  const c = m.contacts as { phone?: string; email?: string };
  return (<div className="flex flex-col gap-4"><h1 className="text-2xl font-bold text-brand-900">{t("adm.st.title")}</h1>
    <SettingsForm v={{ about_mairie: String(get("public.about_mairie").fr ?? ""), about_commune: String(get("public.about_commune").fr ?? ""), opening_hours: String(get("public.opening_hours").fr ?? ""),
      address: m.address ?? "", phone: c.phone ?? "", email: c.email ?? "", skip_payment: get("workflow.skip_payment").enabled === true }} /></div>);
}
