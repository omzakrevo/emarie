"use client";
import { useCallback, useEffect, useRef, useState, type TouchEvent } from "react";
import { Button } from "@/components/ui/button";
import { FieldInput } from "@/components/ui/field-input";
import { Icon } from "@/components/ui/icons";
import { useI18n } from "@/i18n/client";
import { pickLocalized, type MessageKey } from "@/i18n/messages";
import { DocumentsStep, type DocActions } from "./documents-step";
import { validateFields, visibleFields, type ErrorCode } from "./fields";
import type { FormData_, ServiceDetail, ServiceSummary, UploadedFile } from "./types";
import type { StartResult, SubmitActionResult } from "@/server/applications/actions";
import type { UploadResult } from "./upload";

export interface WizardActions {
  start(code: string): Promise<StartResult>;
  save(draftId: string, data: FormData_): Promise<{ ok: boolean }>;
  submit(draftId: string, data: FormData_): Promise<SubmitActionResult>;
  upload(draftId: string, documentKey: string, file: File): Promise<UploadResult>;
  remove(draftId: string, fileId: string): Promise<boolean>;
  fileUrl(fileId: string): string;
}
export interface WizardInitial { draftId: string; service: ServiceDetail; data: FormData_; files: UploadedFile[] }
type Step = 1 | 2 | 3 | 4 | 5 | 6 | 7;
const TOTAL = 7;
const STEP_KEYS: MessageKey[] = ["wizard.s1", "wizard.s2", "wizard.s3", "wizard.s4", "wizard.s5", "wizard.s6", "wizard.s7"];

