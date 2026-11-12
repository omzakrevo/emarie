import Link from "next/link";
import type { ReactNode } from "react";
import { I18nProvider } from "@/i18n/client";
import { getLocale } from "@/i18n/server";
import { messagesFor } from "@/i18n/messages";
import { can, getAdminContext } from "@/server/admin/context";
import { signOutAgent } from "@/app/admin/connexion/actions";
import { LocaleSwitcher } from "@/components/site/locale-switcher";

export async function AdminShell({ children }: { children: ReactNode }) {
  const ctx = await getAdminContext();
  const locale = await getLocale(); const m = messagesFor(locale);
  const nav: [string, string, boolean][] = [
    ["/admin", m["adm.nav.dashboard"], can(ctx, "applications.read") || can(ctx, "reports.read")],
    ["/admin/demandes", m["adm.nav.requests"], can(ctx, "applications.read")],
    ["/admin/agents", m["adm.nav.agents"], can(ctx, "agents.manage")],
    ["/admin/roles", m["adm.nav.roles"], can(ctx, "roles.manage")],
    ["/admin/parametres", m["adm.nav.settings"], can(ctx, "municipality.settings.manage")],
  ];
  return (
    <I18nProvider locale={locale} messages={m}>
      <header className="bg-brand-900 text-white">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <div className="flex-1 leading-tight"><span className="block font-bold">E-MAIRIE — {m["adm.title"]}</span><span className="block text-xs text-white/80">{ctx.municipality.name} · {ctx.roleLabel}</span></div>
          <LocaleSwitcher />
          <form action={signOutAgent}><button className="min-h-10 rounded-lg border border-white/40 px-3 text-sm hover:bg-white/10">{m["nav.logout"]}</button></form>
        </div>
        <nav aria-label="Administration" className="border-t border-white/15"><ul className="mx-auto flex max-w-6xl overflow-x-auto px-2 text-sm">
          {nav.filter(([, , ok]) => ok).map(([href, label]) => <li key={href}><Link href={href} className="inline-block whitespace-nowrap px-3 py-3 hover:bg-white/10">{label}</Link></li>)}
        </ul></nav>
      </header>
      <div className="mx-auto max-w-6xl px-4 py-6">{children}</div>
    </I18nProvider>
  );
}
