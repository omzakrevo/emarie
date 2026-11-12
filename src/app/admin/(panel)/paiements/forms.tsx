"use client";
import { useActionState } from "react";
import { FormMessage } from "@/components/admin/form-message";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/client";
import { decideRefundAction, executeRefundAction, requestRefundAction, setProviderEnabledAction } from "@/server/admin/payment-actions";

const input = "min-h-11 w-full rounded-lg border border-slate-300 bg-surface px-3 text-sm";

export function ProviderRow({ provider, label, enabled, available, reason, canEdit }: { provider: string; label: string; enabled: boolean; available: boolean; reason?: string; canEdit: boolean }) {
  const { t } = useI18n(); const [s, action, pending] = useActionState(setProviderEnabledAction, undefined);
  return (<form action={action} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 p-3 text-sm"><input type="hidden" name="provider" value={provider} /><input type="hidden" name="enabled" value={String(!enabled)} />
    <span><strong>{label}</strong>{!available && <span className="ml-2 text-slate-600">— {reason ?? t("adm.pay.notIntegrated")}</span>}</span>
    <span className="flex items-center gap-2"><span className={`rounded-full px-3 py-1 text-xs font-semibold ${enabled ? "bg-accent-50 text-accent-700" : "bg-slate-200 text-slate-700"}`}>{enabled ? t("adm.ag.active") : t("adm.ag.inactive")}</span>
      {canEdit && (available || enabled) && <Button variant="secondary" disabled={pending} className="!min-h-10">{enabled ? t("adm.ag.deactivate") : t("adm.ag.activate")}</Button>}</span><FormMessage state={s} /></form>);
}

export function RefundRequestForm({ payments }: { payments: { id: string; label: string }[] }) {
  const { t } = useI18n(); const [s, action, pending] = useActionState(requestRefundAction, undefined);
  if (!payments.length) return null;
  return (<form action={action} className="grid gap-2 rounded-xl border border-slate-200 p-3 sm:grid-cols-4 sm:items-end"><h3 className="font-semibold sm:col-span-4">{t("adm.pay.refundRequest")}</h3>
    <label className="flex flex-col gap-1 text-xs">{t("adm.pay.refundPayment")}<select name="payment" className={input}>{payments.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select></label>
    <label className="flex flex-col gap-1 text-xs">{t("adm.pay.refundAmount")}<input name="amount" type="number" min={1} required className={input} /></label>
    <label className="flex flex-col gap-1 text-xs">{t("adm.pay.refundReason")}<input name="reason" required minLength={3} maxLength={300} className={input} /></label>
    <Button disabled={pending} className="!min-h-11">{t("adm.pay.refundRequest")}</Button><div className="sm:col-span-4"><FormMessage state={s} /></div></form>);
}

export function RefundActions({ id, status, mine }: { id: string; status: string; mine: boolean }) {
  const { t } = useI18n(); const [d, decide, dp] = useActionState(decideRefundAction, undefined); const [e, exec, ep] = useActionState(executeRefundAction, undefined);
  return (<div className="mt-2 flex flex-wrap items-center gap-2">
    {status === "requested" && !mine && (<><form action={decide}><input type="hidden" name="refund" value={id} /><input type="hidden" name="approve" value="true" /><Button disabled={dp} className="!min-h-10">{t("adm.pay.approve")}</Button></form>
      <form action={decide}><input type="hidden" name="refund" value={id} /><input type="hidden" name="approve" value="false" /><Button variant="secondary" disabled={dp} className="!min-h-10">{t("adm.pay.reject")}</Button></form></>)}
    {status === "approved" && (<form action={exec} className="flex flex-wrap items-center gap-2"><input type="hidden" name="refund" value={id} />
      <input name="ref" required minLength={3} maxLength={120} placeholder={t("adm.pay.providerRef")} aria-label={t("adm.pay.providerRef")} className={input + " !w-64"} /><Button variant="accent" disabled={ep} className="!min-h-10">{t("adm.pay.executed")}</Button></form>)}
    <FormMessage state={d} /><FormMessage state={e} /></div>);
}
