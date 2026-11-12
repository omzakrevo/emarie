"use client";
import { useActionState } from "react";
import { FormMessage } from "@/components/admin/form-message";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/client";
import { processQueueNowAction, retryNotificationAction, saveSmsTemplateAction } from "@/server/admin/payment-actions";

export function TemplateForm({ id, label, body, active }: { id: string; label: string; body: string; active: boolean }) {
  const { t } = useI18n(); const [s, action, pending] = useActionState(saveSmsTemplateAction, undefined);
  return (<form action={action} className="flex flex-col gap-2 rounded-xl border border-slate-200 p-3"><input type="hidden" name="id" value={id} />
    <label className="flex flex-col gap-1 text-sm font-semibold">{label}<textarea name="body" rows={2} defaultValue={body} required minLength={5} maxLength={320} className="w-full rounded-lg border border-slate-300 bg-surface p-2 text-sm font-normal" /></label>
    <div className="flex items-center justify-between"><label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={active} className="h-5 w-5" />{t("adm.sms.active")}</label><Button variant="secondary" disabled={pending} className="!min-h-10">{t("common.save")}</Button></div>
    <FormMessage state={s} /></form>);
}
export function RetryButton({ id }: { id: string }) {
  const { t } = useI18n(); const [s, action, pending] = useActionState(retryNotificationAction, undefined);
  return <form action={action}><input type="hidden" name="id" value={id} /><Button variant="ghost" disabled={pending} className="!min-h-9">{t("adm.sms.retry")}</Button><FormMessage state={s} /></form>;
}
export function ProcessNow() {
  const { t } = useI18n(); const [s, action, pending] = useActionState(processQueueNowAction, undefined);
  return <form action={action} className="flex items-center gap-3"><Button variant="secondary" disabled={pending}>{t("adm.sms.process")}</Button>{s?.ok && <span role="status" className="text-sm">{t("adm.sms.processed")} {s.message}</span>}{s?.error && <FormMessage state={s} />}</form>;
}
