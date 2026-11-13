import Link from "next/link";
import type { ReactNode } from "react";
import { I18nProvider } from "@/i18n/client";
import { getLocale } from "@/i18n/server";
import { dyuValidated, messagesFor } from "@/i18n/messages";
import { createServerSupabase } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { getCurrentMunicipality } from "@/server/tenancy";
import { LocaleSwitcher } from "./locale-switcher";

export async function SiteShell({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  const messages = messagesFor(locale);
  const t = (k: keyof typeof messages) => messages[k];
  if (!isSupabaseConfigured()) {
    return <I18nProvider locale={locale} messages={messages}><main className="mx-auto max-w-xl p-8"><h1 className="text-2xl font-semibold text-brand-900">E-MAIRIE</h1><p className="mt-3 text-sm">Supabase n&apos;est pas configuré. Copiez <code>.env.example</code> vers <code>.env.local</code>.</p></main></I18nProvider>;
  }
  const m = await getCurrentMunicipality();
  const { data } = await (await createServerSupabase()).auth.getUser();
  const links: [string, string][] = [["/", t("nav.home")], ["/mairie", t("nav.mairie")], ["/commune", t("nav.commune")], ["/services", t("nav.services")], ["/actualites", t("nav.news")], ["/contacts", t("nav.contacts")], ["/horaires", t("nav.hours")]];
  return (
    <I18nProvider locale={locale} messages={messages}>
      <header className="bg-brand-900 text-white">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
          {m.logo_path
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/municipality-logos/${m.logo_path}`} alt="" className="h-11 w-11 shrink-0 rounded-full bg-white object-contain" />
            : <div aria-label="Emplacement du logo officiel" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-dashed border-white/60 text-[10px] leading-tight text-white/70">LOGO</div>}
          <Link href="/" className="flex-1 leading-tight">
            <span className="block text-lg font-bold">{t("app.name")}</span>
            <span className="block text-xs text-white/80">{m.name}</span>
          </Link>
          <LocaleSwitcher />
        </div>
        <nav aria-label="Navigation principale" className="border-t border-white/15">
          <ul className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-2 text-sm">
            {links.map(([href, label]) => <li key={href}><Link href={href} className="inline-block whitespace-nowrap px-3 py-3 hover:bg-white/10">{label}</Link></li>)}
            <li className="ml-auto"><Link href={data.user ? "/mon-espace" : "/connexion"} className="inline-block whitespace-nowrap px-3 py-3 font-semibold hover:bg-white/10">{data.user ? t("nav.account") : t("nav.login")}</Link></li>
          </ul>
        </nav>
      </header>
      {locale === "dyu" && !dyuValidated && <p role="note" className="bg-amber-50 px-4 py-2 text-center text-sm text-amber-900">{t("i18n.dyuNotice")}</p>}
      <div className="mx-auto max-w-5xl px-4 py-6">{children}</div>
      <footer className="mt-8 border-t border-slate-200 py-6 text-center text-sm text-slate-600">
        {t("app.name")} — {t("app.slogan")} · <Link href="/confidentialite" className="underline">{t("privacy.link")}</Link>
      </footer>
    </I18nProvider>
  );
}
