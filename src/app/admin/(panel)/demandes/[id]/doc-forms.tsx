"use client";
import { useActionState, useState } from "react";
import { FormMessage } from "@/components/admin/form-message";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/client";
import { documentStepAction, generateDocumentAction } from "@/server/documents/actions";

const input = "min-h-11 w-full rounded-lg border border-slate-300 bg-surface px-3 text-sm";

export function GenerateForm({ applicationId }: { applicationId: string }) {
  const { t } = useI18n(); const [s, action, pending] = useActionState(generateDocumentAction, undefined);
  return (<form action={action} className="flex flex-col gap-2"><input type="hidden" name="applicationId" value={applicationId} />
    <Button variant="accent" disabled={pending}>{pending ? t("common.loading") : t("adm.doc.generate")}</Button><FormMessage state={s} /></form>);
}

export function StepButton({ applicationId, docId, kind, label, variant = "primary" }: { applicationId: string; docId: string; kind: "print" | "hand" | "release"; label: string; variant?: "primary" | "secondary" | "accent" }) {
  const [s, action, pending] = useActionState(documentStepAction, undefined);
  return (<form action={action} className="flex flex-col gap-1"><input type="hidden" name="applicationId" value={applicationId} /><input type="hidden" name="docId" value={docId} /><input type="hidden" name="kind" value={kind} />
    <Button variant={variant} disabled={pending}>{label}</Button><FormMessage state={s} /></form>);
}

export function DiscardForm({ applicationId, docId }: { applicationId: string; docId: string }) {
  const { t } = useI18n(); const [s, action, pending] = useActionState(documentStepAction, undefined); const [open, setOpen] = useState(false);
  if (!open) return <Button type="button" variant="ghost" className="text-red-700" onClick={() => setOpen(true)}>{t("adm.doc.discard")}</Button>;
  return (<form action={action} className="flex flex-col gap-2 rounded-xl border border-red-200 p-3"><input type="hidden" name="applicationId" value={applicationId} /><input type="hidden" name="docId" value={docId} /><input type="hidden" name="kind" value="discard" />
    <label className="flex flex-col gap-1 text-sm font-medium">{t("adm.doc.reason")}<input name="reason" required maxLength={300} className={input} /></label>
    <Button variant="secondary" disabled={pending}>{t("adm.doc.discard")}</Button><FormMessage state={s} /></form>);
}

export function SignForm({ applicationId, docId }: { applicationId: string; docId: string }) {
  const { t } = useI18n(); const [s, action, pending] = useActionState(documentStepAction, undefined);
  return (<form action={action} className="grid gap-2 sm:grid-cols-2"><input type="hidden" name="applicationId" value={applicationId} /><input type="hidden" name="docId" value={docId} /><input type="hidden" name="kind" value="sign" />
    <label className="flex flex-col gap-1 text-sm font-medium">{t("adm.doc.signer")}<input name="signer" required minLength={2} maxLength={120} className={input} /></label>
    <label className="flex flex-col gap-1 text-sm font-medium">{t("adm.doc.signerTitle")}<input name="title" required minLength={2} maxLength={120} className={input} /></label>
    <div className="sm:col-span-2"><Button variant="accent" disabled={pending}>{t("adm.doc.confirmSign")}</Button></div><div className="sm:col-span-2"><FormMessage state={s} /></div></form>);
}

export function WithdrawForm({ applicationId, docId }: { applicationId: string; docId: string }) {
  const { t } = useI18n(); const [s, action, pending] = useActionState(documentStepAction, undefined);
  return (<form action={action} className="grid gap-2 sm:grid-cols-2"><input type="hidden" name="applicationId" value={applicationId} /><input type="hidden" name="docId" value={docId} /><input type="hidden" name="kind" value="withdraw" />
    <label className="flex flex-col gap-1 text-sm font-medium">{t("adm.doc.withdrawer")}<input name="name" required minLength={2} maxLength={120} className={input} /></label>
    <label className="flex flex-col gap-1 text-sm font-medium">{t("adm.doc.relationship")}<input name="relationship" required minLength={2} maxLength={60} className={input} /></label>
    <label className="flex flex-col gap-1 text-sm font-medium">{t("adm.doc.idType")}<select name="idType" className={input}><option value="cnib">CNIB</option><option value="passeport">Passeport</option><option value="permis">Permis</option><option value="autre">Autre</option></select></label>
    <label className="flex flex-col gap-1 text-sm font-medium">{t("adm.doc.idNumber")}<input name="idNumber" required minLength={4} maxLength={40} autoComplete="off" className={input} /></label>
    <label className="flex items-center gap-2 text-sm font-medium sm:col-span-2"><input type="checkbox" name="verified" className="h-5 w-5" required />{t("adm.doc.idVerified")}</label>
    <div className="sm:col-span-2"><Button disabled={pending}>{t("adm.doc.withdraw")}</Button></div><div className="sm:col-span-2"><FormMessage state={s} /></div></form>);
}
