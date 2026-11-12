import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { getT } from "@/i18n/server";
import { pickLocalized } from "@/i18n/messages";
import { STATUS_GROUPS } from "@/features/admin/status";
import { getAdminContext, requireCan } from "@/server/admin/context";

const PAGE = 20;
const ALL_STATUSES = Object.values(STATUS_GROUPS).flat() as string[];

export default async function Page({ searchParams }: PageProps<"/admin/demandes">) {
  const ctx = await getAdminContext(); requireCan(ctx, "applications.read");
  const { t, locale } = await getT();
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const page = Math.max(1, parseInt(str("page")) || 1);
  const q = str("q").toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 20);
  const status = ALL_STATUSES.includes(str("status")) ? str("status") : "";
  const sb = await createServerSupabase();
  const { data: services } = await sb.from("services").select("id, name").eq("municipality_id", ctx.municipality.id).order("sort_order");
  const service = services?.find((s) => s.id === str("service"))?.id ?? "";
  let query = sb.from("applications").select("id, reference, status, submitted_at, services(name), application_data(data)", { count: "exact" })
    .eq("municipality_id", ctx.municipality.id).neq("status", "DRAFT").order("submitted_at", { ascending: false }).range((page - 1) * PAGE, page * PAGE - 1);
  if (status) query = query.eq("status", status);
  if (service) query = query.eq("service_id", service);
  if (q) query = query.ilike("reference", `%${q}%`);
  const { data, count } = await query;
  const rows = (data ?? []) as unknown as { id: string; reference: string; status: string; submitted_at: string; services: { name: Record<string, string> } | null; application_data: { data: Record<string, string> } | { data: Record<string, string> }[] | null }[];
  const nameOf = (r: (typeof rows)[number]) => { const d = Array.isArray(r.application_data) ? r.application_data[0]?.data : r.application_data?.data; return [d?.nom, d?.prenoms].filter(Boolean).join(" ") || "—"; };
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE));
  const qs = (p: number) => { const u = new URLSearchParams({ ...(status && { status }), ...(service && { service }), ...(q && { q }), page: String(p) }); return `?${u}`; };
  const input = "min-h-11 rounded-lg border border-slate-300 bg-surface px-3 text-sm";
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold text-brand-900">{t("adm.req.title")}</h1>
      <form className="flex flex-wrap items-end gap-3" method="get">
        <label className="flex flex-col gap-1 text-sm">{t("adm.filter.search")}<input name="q" defaultValue={q} placeholder="NIA-2026-0000" className={input} /></label>
        <label className="flex flex-col gap-1 text-sm">{t("adm.filter.status")}<select name="status" defaultValue={status} className={input}><option value="">{t("adm.filter.all")}</option>
          {ALL_STATUSES.map((s) => <option key={s} value={s}>{t(`status.${s}` as never)}</option>)}</select></label>
        <label className="flex flex-col gap-1 text-sm">{t("adm.filter.service")}<select name="service" defaultValue={service} className={input}><option value="">{t("adm.filter.all")}</option>
          {services?.map((s) => <option key={s.id} value={s.id}>{pickLocalized(s.name as Record<string, string>, locale)}</option>)}</select></label>
        <button className="min-h-11 rounded-lg bg-brand-700 px-4 text-sm font-semibold text-white">{t("adm.filter.apply")}</button>
        <Link href="/admin/demandes" className="min-h-11 px-2 py-3 text-sm text-brand-700 underline">{t("adm.filter.reset")}</Link>
      </form>
      {rows.length === 0 ? <p className="text-slate-600">{t("adm.req.none")}</p> : (
        <ul className="flex flex-col gap-2">{rows.map((r) => (
          <li key={r.id}><Link href={`/admin/demandes/${r.id}`} className="grid grid-cols-1 gap-1 rounded-xl border border-slate-200 bg-surface p-3 text-sm hover:border-brand-600 sm:grid-cols-[10rem_1fr_1fr_12rem_8rem] sm:items-center">
            <span className="font-mono font-semibold">{r.reference}</span><span>{nameOf(r)}</span><span className="text-slate-600">{pickLocalized(r.services?.name, locale)}</span>
            <span className="w-fit rounded-full bg-brand-50 px-3 py-1 font-medium text-brand-900">{t(`status.${r.status}` as never)}</span>
            <time className="text-slate-500" dateTime={r.submitted_at}>{new Date(r.submitted_at).toLocaleDateString("fr-FR")}</time></Link></li>))}</ul>)}
      <nav className="flex items-center justify-between text-sm" aria-label="Pagination">
        {page > 1 ? <Link className="font-semibold text-brand-700 underline" href={qs(page - 1)}>{t("adm.req.prev")}</Link> : <span />}
        <span>{t("adm.req.page", { n: `${page}/${pages}` })}</span>
        {page < pages ? <Link className="font-semibold text-brand-700 underline" href={qs(page + 1)}>{t("adm.req.next")}</Link> : <span />}
      </nav>
    </div>
  );
}
