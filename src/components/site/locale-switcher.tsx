"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { setLocale } from "@/server/applications/actions";
import { useI18n } from "@/i18n/client";
import type { Locale } from "@/i18n/messages";

export function LocaleSwitcher() {
  const { locale, t } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div role="group" aria-label={t("common.language")} className="flex overflow-hidden rounded-lg border border-white/40 text-sm">
      {(["fr", "dyu"] as Locale[]).map((l) => (
        <button key={l} type="button" disabled={pending} aria-pressed={locale === l}
          onClick={() => start(async () => { await setLocale(l); router.refresh(); })}
          className={`min-h-10 px-3 font-semibold ${locale === l ? "bg-white text-brand-900" : "text-white hover:bg-white/10"}`}>
          {l === "fr" ? "FR" : "DYU"}
        </button>))}
    </div>
  );
}
