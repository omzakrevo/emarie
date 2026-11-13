"use client";
import { useActionState } from "react";
import { FormMessage } from "@/components/admin/form-message";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/client";
import { saveSettingsAction } from "@/server/admin/actions";

export interface SettingsValues { signer_name: string; cr_number_format: string; about_mairie: string; about_commune: string; opening_hours: string; address: string; phone: string; email: string; skip_payment: boolean }
const input = "min-h-11 w-full rounded-lg border border-slate-300 bg-surface px-3 text-sm";

export function SettingsForm({ v }: { v: SettingsValues }) {
  const { t } = useI18n();
  const [state, action, pending] = useActionState(saveSettingsAction, undefined);
  return (
    <form action={action} className="flex flex-col gap-4 rounded-2xl bg-surface p-5 shadow-sm">
      <h2 className="font-semibold">{t("adm.st.textsFr")}</h2>
      <label className="flex flex-col gap-1 text-sm">{t("adm.st.aboutMairie")}<textarea name="about_mairie" rows={4} defaultValue={v.about_mairie} className={input} /></label>
      <label className="flex flex-col gap-1 text-sm">{t("adm.st.aboutCommune")}<textarea name="about_commune" rows={4} defaultValue={v.about_commune} className={input} /></label>
      <label className="flex flex-col gap-1 text-sm">{t("adm.st.hours")}<textarea name="opening_hours" rows={3} defaultValue={v.opening_hours} className={input} /></label>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-sm">{t("adm.st.address")}<input name="address" defaultValue={v.address} className={input} /></label>
        <label className="flex flex-col gap-1 text-sm">{t("adm.st.phone")}<input name="phone" defaultValue={v.phone} className={input} /></label>
        <label className="flex flex-col gap-1 text-sm">{t("adm.st.email")}<input name="email" type="email" defaultValue={v.email} className={input} /></label>
      </div>
      <h2 className="font-semibold">{t("adm.st.documents")}</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">{t("adm.st.signerName")}<input name="signer_name" defaultValue={v.signer_name} maxLength={120} className={input} /><span className="text-xs text-slate-600">{t("adm.st.signerNameHint")}</span></label>
        <label className="flex flex-col gap-1 text-sm">{t("adm.st.crFormat")}<input name="cr_number_format" defaultValue={v.cr_number_format} maxLength={60} pattern="[A-Za-z0-9{}/_. \-]{3,60}" className={input + " font-mono"} /><span className="text-xs text-slate-600">{t("adm.st.crFormatHint")}</span></label>
      </div>
      <fieldset className="rounded-xl border border-amber-300 bg-amber-50 p-3">
        <label className="flex items-start gap-3 text-sm font-medium"><input type="checkbox" name="skip_payment" defaultChecked={v.skip_payment} className="mt-1 h-5 w-5" />{t("adm.st.skipPayment")}</label>
        <p className="mt-1 text-sm text-amber-900">{t("adm.st.skipPaymentWarn")}</p>
      </fieldset>
      <Button disabled={pending}>{t("common.save")}</Button><FormMessage state={state} />
    </form>
  );
}
