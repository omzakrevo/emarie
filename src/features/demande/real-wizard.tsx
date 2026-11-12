"use client";
import { saveDraft, startApplication, submitApplication } from "@/server/applications/actions";
import { paymentStatusAction, receiptUrlAction, startPaymentAction } from "@/server/payments/actions";
import { httpRemove, httpUpload } from "./upload";
import type { PayOption } from "@/features/payments/types";
import { Wizard, type WizardActions, type WizardInitial } from "./wizard";
import type { ServiceSummary } from "./types";

const actions: WizardActions = {
  start: startApplication, save: saveDraft, submit: submitApplication,
  upload: httpUpload, remove: httpRemove, fileUrl: (id) => `/api/files/${id}`,
  startPayment: startPaymentAction, paymentStatus: paymentStatusAction, receiptUrl: receiptUrlAction,
};
export function RealWizard(props: { services: ServiceSummary[]; initial?: WizardInitial; preselect?: string; payOptions?: PayOption[] }) {
  return <Wizard {...props} actions={actions} />;
}
