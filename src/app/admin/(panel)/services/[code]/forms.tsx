"use client";
import { useActionState } from "react";
import { FormMessage } from "@/components/admin/form-message";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/client";
import { deleteDocumentAction, saveDocumentAction, saveFieldAction, saveServiceAction, setPriceAction } from "@/server/admin/service-actions";

const input = "min-h-11 w-full rounded-lg border border-slate-300 bg-surface px-3 text-sm";
const box = "flex flex-col gap-3 rounded-2xl bg-surface p-5 shadow-sm";

export function ServiceForm(p: { id: string; description: string; procedure: string; delay: number | null; active: boolean; canEdit: boolean }) {
  const { t } = useI18n(); const [s, action, pending] = useActionState(saveServiceAction, undefined);
  return (<form action={action} className={box}><input type="hidden" name="id" value={p.id} />
    <label className="flex items-center gap-3 text-sm font-medium"><input type="checkbox" name="active" defaultChecked={p.active} disabled={!p.canEdit} className="h-5 w-5" />{t("adm.sv.active")}</label>
    <label className="flex flex-col gap-1 text-sm">{t("adm.sv.description")}<textarea name="description" rows={2} defaultValue={p.description} disabled={!p.canEdit} className={input} /></label>
    <label className="flex flex-col gap-1 text-sm">{t("adm.sv.procedure")}<textarea name="procedure" rows={4} defaultValue={p.procedure} disabled={!p.canEdit} className={input} /></label>
    <label className="flex flex-col gap-1 text-sm">{t("adm.sv.delay")}<input name="delay" inputMode="numeric" pattern="\d{0,3}" defaultValue={p.delay ?? ""} disabled={!p.canEdit} className={input + " max-w-32"} /></label>
    {p.canEdit && <Button disabled={pending}>{t("adm.sv.save")}</Button>}<FormMessage state={s} /></form>);
}

export function PriceForm({ id, today }: { id: string; today: string }) {
  const { t } = useI18n(); const [s, action, pending] = useActionState(setPriceAction, undefined);
  return (<form action={action} className="grid gap-3 sm:grid-cols-3"><input type="hidden" name="id" value={id} />
    <label className="flex flex-col gap-1 text-sm">{t("adm.sv.newPrice")}<input name="amount" type="number" min={0} max={10000000} step={1} required className={input} /></label>
    <label className="flex flex-col gap-1 text-sm">{t("adm.sv.validFrom")}<input name="from" type="date" defaultValue={today} required className={input} /></label>
    <div className="flex items-end"><Button disabled={pending} className="w-full">{t("adm.sv.setPrice")}</Button></div>
    <div className="sm:col-span-3"><FormMessage state={s} /></div></form>);
}

export function FieldRow(p: { id: string; label: string; help: string; required: boolean; step: number; type: string; canEdit: boolean }) {
  const { t } = useI18n(); const [s, action, pending] = useActionState(saveFieldAction, undefined);
  return (<form action={action} className="grid gap-2 rounded-xl border border-slate-200 p-3 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end"><input type="hidden" name="id" value={p.id} />
    <label className="flex flex-col gap-1 text-xs">{t("adm.sv.label")} · {t("adm.sv.step")} {p.step} · {p.type}<input name="label" defaultValue={p.label} required disabled={!p.canEdit} className={input} /></label>
    <label className="flex flex-col gap-1 text-xs">{t("adm.sv.help")}<input name="help" defaultValue={p.help} disabled={!p.canEdit} className={input} /></label>
    <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="required" defaultChecked={p.required} disabled={!p.canEdit} className="h-5 w-5" />{t("adm.sv.required")}</label>
    {p.canEdit && <Button variant="secondary" disabled={pending} className="!min-h-11">{t("adm.sv.save")}</Button>}<div className="sm:col-span-4"><FormMessage state={s} /></div></form>);
}

export function DocumentRow(p: { serviceId: string; id?: string; label: string; required: boolean; max: number; canEdit: boolean }) {
  const { t } = useI18n(); const [s, action, pending] = useActionState(saveDocumentAction, undefined); const [d, delAction, delPending] = useActionState(deleteDocumentAction, undefined);
  return (<div className="rounded-xl border border-slate-200 p-3"><form action={action} className="grid gap-2 sm:grid-cols-[1fr_8rem_auto_auto] sm:items-end"><input type="hidden" name="serviceId" value={p.serviceId} />{p.id && <input type="hidden" name="docId" value={p.id} />}
    <label className="flex flex-col gap-1 text-xs">{t("adm.sv.label")}<input name="label" defaultValue={p.label} required disabled={!p.canEdit} className={input} /></label>
    <label className="flex flex-col gap-1 text-xs">{t("adm.sv.maxSize")}<input name="max" type="number" min={100} max={10240} defaultValue={p.max} disabled={!p.canEdit} className={input} /></label>
    <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="required" defaultChecked={p.required} disabled={!p.canEdit} className="h-5 w-5" />{t("adm.sv.required")}</label>
    {p.canEdit && <Button variant="secondary" disabled={pending} className="!min-h-11">{p.id ? t("adm.sv.save") : t("adm.sv.addDocument")}</Button>}</form>
    {p.id && p.canEdit && <form action={delAction} className="mt-2"><input type="hidden" name="docId" value={p.id} /><Button variant="ghost" disabled={delPending} className="!min-h-10 text-red-700">{t("adm.sv.delete")}</Button></form>}
    <FormMessage state={s} /><FormMessage state={d} /></div>);
}
