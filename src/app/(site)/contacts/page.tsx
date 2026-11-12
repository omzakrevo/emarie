import { TextPage } from "@/components/site/text-page";
import { getT } from "@/i18n/server";
import { getCurrentMunicipality } from "@/server/tenancy";

export default async function Page() {
  const { t } = await getT();
  const m = await getCurrentMunicipality();
  const c = m.contacts as { phone?: string; email?: string };
  const na = t("common.notProvided");
  return <TextPage title={t("page.contacts")}>
    <p>{m.name} — {m.province}, {m.region}</p>
    <dl className="mt-4 space-y-2"><div><dt className="font-semibold">{t("page.address")}</dt><dd>{m.address || na}</dd></div>
      <div><dt className="font-semibold">{t("page.phone")}</dt><dd>{c.phone || na}</dd></div>
      <div><dt className="font-semibold">{t("page.email")}</dt><dd>{c.email || na}</dd></div></dl>
  </TextPage>;
}
