import "server-only";
import { randomUUID, createHash } from "node:crypto";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/env";
import { sanitizeData, validateFields, type ErrorCode } from "@/features/demande/fields";
import type { FormData_, ServiceDetail, UploadedFile } from "@/features/demande/types";
import { EXT, safeDisplayName, sniffMime } from "@/server/files/sniff";
import { generateDraftToken, generateTrackingSecret, hashSecret } from "@/server/security/secrets";
import type { ApplicationRow } from "./access";

export const BUCKET = "application-files";
export const MAX_FILES_PER_DOCUMENT = 3;
export const MAX_FILES_TOTAL = 12;
const HOSTING_MAX_BYTES = 4 * 1024 * 1024; // plafond prudent (limite de corps des fonctions serverless ≈ 4,5 Mo)

export async function createDraft(args: { municipalityId: string; serviceId: string; profileId: string | null; locale: "fr" | "dyu" }) {
  const token = args.profileId ? null : generateDraftToken();
  const { data, error } = await createAdminSupabase().from("applications").insert({
    municipality_id: args.municipalityId, service_id: args.serviceId, profile_id: args.profileId, locale: args.locale,
    draft_token_hash: token ? hashSecret("draft", token, serverEnv().TRACKING_SECRET_PEPPER) : null,
  }).select("id").single();
  if (error || !data) throw new Error("draft_create_failed");
  return { id: data.id as string, token };
}

export async function loadData(app: ApplicationRow): Promise<FormData_> {
  const { data } = await createAdminSupabase().from("application_data").select("data").eq("application_id", app.id).eq("municipality_id", app.municipality_id).maybeSingle();
  return (data?.data ?? {}) as FormData_;
}
export async function saveData(app: ApplicationRow, service: ServiceDetail, input: Record<string, unknown>): Promise<FormData_> {
  const data = sanitizeData(service.fields, input);
  const { error } = await createAdminSupabase().from("application_data")
    .upsert({ application_id: app.id, municipality_id: app.municipality_id, data, updated_at: new Date().toISOString() });
  if (error) throw new Error("save_failed");
  return data;
}

export async function listFiles(app: ApplicationRow): Promise<UploadedFile[]> {
  const { data } = await createAdminSupabase().from("application_files")
    .select("id, document_key, original_name, mime_type, size_bytes").eq("application_id", app.id).eq("municipality_id", app.municipality_id).order("created_at");
  return (data ?? []) as UploadedFile[];
}

export type UploadError = "unknown_document" | "too_many" | "too_big" | "bad_type" | "empty" | "storage_failed";
export async function addFile(app: ApplicationRow, service: ServiceDetail, documentKey: string, file: File):
  Promise<{ ok: true; file: UploadedFile } | { ok: false; error: UploadError }> {
  const doc = service.documents.find((d) => d.key === documentKey);
  if (!doc) return { ok: false, error: "unknown_document" };
  const existing = await listFiles(app);
  if (existing.length >= MAX_FILES_TOTAL || existing.filter((f) => f.document_key === documentKey).length >= MAX_FILES_PER_DOCUMENT)
    return { ok: false, error: "too_many" };
  const limit = Math.min(doc.max_size_kb * 1024, HOSTING_MAX_BYTES);
  if (file.size === 0) return { ok: false, error: "empty" };
  if (file.size > limit) return { ok: false, error: "too_big" };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = sniffMime(bytes);
  if (!mime) return { ok: false, error: "bad_type" };

  const path = `${app.municipality_id}/${app.id}/${randomUUID()}.${EXT[mime]}`;
  const sb = createAdminSupabase();
  const up = await sb.storage.from(BUCKET).upload(path, bytes, { contentType: mime, upsert: false });
  if (up.error) return { ok: false, error: "storage_failed" };
  const { data, error } = await sb.from("application_files").insert({
    municipality_id: app.municipality_id, application_id: app.id, document_key: documentKey, storage_path: path,
    original_name: safeDisplayName(file.name), mime_type: mime, size_bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  }).select("id, document_key, original_name, mime_type, size_bytes").single();
  if (error || !data) { await sb.storage.from(BUCKET).remove([path]); return { ok: false, error: "storage_failed" }; }
  return { ok: true, file: data as UploadedFile };
}

export async function removeFile(app: ApplicationRow, fileId: string): Promise<boolean> {
  const sb = createAdminSupabase();
  const { data } = await sb.from("application_files").select("id, storage_path")
    .eq("id", fileId).eq("application_id", app.id).eq("municipality_id", app.municipality_id).maybeSingle();
  if (!data) return false;
  await sb.storage.from(BUCKET).remove([data.storage_path]);
  await sb.from("application_files").delete().eq("id", fileId);
  return true;
}

export type SubmitResult =
  | { ok: true; reference: string; trackingSecret: string | null }
  | { ok: false; error: "validation"; fieldErrors: Record<string, ErrorCode>; missingDocuments: string[] }
  | { ok: false; error: "failed" };

/** Revalide TOUT côté serveur (champs visibles, justificatifs obligatoires), puis soumet via la fonction SQL atomique. */
export async function submit(app: ApplicationRow, service: ServiceDetail, input: Record<string, unknown>): Promise<SubmitResult> {
  const data = await saveData(app, service, input);
  const fieldErrors = validateFields(service.fields, data);
  const files = await listFiles(app);
  const missingDocuments = service.documents.filter((d) => d.required && !files.some((f) => f.document_key === d.key)).map((d) => d.key);
  if (Object.keys(fieldErrors).length || missingDocuments.length) return { ok: false, error: "validation", fieldErrors, missingDocuments };

  const sb = createAdminSupabase();
  const secret = app.profile_id ? null : generateTrackingSecret();
  if (data.telephone) await sb.from("applications").update({ contact_phone: data.telephone }).eq("id", app.id);
  const { data: ref, error } = await sb.rpc("submit_application", {
    p_id: app.id, p_secret_hash: secret ? hashSecret("tracking", secret, serverEnv().TRACKING_SECRET_PEPPER) : null,
  });
  if (error || typeof ref !== "string") return { ok: false, error: "failed" };
  return { ok: true, reference: ref, trackingSecret: secret };
}
