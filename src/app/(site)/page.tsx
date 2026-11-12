import { LinkButton } from "@/components/ui/button";
import { ServiceCard } from "@/components/site/service-card";
import { isSupabaseConfigured } from "@/lib/env";
import { getT } from "@/i18n/server";
import { listServices } from "@/server/applications/catalog";
import { getPublicText } from "@/server/public-content";
import { getCurrentMunicipality } from "@/server/tenancy";

export default async function Home() {
  if (!isSupabaseConfigured()) return null;
  const { t, locale } = await getT();
  const m = await getCurrentMunicipality();
  const [services, hours] = await Promise.all([listServices(m.id), getPublicText(m.id, "public.opening_hours", locale)]);
  const price = (a: number | null) => (a === null ? t("service.priceTbc") : `${a.toLocaleString("fr-FR")} FCFA`);
  const contacts = m.contacts as { phone?: string; email?: string };
  return (
    <div className="flex flex-col gap-8">
      <section className="rounded-3xl bg-gradient-to-br from-brand-900 to-brand-700 p-6 text-white sm:p-10">
        <p className="font-medium text-green-200">{t("app.slogan")}</p>
        <h1 className="mt-2 text-3xl font-bold leading-tight sm:text-4xl">{t("home.welcome", { name: m.name })}</h1>
        <p className="mt-3 max-w-2xl text-white/90">{t("home.intro")}</p>
        <p className="mt-2 text-sm text-white/80">{t("home.communeLine", { name: m.name, province: m.province, region: m.region })}</p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <LinkButton href="/demande" variant="accent">{t("home.cta.apply")}</LinkButton>
          <LinkButton href="/suivi" variant="secondary">{t("home.cta.track")}</LinkButton>
        </div>
      </section>
      <section aria-labelledby="svc"><h2 id="svc" className="mb-3 text-xl font-semibold text-brand-900">{t("home.services")}</h2>
        {services.length === 0 ? <p className="text-slate-600">{t("home.noServices")}</p> :
          <div className="grid gap-4 sm:grid-cols-2">{services.map((s) => <ServiceCard key={s.code} s={s} locale={locale} price={price(s.amount_xof)} />)}</div>}
      </section>
      <section aria-labelledby="info" className="rounded-2xl bg-surface p-5 shadow-sm"><h2 id="info" className="mb-3 text-xl font-semibold text-brand-900">{t("home.practical")}</h2>
        <dl className="grid gap-3 text-sm sm:grid-cols-3">
          <div><dt className="font-semibold">{t("page.hours")}</dt><dd className="whitespace-pre-line text-slate-700">{hours || t("common.notProvided")}</dd></div>
          <div><dt className="font-semibold">{t("page.address")}</dt><dd className="text-slate-700">{m.address || t("common.notProvided")}</dd></div>
          <div><dt className="font-semibold">{t("page.phone")}</dt><dd className="text-slate-700">{contacts.phone || t("common.notProvided")}</dd></div>
        </dl>
      </section>
    </div>
  );
}
