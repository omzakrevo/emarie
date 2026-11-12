"use client";
import { useActionState, useState } from "react";
import { FormMessage } from "@/components/admin/form-message";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/client";
import type { EditorValues } from "@/features/documents/form";
import { createDraftAction, deleteDraftAction, previewTemplateAction, publishVersionAction, saveDraftAction, type TemplateState } from "@/server/documents/template-actions";

const input = "min-h-11 w-full rounded-lg border border-slate-300 bg-surface px-3 text-sm";
const L = ({ children }: { children: React.ReactNode }) => <label className="flex flex-col gap-1 text-sm font-medium">{children}</label>;

function Details({ state }: { state: TemplateState }) {
  const { t } = useI18n();
  if (!state?.details?.length) return null;
  return <div role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800"><p className="font-semibold">{t("adm.tpl.errors")}</p><ul className="list-disc pl-5">{state.details.map((d, i) => <li key={i}>{d}</li>)}</ul></div>;
}

export function CreateDraftForm({ fromVersionId }: { fromVersionId: string }) {
  const { t } = useI18n(); const [s, action, pending] = useActionState(createDraftAction, undefined);
  return <form action={action}><input type="hidden" name="fromVersionId" value={fromVersionId} /><Button variant="secondary" disabled={pending}>{t("adm.tpl.newDraft")}</Button><FormMessage state={s} /></form>;
}

export function PublishForm({ versionId }: { versionId: string }) {
  const { t } = useI18n(); const [s, action, pending] = useActionState(publishVersionAction, undefined);
  return (<form action={action} className="flex flex-col gap-2 rounded-xl border border-slate-200 p-3"><input type="hidden" name="versionId" value={versionId} />
    <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="official" className="mt-1 h-5 w-5" />{t("adm.tpl.officialConfirm")}</label>
    <Button variant="accent" disabled={pending}>{t("adm.tpl.publish")}</Button><FormMessage state={s} /></form>);
}

export function DeleteDraftForm({ versionId }: { versionId: string }) {
  const { t } = useI18n(); const [s, action, pending] = useActionState(deleteDraftAction, undefined);
  return <form action={action}><input type="hidden" name="versionId" value={versionId} /><Button variant="ghost" className="text-red-700" disabled={pending}>{t("adm.tpl.deleteDraft")}</Button><FormMessage state={s} /></form>;
}

export function Editor({ versionId, v, placeholders, readOnly }: { versionId: string; v: EditorValues; placeholders: string[]; readOnly: boolean }) {
  const { t } = useI18n();
  const [saved, saveAction, saving] = useActionState(saveDraftAction, undefined);
  const [prev, previewAction, previewing] = useActionState(previewTemplateAction, undefined);
  const [font, setFont] = useState(v.font);
  const d = readOnly;
  return (
    <form className="flex flex-col gap-4 rounded-2xl bg-surface p-5 shadow-sm"><input type="hidden" name="versionId" value={versionId} />
      {d && <p className="rounded-xl bg-slate-100 p-3 text-sm">{t("adm.tpl.readOnly")}</p>}
      <p className="text-xs text-slate-600"><strong>{t("adm.tpl.fields")} :</strong> {placeholders.map((p) => <code key={p} className="mr-1 rounded bg-slate-100 px-1">{`{{${p}}}`}</code>)}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <L>{t("adm.tpl.f.title")}<input name="title" defaultValue={v.title} disabled={d} required className={input} /></L>
        <L>{t("adm.tpl.f.mention")}<input name="mention" defaultValue={v.mention} disabled={d} className={input} /></L>
        <L>{t("adm.tpl.f.reference")}<input name="reference_line" defaultValue={v.reference_line} disabled={d} className={input} /></L>
        <label className="flex min-h-11 items-center gap-2 text-sm font-medium"><input type="checkbox" name="show_logo" defaultChecked={v.show_logo} disabled={d} className="h-5 w-5" />{t("adm.tpl.f.showLogo")}</label>
        <L>{t("adm.tpl.f.headerLeft")}<textarea name="header_left" rows={4} defaultValue={v.header_left} disabled={d} className={input} /></L>
        <L>{t("adm.tpl.f.headerRight")}<textarea name="header_right" rows={4} defaultValue={v.header_right} disabled={d} className={input} /></L>
      </div>
      <L>{t("adm.tpl.f.intro")}<textarea name="intro" rows={3} defaultValue={v.intro} disabled={d} className={input} /></L>
      <L>{t("adm.tpl.f.rows")}<textarea name="rows" rows={9} defaultValue={v.rows} disabled={d} className={input + " font-mono"} /></L>
      <div className="grid gap-3 sm:grid-cols-2"><L>{t("adm.tpl.f.closing")}<textarea name="closing_text" rows={2} defaultValue={v.closing_text} disabled={d} className={input} /></L>
        <L>{t("adm.tpl.f.placeDate")}<input name="place_date" defaultValue={v.place_date} disabled={d} className={input} /></L></div>
      <fieldset className="grid gap-3 sm:grid-cols-4"><legend className="text-sm font-medium">{t("adm.tpl.f.margins")}</legend>
        {(["top", "right", "bottom", "left"] as const).map((k) => <input key={k} name={`margin_${k}`} type="number" min={5} max={40} step="0.5" defaultValue={v[`margin_${k}` as const]} disabled={d} aria-label={k} className={input} />)}</fieldset>
      <div className="grid gap-3 sm:grid-cols-2"><L>{t("adm.tpl.f.font")}<select name="font" value={font} onChange={(e) => setFont(e.target.value as "serif" | "sans")} disabled={d} className={input}><option value="serif">Serif</option><option value="sans">Sans</option></select></L>
        <L>{t("adm.tpl.f.size")}<input name="size_pt" type="number" min={9} max={14} step="0.5" defaultValue={v.size_pt} disabled={d} className={input} /></L></div>
      <div className="grid gap-3 sm:grid-cols-2"><L>{t("adm.tpl.f.signTitle")}<input name="title_line" defaultValue={v.title_line} disabled={d} className={input} /></L><L>{t("adm.tpl.f.taxLabel")}<input name="tax_stamp_label" defaultValue={v.tax_stamp_label} disabled={d} className={input} /></L>
        <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" name="show_signature_box" defaultChecked={v.show_signature_box} disabled={d} className="h-5 w-5" />{t("adm.tpl.f.sigBox")}</label>
        <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" name="show_stamp_box" defaultChecked={v.show_stamp_box} disabled={d} className="h-5 w-5" />{t("adm.tpl.f.stampBox")}</label>
        <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" name="show_tax_stamp_box" defaultChecked={v.show_tax_stamp_box} disabled={d} className="h-5 w-5" />{t("adm.tpl.f.taxBox")}</label></div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" formAction={previewAction} variant="secondary" disabled={previewing}>{previewing ? t("common.loading") : t("adm.tpl.preview")}</Button>
        {!d && <Button type="submit" formAction={saveAction} disabled={saving}>{t("adm.tpl.save")}</Button>}</div>
      <FormMessage state={saved} /><Details state={saved} /><FormMessage state={prev} /><Details state={prev} />
      {prev?.pdf && <iframe title="Prévisualisation" src={`data:application/pdf;base64,${prev.pdf}`} className="h-[70vh] w-full rounded-xl border border-slate-300" />}
    </form>
  );
}
