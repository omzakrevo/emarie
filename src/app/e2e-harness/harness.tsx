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
const store: { saves: unknown[]; files: UploadedFile[]; payCalls: { provider: string; phone: string; key: string }[]; payOutcome: string } = { saves: [], files: [], payCalls: [], payOutcome: "PENDING" };
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
  startPayment: async (i) => { store.payCalls.push({ provider: i.provider, phone: i.phone, key: i.key }); return { ok: true, free: false, paymentId: "p1", redirectUrl: "#sandbox" }; },
  paymentStatus: async () => ({ ok: true, status: store.payOutcome as "PENDING", amountXof: 1500, receiptReady: store.payOutcome === "PAID" && (window as unknown as { __receipt?: boolean }).__receipt === true, applicationStatus: "PAYMENT_PENDING" }),
  receiptUrl: async () => ({ ok: true, url: "about:blank" }),
  submit: async (_id, data) => {
    const e = validateFields(service.fields, data);
    return Object.keys(e).length ? { ok: false, error: "validation", fieldErrors: e, missingDocuments: [] } : { ok: true, reference: "TST-2026-000001", trackingSecret: "ABCD-EFGH-JKLM" };
  },
};

export function Harness() {
  // ?pay=1 : un prestataire « sandbox » est proposé et le service a un tarif (banc d'essai uniquement)
  const withPay = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("pay") === "1";
  const svc = withPay ? { ...service, amount_xof: 1500 } : service;
  const summary = [{ code: "demo", icon: "home", name: service.name, description: service.description, amount_xof: svc.amount_xof, indicative_delay_days: null }];
  return <I18nProvider locale="fr" messages={messagesFor("fr")}><main className="p-4"><Wizard services={summary} actions={withPay ? { ...actions, start: async () => ({ ok: true, draftId: "00000000-0000-0000-0000-000000000001", service: svc, data: {}, files: [] }) } : actions} payOptions={withPay ? [{ provider: "sandbox", label: "Mode test (aucun argent réel)", available: true }, { provider: "orange_money", label: "Orange Money", available: false, reason: "non intégré" }] : []} /></main></I18nProvider>;
}
