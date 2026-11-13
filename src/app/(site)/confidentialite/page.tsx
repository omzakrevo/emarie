import { getT } from "@/i18n/server";
import type { MessageKey } from "@/i18n/messages";
import { getPublicText } from "@/server/public-content";
import { getCurrentMunicipality } from "@/server/tenancy";

export default async function Page() {
  const { t, locale } = await getT();
  const m = await getCurrentMunicipality();
  const custom = await getPublicText(m.id, "public.privacy", locale);   // texte validé par la mairie, s'il existe
  return (
    <article className="rounded-2xl bg-surface p-6 shadow-sm">
      <h1 className="mb-4 text-2xl font-bold text-brand-900">{t("privacy.title")}</h1>
      {custom ? <div className="whitespace-pre-line">{custom}</div> : (
        <>
          <p role="note" className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{t("privacy.draftNotice")}</p>
          {([1, 2, 3, 4, 5, 6, 7] as const).map((i) => (
            <section key={i} className="mb-4"><h2 className="font-semibold">{t(`privacy.s${i}.t` as MessageKey)}</h2>
              <p className="text-slate-800">{t(`privacy.s${i}.b` as MessageKey, { name: m.name })}</p></section>))}
        </>)}
    </article>
  );
}
