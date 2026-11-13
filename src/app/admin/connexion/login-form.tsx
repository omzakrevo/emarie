"use client";
import { useActionState } from "react";
import { useI18n } from "@/i18n/client";
import { signInAgent } from "./actions";

export function LoginForm() {
  const { t } = useI18n();
  const [state, action, pending] = useActionState(signInAgent, undefined);
  return (
    <form action={action} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm">{t("adm.login.email")}
        <input name="email" type="email" required autoComplete="username" className="min-h-12 rounded-xl border border-slate-300 p-3" />
      </label>
      <label className="flex flex-col gap-1 text-sm">{t("adm.login.password")}
        <input name="password" type="password" required minLength={8} autoComplete="current-password" className="min-h-12 rounded-xl border border-slate-300 p-3" />
      </label>
      {state?.error && <p role="alert" className="text-sm text-red-700">{t(state.error)}</p>}
      <button disabled={pending} className="min-h-12 rounded-xl bg-brand-700 p-2 font-medium text-white disabled:opacity-60">
        {pending ? t("adm.login.loading") : t("adm.login.submit")}
      </button>
    </form>
  );
}
