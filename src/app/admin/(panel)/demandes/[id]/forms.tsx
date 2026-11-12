"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { FormMessage } from "@/components/admin/form-message";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/client";
import { addNoteAction, registryCheckAction, transitionAction } from "@/server/admin/actions";

const area = "w-full rounded-xl border border-slate-300 bg-surface p-3 text-sm";

export function TransitionForm({ applicationId, to, needsNote }: { applicationId: string; to: string; needsNote: boolean }) {
  const { t } = useI18n();
  const [state, action, pending] = useActionState(transitionAction, undefined);
  const [open, setOpen] = useState(false);
  const variant = to === "REJECTED" ? "secondary" : to === "VALIDATED" ? "accent" : "primary";
  return (
    <form action={action} className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-surface p-3">
      <input type="hidden" name="applicationId" value={applicationId} /><input type="hidden" name="to" value={to} />
      {needsNote && open && (
        <label className="flex flex-col gap-1 text-sm font-medium">{t("adm.d.publicNote")}<textarea name="note" required rows={3} maxLength={1000} className={area} /></label>)}
      {needsNote && !open
        ? <Button type="button" variant={variant} onClick={() => setOpen(true)}>{t(`status.${to}` as never)}</Button>
        : <Button type="submit" variant={variant} disabled={pending}>{pending ? t("common.loading") : t(`status.${to}` as never)}</Button>}
      <FormMessage state={state} />
    </form>
  );
}

export function NoteForm({ applicationId }: { applicationId: string }) {
  const { t } = useI18n();
  const [state, action, pending] = useActionState(addNoteAction, undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state?.ok) ref.current?.reset(); }, [state]);
  return (
    <form action={action} ref={ref} className="flex flex-col gap-2">
      <input type="hidden" name="applicationId" value={applicationId} />
      <textarea name="body" required rows={2} maxLength={2000} className={area} aria-label={t("adm.d.notes")} />
      <Button type="submit" variant="secondary" disabled={pending}>{t("adm.d.addNote")}</Button>
      <FormMessage state={state} />
    </form>
  );
}

export function RegistryForm({ applicationId, declared }: { applicationId: string; declared: Record<string, string> }) {
  const { t } = useI18n();
  const [state, action, pending] = useActionState(registryCheckAction, undefined);
  const [outcome, setOutcome] = useState<"found" | "not_found">("found");
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="applicationId" value={applicationId} />
      <div role="radiogroup" className="flex gap-2">
        {(["found", "not_found"] as const).map((o) => (
          <label key={o} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-3 text-sm ${outcome === o ? "border-brand-600 bg-brand-50 font-semibold" : "border-slate-300"}`}>
            <input type="radio" name="outcome" value={o} checked={outcome === o} onChange={() => setOutcome(o)} />{o === "found" ? t("adm.reg.found") : t("adm.reg.notFound")}</label>))}
      </div>
      {outcome === "found" && (<>
        <label className="flex flex-col gap-1 text-sm font-medium">{t("adm.reg.ref")}<input name="ref" required maxLength={120} className="min-h-11 rounded-lg border border-slate-300 px-3" /></label>
        <fieldset className="grid gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 sm:grid-cols-2"><legend className="px-1 text-sm font-semibold">{t("adm.reg.dataTitle")}</legend>
          <p className="text-xs text-amber-900 sm:col-span-2">{t("adm.reg.dataHint")}</p>
          {([["nom", "Nom", true], ["prenoms", "Prénom(s)", true], ["sexe", "Sexe (M/F)", false], ["date_naissance", "Date de naissance", true], ["heure_naissance", "Heure (HH:MM)", false], ["lieu_naissance", "Lieu de naissance", true], ["nom_pere", "Père", false], ["nom_mere", "Mère", false]] as const).map(([k, label, req]) => (
            <label key={k} className="flex flex-col gap-1 text-xs font-medium">{label}<input name={`r_${k}`} defaultValue={declared[k] ?? ""} required={req} type={k === "date_naissance" ? "date" : k === "heure_naissance" ? "time" : "text"} maxLength={200} className="min-h-11 rounded-lg border border-slate-300 bg-surface px-3 text-sm" /></label>))}
        </fieldset></>)}
      <label className="flex flex-col gap-1 text-sm font-medium">{t("adm.reg.note")}<textarea name="note" rows={2} maxLength={500} className={area} /></label>
      <Button type="submit" disabled={pending}>{t("adm.reg.save")}</Button>
      <FormMessage state={state} />
    </form>
  );
}
