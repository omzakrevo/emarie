import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { getT } from "@/i18n/server";
import { pickLocalized } from "@/i18n/messages";
import { can, getAdminContext } from "@/server/admin/context";
import { redirect } from "next/navigation";

export default async function Page() {
  const ctx = await getAdminContext();
  if (!can(ctx, "services.manage") && !can(ctx, "pricing.manage")) redirect("/admin?error=forbidden");
  const { t, locale } = await getT();
  const sb = await createServerSupabase(); const today = new Date().toISOString().slice(0, 10);
  const [{ data: services }, { data: prices }] = await Promise.all([
    sb.from("services").select("id, code, name, is_active").eq("municipality_id", ctx.municipality.id).order("sort_order"),
    sb.from("service_pricing").select("service_id, amount_xof, valid_from, valid_to").eq("municipality_id", ctx.municipality.id),
  ]);
  const current = (id: string) => prices?.filter((p) => p.service_id === id && p.valid_from <= today && (!p.valid_to || p.valid_to >= today)).sort((a, b) => (a.valid_from < b.valid_from ? 1 : -1))[0];
  return (
    <div className="flex flex-col gap-4"><h1 className="text-2xl font-bold text-brand-900">{t("adm.sv.title")}</h1>
      <ul className="flex flex-col gap-2">{(services ?? []).map((s) => { const c = current(s.id); return (
        <li key={s.id}><Link href={`/admin/services/${s.code}`} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-surface p-4 hover:border-brand-600">
          <span className="font-semibold">{pickLocalized(s.name as Record<string, string>, locale)}</span>
          <span className="text-sm text-slate-600">{c ? `${c.amount_xof.toLocaleString("fr-FR")} FCFA` : t("service.priceTbc")}</span>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${s.is_active ? "bg-accent-50 text-accent-700" : "bg-slate-200 text-slate-700"}`}>{s.is_active ? t("adm.ag.active") : t("adm.ag.inactive")}</span></Link></li>); })}</ul></div>);
}
