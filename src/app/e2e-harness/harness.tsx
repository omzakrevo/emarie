"use client";
import { I18nProvider } from "@/i18n/client";
import { messagesFor } from "@/i18n/messages";
import { Wizard, type WizardActions } from "@/features/demande/wizard";
import { validateFields } from "@/features/demande/fields";
import type { ServiceDetail, UploadedFile } from "@/features/demande/types";

const service: ServiceDetail = {
  code: "demo", icon: "home", name: { fr: "Service de démonstration" }, description: { fr: "Données fictives" }, procedure: {},
  amount_xof: null, indicative_delay_days: null,
  fields: [
    { key: "nom", label: { fr: "Nom" }, type: "text", required: true, step: 2, sort_order: 1 },
    { key: "date_naissance", label: { fr: "Date de naissance" }, type: "date", required: true, step: 2, sort_order: 2 },
    { key: "telephone", label: { fr: "Téléphone" }, type: "phone", required: true, step: 2, sort_order: 3 },
    { key: "qualite", label: { fr: "Qualité" }, type: "select", required: true, step: 3, sort_order: 1, options: [{ value: "lui_meme", label: { fr: "Moi-même" } }, { value: "parent", label: { fr: "Un parent" } }] },
    { key: "nom_demandeur", label: { fr: "Nom du demandeur" }, type: "text", required: true, step: 3, sort_order: 2, visible_if: { field: "qualite", op: "eq", value: "parent" } },
  ],
  documents: [{ key: "piece", label: { fr: "Pièce d'identité (exemple)" }, required: true, max_size_kb: 5120, sort_order: 1 }],
};
const store: { saves: unknown[]; files: UploadedFile[] } = { saves: [], files: [] };
if (typeof window !== "undefined") (window as unknown as { __store: typeof store }).__store = store;

const actions: WizardActions = {
  start: async () => ({ ok: true, draftId: "00000000-0000-0000-0000-000000000001", service, data: {}, files: [] }),
  save: async (_id, data) => { store.saves.push(data); return { ok: true }; },
  upload: async (_id, key, file) => {
    const f = { id: crypto.randomUUID(), document_key: key, original_name: file.name, mime_type: file.type, size_bytes: file.size };
    store.files.push(f); return { ok: true, file: f };
  },
  remove: async (_id, fid) => { store.files = store.files.filter((f) => f.id !== fid); return true; },
  fileUrl: () => "#",
  submit: async (_id, data) => {
    const e = validateFields(service.fields, data);
    return Object.keys(e).length ? { ok: false, error: "validation", fieldErrors: e, missingDocuments: [] } : { ok: true, reference: "TST-2026-000001", trackingSecret: "ABCD-EFGH-JKLM" };
  },
};

export function Harness() {
  const summary = [{ code: "demo", icon: "home", name: service.name, description: service.description, amount_xof: null, indicative_delay_days: null }];
  return <I18nProvider locale="fr" messages={messagesFor("fr")}><main className="p-4"><Wizard services={summary} actions={actions} /></main></I18nProvider>;
}
