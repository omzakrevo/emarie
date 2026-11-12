"use client";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/client";
import { setPasswordAction } from "@/server/admin/actions";

export function PasswordForm() {
  const { t } = useI18n();
  const [s, action, pending] = useActionState(setPasswordAction, undefined);
  return (
    <form action={action} className="flex flex-col gap-3">
      <h1 className="text-2xl font-semibold text-brand-900">{t("adm.pw.title")}</h1>
      <label className="flex flex-col gap-1 text-sm">{t("adm.pw.new")}
        <input name="password" type="password" required minLength={12} autoComplete="new-password" className="min-h-12 rounded-xl border border-slate-300 px-4" /></label>
      <Button disabled={pending}>{t("adm.pw.save")}</Button>
      {s?.error && <p role="alert" className="text-sm text-red-700">{t("adm.err.generic")}</p>}
      {s?.ok && <p role="status" className="text-sm text-accent-700">{t("adm.st.saved")} <a className="underline" href="/admin">→</a></p>}
    </form>
  );
}
