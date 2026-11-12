"use server";
import { cookies } from "next/headers";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/env";
import { LOCALES, type Locale } from "@/i18n/messages";
import { LOCALE_COOKIE, getLocale } from "@/i18n/server";
import type { ErrorCode } from "@/features/demande/fields";
import type { FormData_, ServiceDetail, UploadedFile } from "@/features/demande/types";
import { rateLimit, clientFingerprint } from "@/server/rate-limit";
import { hashSecret, normalizeTrackingSecret, safeEqualHex } from "@/server/security/secrets";
import { getCurrentMunicipality } from "@/server/tenancy";
import { AccessError, currentUserId, resolveApplication, setDraftCookie } from "./access";
import { getServiceById, getServiceByCode } from "./catalog";
import * as ops from "./operations";

export type StartResult = { ok: true; draftId: string; service: ServiceDetail; data: FormData_; files: UploadedFile[] } | { ok: false; error: "unknown_service" | "rate_limited" | "failed" };

export async function startApplication(serviceCode: string): Promise<StartResult> {
  const m = await getCurrentMunicipality();
  if (!(await rateLimit("draft-create", await clientFingerprint(), 20, 3600))) return { ok: false, error: "rate_limited" };
  const service = await getServiceByCode(m.id, String(serviceCode).slice(0, 60));
  if (!service) return { ok: false, error: "unknown_service" };
  const svcRow = await createAdminSupabase().from("services").select("id").eq("municipality_id", m.id).eq("code", service.code).single();
  if (!svcRow.data) return { ok: false, error: "failed" };
  try {
    const { id, token } = await ops.createDraft({ municipalityId: m.id, serviceId: svcRow.data.id, profileId: await currentUserId(), locale: await getLocale() });
    if (token) await setDraftCookie(id, token);
    return { ok: true, draftId: id, service, data: {}, files: [] };
  } catch { return { ok: false, error: "failed" }; }
}

async function context(draftId: string, draftOnly = true) {
  const app = await resolveApplication(draftId, { draftOnly });
  const service = await getServiceById(app.municipality_id, app.service_id);
  if (!service) throw new AccessError("not_found");
  return { app, service };
}

export async function saveDraft(draftId: string, data: Record<string, unknown>): Promise<{ ok: boolean }> {
  try {
    const { app, service } = await context(draftId);
    if (!(await rateLimit("draft-save", draftId, 240, 3600))) return { ok: false };
    await ops.saveData(app, service, data);
    return { ok: true };
  } catch { return { ok: false }; }
}

export type SubmitActionResult =
  | { ok: true; reference: string; trackingSecret: string | null }
  | { ok: false; error: "validation" | "failed" | "rate_limited" | "locked"; fieldErrors?: Record<string, ErrorCode>; missingDocuments?: string[] };

export async function submitApplication(draftId: string, data: Record<string, unknown>): Promise<SubmitActionResult> {
  try {
    const { app, service } = await context(draftId);
    if (!(await rateLimit("submit", await clientFingerprint(), 10, 3600))) return { ok: false, error: "rate_limited" };
    const r = await ops.submit(app, service, data);
    if (r.ok) return r;
    return r.error === "validation" ? { ok: false, error: "validation", fieldErrors: r.fieldErrors, missingDocuments: r.missingDocuments } : { ok: false, error: "failed" };
  } catch (e) { return { ok: false, error: e instanceof AccessError && e.code === "locked" ? "locked" : "failed" }; }
}

// ---- Suivi invité -------------------------------------------------------------------------------------------
export interface TrackResult {
  status: string; serviceName: Record<string, string>; submittedAt: string | null;
  events: { to_status: string; created_at: string; public_note: string | null }[];
}
export type TrackState = { ok: true; result: TrackResult } | { ok: false; error: "not_found" | "rate_limited" } | undefined;
const REF_RE = /^[A-Z]{2,5}-\d{4}-\d{6}$/;

export async function trackApplication(_prev: TrackState, form: FormData): Promise<TrackState> {
  const reference = String(form.get("reference") ?? "").trim().toUpperCase();
  const secret = String(form.get("code") ?? "");
  const fp = await clientFingerprint();
  // Limites par client ET par référence : empêche l'énumération et la force brute d'un code précis.
  if (!(await rateLimit("track-ip", fp, 30, 900)) || !(await rateLimit("track-ref", reference.slice(0, 30), 10, 900))) return { ok: false, error: "rate_limited" };
  const pepper = serverEnv().TRACKING_SECRET_PEPPER;
  const supplied = hashSecret("tracking", secret, pepper);
  if (!REF_RE.test(reference) || normalizeTrackingSecret(secret).length !== 12) return { ok: false, error: "not_found" };

  const m = await getCurrentMunicipality();
  const sb = createAdminSupabase();
  const { data: app } = await sb.from("applications").select("id, status, submitted_at, tracking_secret_hash, services(name)")
    .eq("municipality_id", m.id).eq("reference", reference).maybeSingle();
  if (!app || !safeEqualHex(app.tracking_secret_hash, supplied)) return { ok: false, error: "not_found" };
  const { data: events } = await sb.from("application_events").select("to_status, created_at, public_note")
    .eq("application_id", app.id).eq("municipality_id", m.id).order("created_at");
  const svc = (app as unknown as { services: { name: Record<string, string> } | null }).services;
  return { ok: true, result: { status: app.status, serviceName: svc?.name ?? {}, submittedAt: app.submitted_at, events: events ?? [] } };
}

// ---- Langue -------------------------------------------------------------------------------------------------
export async function setLocale(locale: Locale) {
  if (!LOCALES.includes(locale)) return;
  (await cookies()).set(LOCALE_COOKIE, locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
}
