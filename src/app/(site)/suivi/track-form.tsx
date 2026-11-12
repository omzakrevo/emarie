"use client";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/client";
import { pickLocalized } from "@/i18n/messages";
import { trackApplication } from "@/server/applications/actions";

export function TrackForm() {
  const { t, locale } = useI18n();
  const [state, action, pending] = useActionState(trackApplication, undefined);
  const input = "min-h-12 w-full rounded-xl border border-slate-300 bg-surface px-4 text-base";
  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-2 text-2xl font-bold text-brand-900">{t("track.title")}</h1>
      <p className="mb-4 text-sm text-slate-600">{t("track.help")}</p>
      {/* POST (server action) : référence et code ne transitent jamais dans l'URL */}
      <form action={action} className="flex flex-col gap-3" autoComplete="off">
        <label className="flex flex-col gap-1 text-sm font-medium">{t("track.reference")}
          <input name="reference" required placeholder="NIA-2026-000001" className={input} autoCapitalize="characters" /></label>
        <label className="flex flex-col gap-1 text-sm font-medium">{t("track.code")}
          <input name="code" required placeholder="XXXX-XXXX-XXXX" className={input + " font-mono"} autoCapitalize="characters" /></label>
        <Button disabled={pending}>{pending ? t("common.loading") : t("track.submit")}</Button>
      </form>
      {state && !state.ok && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-medium text-red-800">{state.error === "rate_limited" ? t("common.tooMany") : t("track.notFound")}</p>}
      {state?.ok && (
        <section className="mt-6 rounded-2xl border border-slate-200 bg-surface p-4" aria-live="polite">
          <p className="text-sm text-slate-600">{pickLocalized(state.result.serviceName, locale)}</p>
          <p className="text-xl font-bold text-brand-900">{t(`status.${state.result.status}` as never)}</p>
          <h2 className="mt-4 font-semibold">{t("track.history")}</h2>
          <ol className="mt-2 flex flex-col gap-2 text-sm">
            {state.result.events.map((e, i) => (
              <li key={i} className="border-l-2 border-accent-600 pl-3">
                <span className="font-medium">{t(`status.${e.to_status}` as never)}</span>{" "}
                <time className="text-slate-500" dateTime={e.created_at}>{new Date(e.created_at).toLocaleString("fr-FR")}</time>
                {e.public_note && <p className="text-slate-700"><span className="font-medium">{t("track.note")} : </span>{e.public_note}</p>}
              </li>))}
          </ol>
        </section>)}
    </div>
  );
}
