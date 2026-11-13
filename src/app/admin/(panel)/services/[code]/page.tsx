import { notFound, redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { getT } from "@/i18n/server";
import { pickLocalized } from "@/i18n/messages";
import { can, getAdminContext } from "@/server/admin/context";
import { DocumentRow, FieldRow, PriceForm, ServiceForm } from "./forms";

const card = "rounded-2xl bg-surface p-5 shadow-sm";
export default async function Page({ params }: PageProps<"/admin/services/[code]">) {
  const { code } = await params;
  const ctx = await getAdminContext();
  const canSvc = can(ctx, "services.manage"), canPrice = can(ctx, "pricing.manage");
  if (!canSvc && !canPrice) redirect("/admin?error=forbidden");
  const { t, locale } = await getT();
  const sb = await createServerSupabase();
  const { data: s } = await sb.from("services").select("id, code, name, description, procedure, indicative_delay_days, is_active").eq("municipality_id", ctx.municipality.id).eq("code", code).maybeSingle();
  if (!s) notFound();
  const [{ data: fields }, { data: docs }, { data: prices }] = await Promise.all([
    sb.from("service_fields").select("id, label, help, type, required, step, sort_order").eq("service_id", s.id).order("step").order("sort_order"),
    sb.from("service_documents").select("id, label, required, max_size_kb").eq("service_id", s.id).order("sort_order"),
    sb.from("service_pricing").select("id, amount_xof, valid_from, valid_to").eq("service_id", s.id).order("valid_from", { ascending: false }),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  const cur = prices?.find((p) => p.valid_from <= today && (!p.valid_to || p.valid_to >= today));
  const fr = (v: unknown) => ((v as Record<string, string> | null)?.fr ?? "");
  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-bold text-brand-900">{pickLocalized(s.name as Record<string, string>, locale)}</h1>
      <ServiceForm id={s.id} description={fr(s.description)} procedure={fr(s.procedure)} delay={s.indicative_delay_days} active={s.is_active} canEdit={canSvc} />
      <section className={card}><h2 className="mb-2 font-semibold">{t("adm.sv.pricing")}</h2>
        <p className="mb-1 text-sm" data-testid="current-price"><strong>{t("adm.sv.currentPrice")} :</strong> {cur ? `${cur.amount_xof.toLocaleString("fr-FR")} FCFA` : t("adm.sv.noPrice")}</p>
        {canPrice && (<><p className="mb-3 text-xs text-slate-600">{t("adm.sv.priceNote")}</p><PriceForm id={s.id} today={today} /></>)}
        {!!prices?.length && <><h3 className="mb-1 mt-4 text-sm font-semibold">{t("adm.sv.history")}</h3><ul className="text-sm text-slate-700">{prices.map((p) => <li key={p.id}>{p.amount_xof.toLocaleString("fr-FR")} FCFA — {p.valid_from}{p.valid_to ? ` ${t("adm.sv.until")} ${p.valid_to}` : ""}</li>)}</ul></>}
      </section>
      <section className={card}><h2 className="mb-1 font-semibold">{t("adm.sv.documents")}</h2><p className="mb-3 text-xs text-slate-600">{t("adm.sv.documentsNote")}</p>
        <div className="flex flex-col gap-2">{!docs?.length && <p className="text-sm text-slate-600">{t("adm.sv.noDocuments")}</p>}
          {docs?.map((d) => <DocumentRow key={d.id} serviceId={s.id} id={d.id} label={fr(d.label)} required={d.required} max={d.max_size_kb} canEdit={canSvc} />)}
          {canSvc && <DocumentRow serviceId={s.id} label="" required={true} max={5120} canEdit />}</div></section>
      <section className={card}><h2 className="mb-1 font-semibold">{t("adm.sv.fields")}</h2><p className="mb-3 text-xs text-slate-600">{t("adm.sv.fieldsNote")}</p>
        <div className="flex flex-col gap-2">{fields?.map((f) => <FieldRow key={f.id} id={f.id} label={fr(f.label)} help={fr(f.help)} required={f.required} step={f.step} type={f.type} canEdit={canSvc} />)}</div></section>
    </div>);
}
