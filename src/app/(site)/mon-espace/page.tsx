import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createServerSupabase } from "@/lib/supabase/server";
import { getT } from "@/i18n/server";
import { pickLocalized } from "@/i18n/messages";
import { signOutCitizen } from "@/server/auth/citizen-actions";
import { getCurrentMunicipality } from "@/server/tenancy";
import { ProfileForm } from "./profile-form";

export default async function Page() {
  const { t, locale } = await getT();
  const m = await getCurrentMunicipality();
  const sb = await createServerSupabase();
  const { data: u } = await sb.auth.getUser();
  if (!u.user) redirect("/connexion");
  // RLS : seules les demandes du compte connecté sont renvoyées.
  const [{ data: profile }, { data: apps }] = await Promise.all([
    sb.from("profiles").select("full_name, phone, preferred_language").eq("id", u.user.id).maybeSingle(),
    sb.from("applications").select("id, reference, status, created_at, services(name)").eq("municipality_id", m.id).order("created_at", { ascending: false }),
  ]);
  const rows = (apps ?? []) as unknown as { id: string; reference: string | null; status: string; created_at: string; services: { name: Record<string, string> } | null }[];
  const drafts = rows.filter((a) => a.status === "DRAFT"), sent = rows.filter((a) => a.status !== "DRAFT");
  const li = "flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-surface p-3 text-sm";
  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between"><h1 className="text-2xl font-bold text-brand-900">{t("account.title")}</h1>
        <form action={signOutCitizen}><Button variant="ghost" type="submit">{t("nav.logout")}</Button></form></div>
      {drafts.length > 0 && <section><h2 className="mb-2 font-semibold">{t("account.drafts")}</h2><ul className="flex flex-col gap-2">{drafts.map((a) => (
        <li key={a.id} className={li}><span>{pickLocalized(a.services?.name, locale)}</span><Link className="font-semibold text-brand-700 underline" href={`/demande/${a.id}`}>{t("account.resume")}</Link></li>))}</ul></section>}
      <section><h2 className="mb-2 font-semibold">{t("account.requests")}</h2>
        {sent.length === 0 ? <p className="text-sm text-slate-600">{t("account.none")}</p> : <ul className="flex flex-col gap-2">{sent.map((a) => (
          <li key={a.id} className={li}><span><span className="font-mono font-semibold">{a.reference}</span><br />{pickLocalized(a.services?.name, locale)}</span>
            <span className="rounded-full bg-brand-50 px-3 py-1 font-medium text-brand-900">{t(`status.${a.status}` as never)}</span></li>))}</ul>}
      </section>
      <section><h2 className="mb-2 font-semibold">{t("account.profile")}</h2><ProfileForm name={profile?.full_name ?? ""} language={profile?.preferred_language ?? "fr"} phone={profile?.phone ?? ""} /></section>
    </div>
  );
}
