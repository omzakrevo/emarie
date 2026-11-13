import { createServerSupabase } from "@/lib/supabase/server";
import { getT } from "@/i18n/server";
import type { MessageKey } from "@/i18n/messages";
import { getAdminContext, requireCan } from "@/server/admin/context";
import { getSmsProvider, smsMode } from "@/server/sms/provider";
import { ProcessNow, RetryButton, TemplateForm } from "./forms";

const card = "rounded-2xl bg-surface p-5 shadow-sm";
const mask = (p: string) => (p.length > 6 ? `${p.slice(0, 4)}••••${p.slice(-2)}` : "••••");

export default async function Page() {
  const ctx = await getAdminContext(); requireCan(ctx, "sms.manage");
  const { t } = await getT();
  const sb = await createServerSupabase(); const mid = ctx.municipality.id;
  const [{ data: tpls }, { data: hist }] = await Promise.all([
    sb.from("notification_templates").select("id, event, locale, body, is_active").eq("municipality_id", mid).eq("locale", "fr").order("event"),
    sb.from("notifications").select("id, event, to_phone, status, attempts, last_error, created_at").eq("municipality_id", mid).order("created_at", { ascending: false }).limit(100),
  ]);
  const mode = smsMode(); const provider = getSmsProvider();
  return (
    <div className="flex flex-col gap-5"><h1 className="text-2xl font-bold text-brand-900">{t("adm.sms.title")}</h1>
      <p role="alert" data-testid="sms-mode" className="rounded-xl bg-red-50 p-3 text-sm font-bold text-red-800">{mode === "test" ? t("adm.sms.modeTest") : !provider ? t("adm.sms.modeLiveNone") : "LIVE"}</p>
      <ProcessNow />
      <section className={card}><h2 className="mb-1 font-semibold">{t("adm.sms.templates")}</h2><p className="mb-1 text-xs text-slate-600">{t("adm.sms.templatesHint")}</p><p className="mb-3 text-xs text-slate-600">{t("adm.sms.dyuHint")}</p>
        <div className="flex flex-col gap-2">{(tpls ?? []).map((x) => <TemplateForm key={x.id} id={x.id} label={t(`adm.sms.e.${x.event}` as MessageKey)} body={x.body} active={x.is_active} />)}</div></section>
      <section className={card}><h2 className="mb-2 font-semibold">{t("adm.sms.history")}</h2>
        {!hist?.length ? <p className="text-sm text-slate-600">{t("adm.sms.none")}</p> : (
          <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b border-slate-200"><th className="p-2">{t("adm.sms.col.date")}</th><th className="p-2">{t("adm.sms.col.event")}</th><th className="p-2">{t("adm.sms.col.to")}</th><th className="p-2">{t("adm.sms.col.status")}</th><th className="p-2">{t("adm.sms.col.tries")}</th><th className="p-2" /></tr></thead>
            <tbody>{hist.map((n) => (<tr key={n.id} className="border-b border-slate-100"><td className="p-2">{new Date(n.created_at).toLocaleString("fr-FR")}</td><td className="p-2">{t(`adm.sms.e.${n.event}` as MessageKey)}</td><td className="p-2 font-mono">{mask(n.to_phone)}</td>
              <td className="p-2">{t(`adm.sms.s.${n.status}` as MessageKey)}{n.last_error ? ` — ${n.last_error}` : ""}</td><td className="p-2">{n.attempts}</td><td className="p-2">{n.status === "dead" && <RetryButton id={n.id} />}</td></tr>))}</tbody></table></div>)}</section>
    </div>);
}
