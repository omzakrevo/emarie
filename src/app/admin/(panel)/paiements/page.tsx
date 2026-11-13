import { createServerSupabase } from "@/lib/supabase/server";
import { getT } from "@/i18n/server";
import { can, getAdminContext, requireCan } from "@/server/admin/context";
import { describeOption } from "@/server/payments/providers";
import type { ProviderId } from "@/features/payments/types";
import type { MessageKey } from "@/i18n/messages";
import { ProviderRow, RefundActions, RefundRequestForm } from "./forms";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const card = "rounded-2xl bg-surface p-5 shadow-sm";
const fcfa = (n: number) => `${n.toLocaleString("fr-FR")} FCFA`;

export default async function Page({ searchParams }: PageProps<"/admin/paiements">) {
  const ctx = await getAdminContext(); requireCan(ctx, "payments.read");
  const { t } = await getT(); const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const from = DATE.test(str("from")) ? str("from") : null, to = DATE.test(str("to")) ? str("to") : null;
  const sb = await createServerSupabase(); const mid = ctx.municipality.id;
  let q = sb.from("payments").select("id, amount_xof, provider, mode, status, needs_review, created_at, applications(reference), receipts(id, pdf_sha256)").eq("municipality_id", mid).order("created_at", { ascending: false }).limit(100);
  if (from) q = q.gte("created_at", from); if (to) q = q.lt("created_at", `${to}T23:59:59Z`);
  const [{ data: pays }, { data: recon }, { data: refunds }, { data: cfg }] = await Promise.all([
    q, sb.rpc("reconciliation_report", { p_municipality: mid, p_from: from, p_to: to }),
    sb.from("refunds").select("id, payment_id, amount_xof, reason, status, requested_by, provider_reference, created_at").eq("municipality_id", mid).order("created_at", { ascending: false }).limit(50),
    sb.from("payment_provider_configs").select("provider, enabled").eq("municipality_id", mid),
  ]);
  type Pay = { id: string; amount_xof: number; provider: string; mode: string; status: string; needs_review: boolean; created_at: string; applications: { reference: string } | null; receipts: { id: string; pdf_sha256: string | null } | { id: string; pdf_sha256: string | null }[] | null };
  const rows = (pays ?? []) as unknown as Pay[];
  const rc = (r: Pay) => (Array.isArray(r.receipts) ? r.receipts[0] : r.receipts);
  const anomalies = (recon?.anomalies ?? {}) as Record<string, string[]>;
  const totals = (recon?.totals ?? []) as { provider: string; mode: string; status: string; count: number; amount_xof: number }[];
  const enabled = (p: string) => cfg?.some((c) => c.provider === p && c.enabled) ?? false;
  const input = "min-h-11 rounded-lg border border-slate-300 bg-surface px-3 text-sm";
  return (
    <div className="flex flex-col gap-5"><h1 className="text-2xl font-bold text-brand-900">{t("adm.pay.title")}</h1>
      <p role="note" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{t("adm.pay.sandboxNote")}</p>
      <form method="get" className="flex flex-wrap items-end gap-3"><label className="flex flex-col gap-1 text-sm">{t("adm.filter.from")}<input type="date" name="from" defaultValue={from ?? ""} className={input} /></label>
        <label className="flex flex-col gap-1 text-sm">{t("adm.filter.to")}<input type="date" name="to" defaultValue={to ?? ""} className={input} /></label>
        <button className="min-h-11 rounded-lg bg-brand-700 px-4 text-sm font-semibold text-white">{t("adm.filter.apply")}</button></form>

      <section className={card}><h2 className="mb-3 font-semibold">{t("adm.pay.recon")}</h2>
        <h3 className="mb-1 text-sm font-semibold">{t("adm.pay.reconTotals")}</h3>
        {!totals.length ? <p className="text-sm text-slate-600">{t("adm.pay.none")}</p> : <ul className="mb-3 text-sm">{totals.map((x, i) => <li key={i}>{x.provider}{x.mode === "sandbox" ? ` (${t("adm.pay.sandbox")})` : ""} · {t(`adm.pay.ps.${x.status}` as MessageKey)} : {x.count} · {fcfa(x.amount_xof)}</li>)}</ul>}
        <h3 className="mb-1 text-sm font-semibold">{t("adm.pay.reconAnomalies")}</h3>
        <ul className="text-sm">{(["pending_stale", "needs_review", "paid_without_receipt", "refunds_awaiting"] as const).map((k) => (
          <li key={k} className={anomalies[k]?.length ? "font-semibold text-red-700" : "text-slate-600"} data-testid={`anomaly-${k}`}>{t(`adm.pay.a.${k}` as MessageKey)} : {anomalies[k]?.length ?? 0}</li>))}</ul></section>

      <section className={card}>
        {!rows.length ? <p className="text-sm text-slate-600">{t("adm.pay.none")}</p> : (
          <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b border-slate-200"><th className="p-2">{t("adm.pay.col.date")}</th><th className="p-2">{t("adm.pay.col.ref")}</th><th className="p-2">{t("adm.pay.col.amount")}</th><th className="p-2">{t("adm.pay.col.provider")}</th><th className="p-2">{t("adm.pay.col.status")}</th><th className="p-2">{t("adm.pay.receipt")}</th></tr></thead>
            <tbody>{rows.map((r) => (<tr key={r.id} className="border-b border-slate-100">
              <td className="p-2">{new Date(r.created_at).toLocaleString("fr-FR")}</td><td className="p-2 font-mono">{r.applications?.reference}</td><td className="p-2">{fcfa(r.amount_xof)}</td>
              <td className="p-2">{r.provider}{r.mode === "sandbox" && <span className="ml-1 rounded bg-red-100 px-1 text-xs font-bold text-red-800">{t("adm.pay.sandbox")}</span>}</td>
              <td className="p-2">{t(`adm.pay.ps.${r.status}` as MessageKey)}{r.needs_review && <span className="ml-1 rounded bg-amber-100 px-1 text-xs font-bold text-amber-900">{t("adm.pay.review")}</span>}</td>
              <td className="p-2">{rc(r)?.pdf_sha256 ? <a className="font-semibold text-brand-700 underline" href={`/api/admin/receipts/${rc(r)!.id}`} target="_blank" rel="noreferrer">PDF</a> : "—"}</td></tr>))}</tbody></table></div>)}</section>

      <section className={card}><h2 className="mb-1 font-semibold">{t("adm.pay.refunds")}</h2><p className="mb-3 text-xs text-slate-600">{t("adm.pay.refundHint")}</p>
        {can(ctx, "payments.refund") && <RefundRequestForm payments={rows.filter((r) => r.status === "PAID" && r.mode === "live").map((r) => ({ id: r.id, label: `${r.applications?.reference} — ${fcfa(r.amount_xof)}` }))} />}
        {!refunds?.length ? <p className="mt-3 text-sm text-slate-600">{t("adm.pay.refundNone")}</p> : <ul className="mt-3 flex flex-col gap-2 text-sm">{refunds.map((r) => (
          <li key={r.id} className="rounded-xl border border-slate-200 p-3"><span className="font-semibold">{fcfa(r.amount_xof)}</span> — {r.reason} · <span className="font-medium">{t(`adm.pay.rs.${r.status}` as MessageKey)}</span>{r.provider_reference ? ` (${r.provider_reference})` : ""}
            {can(ctx, "payments.refund") && <RefundActions id={r.id} status={r.status} mine={r.requested_by === ctx.userId} />}</li>))}</ul>}</section>

      <section className={card}><h2 className="mb-2 font-semibold">{t("adm.pay.providers")}</h2><div className="flex flex-col gap-2">
        {(["sandbox", "orange_money", "moov_money"] as ProviderId[]).map((p) => { const o = describeOption(p); return <ProviderRow key={p} provider={p} label={o.label} enabled={enabled(p)} available={o.available} reason={o.reason} canEdit={can(ctx, "municipality.settings.manage")} />; })}</div></section>
    </div>);
}
