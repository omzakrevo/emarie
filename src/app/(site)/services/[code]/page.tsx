import { notFound } from "next/navigation";
import { LinkButton } from "@/components/ui/button";
import { getT } from "@/i18n/server";
import { pickLocalized } from "@/i18n/messages";
import { getServiceByCode } from "@/server/applications/catalog";
import { getCurrentMunicipality } from "@/server/tenancy";

export default async function Page({ params }: PageProps<"/services/[code]">) {
  const { code } = await params;
  const { t, locale } = await getT();
  const s = await getServiceByCode((await getCurrentMunicipality()).id, code);
  if (!s) notFound();
  return (
    <article className="rounded-2xl bg-surface p-6 shadow-sm">
      <h1 className="text-2xl font-bold text-brand-900">{pickLocalized(s.name, locale)}</h1>
      <p className="mt-2">{pickLocalized(s.description, locale)}</p>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
        <div><dt className="font-semibold">{t("service.price")}</dt><dd>{s.amount_xof === null ? t("service.priceTbc") : `${s.amount_xof.toLocaleString("fr-FR")} FCFA`}</dd></div>
        <div><dt className="font-semibold">{t("service.delay")}</dt><dd>{s.indicative_delay_days === null ? t("service.delayTbc") : t("service.delayDays", { n: s.indicative_delay_days })}</dd></div>
        <div><dt className="font-semibold">{t("service.pickup")}</dt><dd>✓</dd></div>
      </dl>
      <h2 className="mt-6 font-semibold">{t("service.procedure")}</h2>
      <p className="whitespace-pre-line text-slate-700">{pickLocalized(s.procedure, locale) || t("common.notProvided")}</p>
      <h2 className="mt-6 font-semibold">{t("service.documents")}</h2>
      {s.documents.length === 0 ? <p className="text-slate-700">{t("service.noDocuments")}</p> :
        <ul className="list-disc pl-5">{s.documents.map((d) => <li key={d.key}>{pickLocalized(d.label, locale)}{d.required ? "" : ` (${t("common.optional")})`}</li>)}</ul>}
      <div className="mt-6"><LinkButton href={`/demande?service=${s.code}`} variant="accent">{t("service.start")}</LinkButton></div>
    </article>);
}
