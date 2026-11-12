"use client";
import { saveDraft, startApplication, submitApplication } from "@/server/applications/actions";
import { httpRemove, httpUpload } from "./upload";
import { Wizard, type WizardActions, type WizardInitial } from "./wizard";
import type { ServiceSummary } from "./types";

const actions: WizardActions = {
  start: startApplication, save: saveDraft, submit: submitApplication,
  upload: httpUpload, remove: httpRemove, fileUrl: (id) => `/api/files/${id}`,
};
export function RealWizard(props: { services: ServiceSummary[]; initial?: WizardInitial; preselect?: string }) {
  return <Wizard {...props} actions={actions} />;
}
