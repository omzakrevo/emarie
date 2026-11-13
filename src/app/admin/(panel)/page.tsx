import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { getT } from "@/i18n/server";
import { pickLocalized, type MessageKey } from "@/i18n/messages";
import { summarize, type GroupKey } from "@/features/admin/status";
import { can, getAdminContext } from "@/server/admin/context";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const CARDS: [GroupKey | "total", MessageKey][] = [
  ["total", "adm.stat.total"], ["pending", "adm.stat.pending"], ["toReview", "adm.stat.toReview"], ["infoRequired", "adm.stat.infoRequired"],
  ["validated", "adm.stat.validated"], ["rejected", "adm.stat.rejected"], ["toPrint", "adm.stat.toPrint"], ["toSign", "adm.stat.toSign"],
  ["signed", "adm.stat.signed"], ["ready", "adm.stat.ready"], ["withdrawn", "adm.stat.withdrawn"],
];

export default async function Dashboard({ searchParams }: PageProps<"/admin">) {
  const ctx = await getAdminContext();
  if (!can(ctx, "applications.read") && !can(ctx, "reports.read")) redirect("/admin/agents");
  const { t, locale } = await getT();
  const sp = await searchParams;
  const pick = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const from = DATE.test(pick("from")) ? pick("from") : null, to = DATE.test(pick("to")) ? pick("to") : null;
  const sb = await createServerSupabase();
  const { data: services } = await sb.from("services").select("id, code, name").eq("municipality_id", ctx.municipality.id).order("sort_order");
  const service = services?.find((s) => s.id === pick("service"))?.id ?? null;
  const { data: stats } = await sb.rpc("dashboard_stats", { p_municipality: ctx.municipality.id, p_from: from, p_to: to, p_service: service });
  const byStatus = (stats?.by_status ?? {}) as Record<string, number>;
  const sum = summarize(byStatus);
  const byService = (stats?.by_service ?? []) as { code: string; name: Record<string, string>; count: number }[];
  const max = Math.max(1, ...byService.map((s) => s.count));
  const input = "min-h-11 rounded-lg border border-slate-300 bg-surface px-3 text-sm";
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-brand-900">{t("adm.nav.dashboard")}</h1>
      <form className="flex flex-wrap items-end gap-3" method="get">
        <label className="flex flex-col gap-1 text-sm">{t("adm.filter.from")}<input type="date" name="from" defaultValue={from ?? ""} className={input} /></label>
        <label className="flex flex-col gap-1 text-sm">{t("adm.filter.to")}<input type="date" name="to" defaultValue={to ?? ""} className={input} /></label>
        <label className="flex flex-col gap-1 text-sm">{t("adm.filter.service")}
          <select name="service" defaultValue={service ?? ""} className={input}><option value="">{t("adm.filter.all")}</option>
            {services?.map((s) => <option key={s.id} value={s.id}>{pickLocalized(s.name as Record<string, string>, locale)}</option>)}</select></label>
        <button className="min-h-11 rounded-lg bg-brand-700 px-4 text-sm font-semibold text-white">{t("adm.filter.apply")}</button>
      </form>
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {CARDS.map(([k, label]) => (
          <div key={k} className="rounded-2xl bg-surface p-4 shadow-sm"><p className="text-sm text-slate-600">{t(label)}</p><p className="text-3xl font-bold text-brand-900" data-testid={`stat-${k}`}>{sum[k]}</p></div>))}
        <div className="rounded-2xl bg-surface p-4 shadow-sm"><p className="text-sm text-slate-600">{t("adm.stat.payments")}</p><p className="text-sm font-medium text-slate-600">{t("adm.stat.paymentsPending")}</p></div>
      </section>
      <section className="rounded-2xl bg-surface p-5 shadow-sm"><h2 className="mb-3 font-semibold">{t("adm.stat.byService")}</h2>
        <ul className="flex flex-col gap-3">{byService.map((s) => (
          <li key={s.code}><div className="flex justify-between text-sm"><span>{pickLocalized(s.name, locale)}</span><span className="font-semibold">{s.count}</span></div>
            <div className="mt-1 h-3 rounded-full bg-brand-100"><div className="h-3 rounded-full bg-accent-600" style={{ width: `${(s.count / max) * 100}%` }} /></div></li>))}</ul>
      </section>
    </div>
  );
}
