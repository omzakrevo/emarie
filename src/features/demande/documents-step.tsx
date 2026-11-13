"use client";
import { useState } from "react";
import { Icon } from "@/components/ui/icons";
import { useI18n } from "@/i18n/client";
import { pickLocalized } from "@/i18n/messages";
import { prepareFile, type UploadResult } from "./upload";
import type { DocumentDef, UploadedFile } from "./types";

export interface DocActions {
  upload(documentKey: string, file: File): Promise<UploadResult>;
  remove(fileId: string): Promise<boolean>;
  fileUrl(fileId: string): string;
}

export function DocumentsStep({ docs, files, onFiles, actions, missing }: {
  docs: DocumentDef[]; files: UploadedFile[]; onFiles: (f: UploadedFile[]) => void; actions: DocActions; missing: string[];
}) {
  const { t, locale } = useI18n();
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [previews, setPreviews] = useState<Record<string, string>>({});

  if (docs.length === 0) return <p className="rounded-xl bg-brand-50 p-4 text-sm">{t("service.noDocuments")}</p>;

  async function handle(doc: DocumentDef, picked: File | undefined) {
    if (!picked) return;
    setErrors((e) => ({ ...e, [doc.key]: "" }));
    setBusy(doc.key);
    const file = await prepareFile(picked);
    if (file.size > doc.max_size_kb * 1024) { setErrors((e) => ({ ...e, [doc.key]: t("upload.tooBig") })); setBusy(null); return; }
    const r = await actions.upload(doc.key, file);
    setBusy(null);
    if (!r.ok) { setErrors((e) => ({ ...e, [doc.key]: r.error === "bad_type" ? t("upload.badType") : r.error === "too_big" ? t("upload.tooBig") : t("upload.failed") })); return; }
    if (file.type.startsWith("image/")) setPreviews((p) => ({ ...p, [r.file.id]: URL.createObjectURL(file) }));
    onFiles([...files, r.file]);
  }
  async function remove(f: UploadedFile) {
    if (await actions.remove(f.id)) {
      const url = previews[f.id]; if (url) URL.revokeObjectURL(url);
      onFiles(files.filter((x) => x.id !== f.id));
    } else setErrors((e) => ({ ...e, [f.document_key]: t("upload.failed") }));
  }

  return (
    <div className="flex flex-col gap-5">
      {docs.map((doc) => {
        const mine = files.filter((f) => f.document_key === doc.key);
        const isMissing = missing.includes(doc.key);
        return (
          <section key={doc.key} aria-labelledby={`doc-${doc.key}`} className={`rounded-2xl border p-4 ${isMissing ? "border-red-400 bg-red-50" : "border-slate-200 bg-surface"}`}>
            <h3 id={`doc-${doc.key}`} className="font-semibold">
              {pickLocalized(doc.label, locale)} <span className="text-sm font-normal text-slate-600">({doc.required ? t("common.required") : t("common.optional")})</span>
            </h3>
            <p className="text-sm text-slate-600">{t("upload.hint", { max: (doc.max_size_kb / 1024).toFixed(0) })}</p>
            {isMissing && <p role="alert" className="mt-1 text-sm font-medium text-red-700">{t("upload.missing")}</p>}
            <ul className="mt-3 flex flex-col gap-2">
              {mine.map((f) => {
                const src = previews[f.id] ?? actions.fileUrl(f.id);
                return (
                  <li key={f.id} className="flex items-center gap-3 rounded-xl border border-slate-200 p-2">
                    {f.mime_type.startsWith("image/")
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={src} alt={f.original_name} className="h-14 w-14 rounded-lg object-cover" />
                      : <a href={src} target="_blank" rel="noreferrer" aria-label={f.original_name} className="flex h-14 w-14 items-center justify-center rounded-lg bg-brand-50 text-brand-700"><Icon name="file-text" /></a>}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{f.original_name}</p>
                      <p className="text-xs text-slate-600">{(f.size_bytes / 1024).toFixed(0)} Ko</p>
                    </div>
                    <button type="button" onClick={() => remove(f)} className="flex min-h-12 min-w-12 items-center justify-center rounded-lg text-red-700 hover:bg-red-50" aria-label={`${t("common.delete")} ${f.original_name}`}>
                      <Icon name="trash" />
                    </button>
                  </li>);
              })}
            </ul>
            <div className="mt-3 flex flex-wrap gap-2">
              <label className="contents">
                <input type="file" accept="image/*" capture="environment" className="sr-only" data-testid={`camera-${doc.key}`}
                  onChange={(e) => { void handle(doc, e.target.files?.[0]); e.target.value = ""; }} />
                <span role="button" tabIndex={0} className="inline-flex min-h-12 cursor-pointer items-center gap-2 rounded-xl border border-brand-600 px-4 font-semibold text-brand-700 hover:bg-brand-50"
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") (e.currentTarget.previousElementSibling as HTMLInputElement).click(); }}>
                  <Icon name="camera" className="h-5 w-5" />{t("upload.camera")}
                </span>
              </label>
              <label className="contents">
                <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="sr-only" data-testid={`file-${doc.key}`}
                  onChange={(e) => { void handle(doc, e.target.files?.[0]); e.target.value = ""; }} />
                <span role="button" tabIndex={0} className="inline-flex min-h-12 cursor-pointer items-center gap-2 rounded-xl border border-brand-600 px-4 font-semibold text-brand-700 hover:bg-brand-50"
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") (e.currentTarget.previousElementSibling as HTMLInputElement).click(); }}>
                  <Icon name="upload" className="h-5 w-5" />{mine.length ? t("common.replace") + " / +" : t("upload.choose")}
                </span>
              </label>
              {busy === doc.key && <span role="status" className="self-center text-sm text-slate-600">{t("upload.uploading")}</span>}
            </div>
            {errors[doc.key] && <p role="alert" className="mt-2 text-sm font-medium text-red-700">{errors[doc.key]}</p>}
          </section>);
      })}
    </div>
  );
}
