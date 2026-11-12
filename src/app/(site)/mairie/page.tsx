import { TextPage } from "@/components/site/text-page";
import { getT } from "@/i18n/server";
import { getPublicText } from "@/server/public-content";
import { getCurrentMunicipality } from "@/server/tenancy";

export default async function Page() {
  const { t, locale } = await getT();
  const m = await getCurrentMunicipality();
  const text = await getPublicText(m.id, "public.about_mairie", locale);
  return <TextPage title={t("page.mairie")}>{text || t("common.notProvided")}</TextPage>;
}
