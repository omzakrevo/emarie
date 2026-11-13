import { createServerSupabase } from "@/lib/supabase/server";
import { getT } from "@/i18n/server";
import { pickLocalized } from "@/i18n/messages";
import { getCurrentMunicipality } from "@/server/tenancy";

export default async function Page() {
  const { t, locale } = await getT();
  const m = await getCurrentMunicipality();
  const { data } = await (await createServerSupabase()).from("announcements").select("id,title,body,published_at")
    .eq("municipality_id", m.id).eq("is_published", true).order("published_at", { ascending: false }).limit(30);
  return (
    <div><h1 className="mb-4 text-2xl font-bold text-brand-900">{t("page.news")}</h1>
      {!data?.length ? <p className="text-slate-600">{t("page.noNews")}</p> :
        <ul className="flex flex-col gap-4">{data.map((a) => (
          <li key={a.id} className="rounded-2xl bg-surface p-5 shadow-sm">
            <h2 className="font-semibold">{pickLocalized(a.title as Record<string, string>, locale)}</h2>
            {a.published_at && <time className="text-xs text-slate-600" dateTime={a.published_at}>{new Date(a.published_at).toLocaleDateString("fr-FR")}</time>}
            <p className="mt-2 whitespace-pre-line text-sm">{pickLocalized(a.body as Record<string, string>, locale)}</p>
          </li>))}</ul>}
    </div>);
}
