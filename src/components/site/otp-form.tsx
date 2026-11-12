"use client";
import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/client";
import { requestOtp, verifyOtp } from "@/server/auth/citizen-actions";

export function OtpForm({ mode }: { mode: "login" | "register" }) {
  const { t } = useI18n();
  const [req, reqAction, reqPending] = useActionState(requestOtp.bind(null, mode), undefined);
  const [ver, verAction, verPending] = useActionState(verifyOtp, undefined);
  const phase = ver?.phase === "code" || req?.phase === "code" ? "code" : "phone";
  const phone = ver?.phone ?? req?.phone ?? "";
  const err = ver?.error ?? req?.error;
  const input = "min-h-12 w-full rounded-xl border border-slate-300 bg-surface px-4 text-base";
  const msg = err === "rate_limited" ? t("common.tooMany") : err === "sms_unavailable" ? t("auth.smsUnavailable") : err === "code" ? t("auth.invalidCode") : err ? t("common.error") : "";
  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-4 text-2xl font-bold text-brand-900">{mode === "login" ? t("auth.loginTitle") : t("auth.registerTitle")}</h1>
      {phase === "phone" ? (
        <form action={reqAction} className="flex flex-col gap-3">
          {mode === "register" && <label className="flex flex-col gap-1 text-sm font-medium">{t("auth.name")}<input name="name" required minLength={2} autoComplete="name" className={input} /></label>}
          <label className="flex flex-col gap-1 text-sm font-medium">{t("auth.phone")}<input name="phone" type="tel" inputMode="tel" required autoComplete="tel" placeholder="70 12 34 56" className={input} /></label>
          <Button disabled={reqPending}>{reqPending ? t("common.loading") : t("auth.sendCode")}</Button>
        </form>) : (
        <form action={verAction} className="flex flex-col gap-3">
          <p className="text-sm">{t("auth.codeSent", { phone })}</p>
          <input type="hidden" name="phone" value={phone} />
          <label className="flex flex-col gap-1 text-sm font-medium">{t("auth.code")}<input name="code" inputMode="numeric" autoComplete="one-time-code" required className={input + " tracking-widest"} /></label>
          <Button disabled={verPending}>{verPending ? t("common.loading") : t("auth.verify")}</Button>
        </form>)}
      {msg && <p role="alert" className="mt-3 text-sm font-medium text-red-700">{msg}</p>}
      <p className="mt-6 text-sm">
        {mode === "login" ? <>{t("auth.noAccountYet")} <Link className="font-semibold text-brand-700 underline" href="/inscription">{t("nav.register")}</Link></> :
          <>{t("auth.haveAccount")} <Link className="font-semibold text-brand-700 underline" href="/connexion">{t("nav.login")}</Link></>}
      </p>
      <p className="mt-2 text-sm text-slate-600">{t("auth.guestHint")} <Link className="font-semibold text-brand-700 underline" href="/demande">{t("nav.apply")}</Link></p>
    </div>
  );
}
