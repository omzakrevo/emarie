import { ServiceCard } from "@/components/site/service-card";
import { getT } from "@/i18n/server";
import { listServices } from "@/server/applications/catalog";
import { getCurrentMunicipality } from "@/server/tenancy";

export default async function Page() {
  const { t, locale } = await getT();
  const services = await listServices((await getCurrentMunicipality()).id);
  return (<div><h1 className="mb-4 text-2xl font-bold text-brand-900">{t("nav.services")}</h1>
    {services.length === 0 ? <p>{t("home.noServices")}</p> : <div className="grid gap-4 sm:grid-cols-2">
      {services.map((s) => <ServiceCard key={s.code} s={s} locale={locale} price={s.amount_xof === null ? t("service.priceTbc") : `${s.amount_xof.toLocaleString("fr-FR")} FCFA`} />)}</div>}</div>);
}