export function Wizard({ services, initial, actions, preselect }: { services: ServiceSummary[]; initial?: WizardInitial; actions: WizardActions; preselect?: string }) {
  const { t, locale } = useI18n();
  const [step, setStep] = useState<Step>(initial ? 2 : 1);
  const [dir, setDir] = useState<"forward" | "backward">("forward");
  const [service, setService] = useState<ServiceDetail | null>(initial?.service ?? null);
  const [draftId, setDraftId] = useState<string | null>(initial?.draftId ?? null);
  const [data, setData] = useState<FormData_>(initial?.data ?? {});
  const [files, setFiles] = useState<UploadedFile[]>(initial?.files ?? []);
  const [errors, setErrors] = useState<Record<string, ErrorCode>>({});
  const [missingDocs, setMissingDocs] = useState<string[]>([]);
  const [banner, setBanner] = useState<string>("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const [busy, setBusy] = useState(Boolean(preselect && !initial));
  const [result, setResult] = useState<{ reference: string; trackingSecret: string | null } | null>(null);
  const dirty = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);

  const go = useCallback((n: Step) => { setDir(n > step ? "forward" : "backward"); setStep(n); setBanner(""); }, [step]);
  useEffect(() => { heading.current?.focus(); window.scrollTo({ top: 0 }); }, [step]);

  // Sauvegarde automatique (anti-rebond 800 ms)
  useEffect(() => {
    if (!draftId || !dirty.current || step === 7) return;
    const id = setTimeout(async () => {
      setSaveState("saving");
      const r = await actions.save(draftId, data);
      setSaveState(r.ok ? "saved" : "failed"); dirty.current = false;
    }, 800);
    return () => clearTimeout(id);
  }, [data, draftId, step, actions]);

  const flush = async () => { if (draftId && dirty.current) { dirty.current = false; await actions.save(draftId, data); } };

  function applyStart(r: StartResult) {
    setBusy(false);
    if (!r.ok) { setBanner(r.error === "rate_limited" ? t("common.tooMany") : t("common.error")); return; }
    setService(r.service); setDraftId(r.draftId); setData(r.data); setFiles(r.files);
    try { window.history.replaceState(null, "", `/demande/${r.draftId}`); } catch { /* ignoré */ }
    setDir("forward"); setStep(2); setBanner("");
  }
  function pickService(code: string) { setBusy(true); setBanner(""); void actions.start(code).then(applyStart); }
  // Service présélectionné depuis la fiche service : démarrage automatique (setState uniquement après la réponse)
  const autoStarted = useRef(false);
  useEffect(() => {
    if (!preselect || initial || autoStarted.current) return;
    autoStarted.current = true;
    void actions.start(preselect).then(applyStart);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function next() {
    if (!service) return;
    if (step === 2 || step === 3) {
      const e = validateFields(service.fields, data, step);
      setErrors(e);
      if (Object.keys(e).length) { setBanner(t("wizard.fixErrors")); requestAnimationFrame(() => (document.querySelector("[aria-invalid='true']") as HTMLElement | null)?.focus()); return; }
    }
    if (step === 4) {
      const miss = service.documents.filter((d) => d.required && !files.some((f) => f.document_key === d.key)).map((d) => d.key);
      setMissingDocs(miss);
      if (miss.length) { setBanner(t("wizard.missingDocs")); return; }
    }
    void flush(); go(Math.min(TOTAL, step + 1) as Step);
  }
  const back = () => { if (step > 2 && step < 7) go((step - 1) as Step); };

  async function submit() {
    if (!service || !draftId) return;
    setBusy(true); setBanner("");
    const r = await actions.submit(draftId, data);
    setBusy(false);
    if (r.ok) { setResult({ reference: r.reference, trackingSecret: r.trackingSecret }); go(7); return; }
    if (r.error === "validation") {
      setErrors(r.fieldErrors ?? {}); setMissingDocs(r.missingDocuments ?? []);
      const stepWithError = service.fields.find((f) => r.fieldErrors?.[f.key])?.step as Step | undefined;
      go(stepWithError ?? 4); setBanner(t("wizard.fixErrors")); return;
    }
    setBanner(r.error === "rate_limited" ? t("common.tooMany") : t("common.error"));
  }

  // Navigation au balayage (mobile) : ignorée sur les champs de saisie pour ne pas gêner la saisie/défilement.
  const touch = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: TouchEvent) => {
    const tag = (e.target as HTMLElement).closest("input,textarea,select,button,a,label");
    touch.current = tag ? null : { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const onTouchEnd = (e: TouchEvent) => {
    const s = touch.current; touch.current = null;
    if (!s || step < 2 || step > 6) return;
    const dx = e.changedTouches[0].clientX - s.x, dy = e.changedTouches[0].clientY - s.y;
    if (Math.abs(dx) < 80 || Math.abs(dx) < Math.abs(dy) * 2) return;
    if (dx < 0 && step < 6) next(); else if (dx > 0) back();
  };

  const set = (key: string, v: string) => { dirty.current = true; setData((d) => ({ ...d, [key]: v })); setErrors((e) => { const n = { ...e }; delete n[key]; return n; }); };
  const docActions: DocActions | null = draftId ? {
    upload: (k, f) => actions.upload(draftId, k, f), remove: (id) => actions.remove(draftId, id), fileUrl: actions.fileUrl,
  } : null;
  const isCivil = service?.code === "extrait_naissance";
  const progress = Math.round((step / TOTAL) * 100);

  return (
    <div className="mx-auto w-full max-w-xl overflow-x-clip" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <div className="mb-4">
        <div className="flex items-baseline justify-between text-sm">
          <span className="font-medium">{t("wizard.step", { n: step, total: TOTAL })}</span>
          <span className="text-slate-600">{t(STEP_KEYS[step - 1])}</span>
        </div>
        <div role="progressbar" aria-valuemin={1} aria-valuemax={TOTAL} aria-valuenow={step} aria-label={t("wizard.title")} className="mt-1 h-2 overflow-hidden rounded-full bg-brand-100">
          <div className="h-full rounded-full bg-accent-600 transition-all duration-300" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div key={step} className={dir === "forward" ? "step-forward" : "step-backward"} data-testid={`step-${step}`}>
        <h2 ref={heading} tabIndex={-1} className="mb-4 text-xl font-semibold text-brand-900 outline-none">
          {step === 1 ? t("wizard.chooseService") : service ? pickLocalized(service.name, locale) + " — " + t(STEP_KEYS[step - 1]) : ""}
        </h2>
        {banner && <p role="alert" className="mb-4 rounded-xl bg-amber-50 p-3 text-sm font-medium text-amber-900">{banner}</p>}

        {step === 1 && (
          <ul className="flex flex-col gap-3">
            {services.length === 0 && <li className="text-slate-600">{t("home.noServices")}</li>}
            {services.map((s) => (
              <li key={s.code}>
                <button type="button" disabled={busy} onClick={() => pickService(s.code)} className="flex min-h-16 w-full items-center gap-4 rounded-2xl border border-slate-200 bg-surface p-4 text-left shadow-sm hover:border-brand-600 disabled:opacity-60">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700"><Icon name={s.icon} /></span>
                  <span className="flex-1"><span className="block font-semibold">{pickLocalized(s.name, locale)}</span><span className="block text-sm text-slate-600">{pickLocalized(s.description, locale)}</span></span>
                  <Icon name="arrowRight" className="h-5 w-5 text-brand-700" />
                </button>
              </li>))}
          </ul>)}

        {service && (step === 2 || step === 3) && (
          <div className="flex flex-col gap-4">
            {step === 2 && isCivil && <p className="rounded-xl bg-brand-50 p-3 text-sm">{t("wizard.civilNotice")}</p>}
            {visibleFields(service.fields, data, step).length === 0 && <p className="text-slate-600">{t("wizard.noExtra")}</p>}
            {visibleFields(service.fields, data, step).map((f) => <FieldInput key={f.key} def={f} value={data[f.key] ?? ""} error={errors[f.key]} onChange={(v) => set(f.key, v)} />)}
            <p className="text-xs text-slate-500" aria-live="polite">
              {saveState === "saving" ? t("wizard.saving") : saveState === "saved" ? t("wizard.saved") : saveState === "failed" ? t("wizard.saveFailed") : t("wizard.resumeHint")}
            </p>
          </div>)}

        {service && step === 4 && docActions && <DocumentsStep docs={service.documents} files={files} onFiles={setFiles} actions={docActions} missing={missingDocs} />}

        {service && step === 5 && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-slate-600">{t("wizard.recapIntro")}</p>
            {([2, 3] as const).map((s) => (
              <section key={s} className="rounded-2xl border border-slate-200 bg-surface p-4">
                <div className="mb-2 flex items-center justify-between"><h3 className="font-semibold">{t(STEP_KEYS[s - 1])}</h3>
                  <button type="button" onClick={() => go(s)} className="min-h-12 px-2 text-sm font-semibold text-brand-700 underline">{t("wizard.edit")}</button></div>
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                  {visibleFields(service.fields, data, s).map((f) => {
                    const v = data[f.key]; const opt = f.options?.find((o) => o.value === v);
                    return <div key={f.key} className="contents"><dt className="text-slate-600">{pickLocalized(f.label, locale)}</dt><dd className="font-medium">{v ? (opt ? pickLocalized(opt.label, locale) : v) : "—"}</dd></div>;
                  })}
                </dl>
              </section>))}
            <section className="rounded-2xl border border-slate-200 bg-surface p-4">
              <div className="mb-2 flex items-center justify-between"><h3 className="font-semibold">{t("wizard.s4")}</h3>
                <button type="button" onClick={() => go(4)} className="min-h-12 px-2 text-sm font-semibold text-brand-700 underline">{t("wizard.edit")}</button></div>
              {files.length === 0 ? <p className="text-sm text-slate-600">{t("service.noDocuments")}</p> : <ul className="list-disc pl-5 text-sm">{files.map((f) => <li key={f.id}>{f.original_name}</li>)}</ul>}
            </section>
            <p className="rounded-xl bg-brand-50 p-3 text-sm">{t("wizard.declared")}</p>
          </div>)}

        {service && step === 6 && (
          <div className="flex flex-col gap-4">
            <div className="rounded-2xl border border-slate-200 bg-surface p-4">
              <p className="text-sm text-slate-600">{t("wizard.amount")}</p>
              <p className="text-2xl font-bold text-brand-900" data-testid="amount">{service.amount_xof === null ? t("service.priceTbc") : `${service.amount_xof.toLocaleString("fr-FR")} FCFA`}</p>
            </div>
            <p role="note" className="rounded-xl bg-amber-50 p-3 text-sm font-medium text-amber-900">{t("wizard.sandbox")}</p>
          </div>)}

        {step === 7 && result && (
          <div className="flex flex-col gap-4" role="status">
            <div className="flex items-center gap-3 text-accent-700"><Icon name="check" className="h-8 w-8" /><p className="text-lg font-semibold">{t("wizard.done")}</p></div>
            <div className="rounded-2xl border border-slate-200 bg-surface p-4">
              <p className="text-sm text-slate-600">{t("wizard.reference")}</p>
              <p className="text-2xl font-bold tracking-wide" data-testid="reference">{result.reference}</p>
              {result.trackingSecret && (<>
                <p className="mt-3 text-sm text-slate-600">{t("wizard.trackingCode")}</p>
                <p className="font-mono text-2xl font-bold tracking-widest" data-testid="tracking-secret">{result.trackingSecret}</p>
                <p className="mt-2 text-sm font-medium text-amber-900">{t("wizard.keepCode")}</p>
                <div className="mt-3 flex gap-2">
                  <Button variant="secondary" type="button" onClick={() => navigator.clipboard?.writeText(`${result.reference} ${result.trackingSecret}`)}>{t("common.copy")}</Button>
                  <Button variant="secondary" type="button" onClick={() => window.print()}>{t("common.print")}</Button>
                </div></>)}
            </div>
            <p className="text-sm text-slate-600">{t("wizard.receiptLater")}</p>
            <Button variant="ghost" type="button" // rechargement complet voulu : repart d'un formulaire vierge
            // eslint-disable-next-line @next/next/no-location-assign-relative-destination
            onClick={() => { window.location.href = "/demande"; }}>{t("wizard.newRequest")}</Button>
          </div>)}
      </div>

      {step >= 2 && step <= 6 && (
        <div className="sticky bottom-0 mt-6 flex gap-3 bg-background/95 py-3 backdrop-blur">
          {step > 2 && <Button variant="secondary" type="button" onClick={back} className="flex-1"><Icon name="arrowLeft" className="h-5 w-5" />{t("common.back")}</Button>}
          {step < 6 && <Button type="button" onClick={next} className="flex-1">{t("common.next")}<Icon name="arrowRight" className="h-5 w-5" /></Button>}
          {step === 6 && <Button variant="accent" type="button" disabled={busy} onClick={submit} className="flex-1">{busy ? t("common.loading") : t("common.submit")}</Button>}
        </div>)}
    </div>
  );
}
