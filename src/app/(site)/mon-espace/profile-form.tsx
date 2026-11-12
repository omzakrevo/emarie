"use client";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/client";
import { updateProfile } from "@/server/auth/citizen-actions";

export function ProfileForm({ name, language, phone }: { name: string; language: string; phone: string }) {
  const { t } = useI18n();
  const [s, action, pending] = useActionState(updateProfile, undefined);
  const input = "min-h-12 w-full rounded-xl border border-slate-300 bg-surface px-4";
  return (
    <form action={action} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm font-medium">{t("auth.name")}<input name="name" defaultValue={name} required minLength={2} className={input} /></label>
      <label className="flex flex-col gap-1 text-sm font-medium">{t("auth.phone")}<input value={phone} readOnly disabled className={input + " bg-slate-100"} /></label>
      <label className="flex flex-col gap-1 text-sm font-medium">{t("common.language")}
        <select name="language" defaultValue={language} className={input}><option value="fr">Français</option><option value="dyu">Dioula</option></select></label>
      <Button disabled={pending} variant="secondary">{t("common.save")}</Button>
      {s?.ok && <p role="status" className="text-sm text-accent-700">{t("account.saved")}</p>}
      {s?.error && <p role="alert" className="text-sm text-red-700">{t("common.error")}</p>}
    </form>
  );
}
