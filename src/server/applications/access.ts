import "server-only";
import { cookies } from "next/headers";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { createServerSupabase } from "@/lib/supabase/server";
import { serverEnv } from "@/lib/env";
import { hashSecret, safeEqualHex } from "@/server/security/secrets";
import { getCurrentMunicipality } from "@/server/tenancy";

export class AccessError extends Error { constructor(public code: "not_found" | "forbidden" | "locked") { super(code); } }

export interface ApplicationRow {
  id: string; municipality_id: string; service_id: string; reference: string | null; status: string;
  profile_id: string | null; draft_token_hash: string | null; locale: "fr" | "dyu";
}
const draftCookie = (id: string) => `emd_${id}`;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function setDraftCookie(id: string, token: string) {
  (await cookies()).set(draftCookie(id), token, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 30,
  });
}
export async function currentUserId(): Promise<string | null> {
  const { data } = await (await createServerSupabase()).auth.getUser();
  return data.user?.id ?? null;
}

/**
 * Seul point d'entrée pour agir sur une demande côté citoyen/invité.
 * Vérifie : commune courante, propriété (compte connecté OU jeton de brouillon), et statut DRAFT si `draftOnly`.
 */
export async function resolveApplication(id: string, opts: { draftOnly: boolean }): Promise<ApplicationRow> {
  if (!UUID.test(id)) throw new AccessError("not_found");
  const m = await getCurrentMunicipality();
  const { data } = await createAdminSupabase()
    .from("applications")
    .select("id, municipality_id, service_id, reference, status, profile_id, draft_token_hash, locale")
    .eq("id", id).eq("municipality_id", m.id).maybeSingle();
  if (!data) throw new AccessError("not_found");
  const app = data as ApplicationRow;

  let owner = false;
  if (app.profile_id) {
    owner = (await currentUserId()) === app.profile_id;
  } else if (app.draft_token_hash) {
    const token = (await cookies()).get(draftCookie(id))?.value;
    owner = !!token && safeEqualHex(app.draft_token_hash, hashSecret("draft", token, serverEnv().TRACKING_SECRET_PEPPER));
  }
  if (!owner) throw new AccessError("not_found"); // 404 et non 403 : on ne révèle pas l'existence
  if (opts.draftOnly && app.status !== "DRAFT") throw new AccessError("locked");
  return app;
}

const REF_RE = /^[A-Z]{2,5}-\d{4}-\d{6}$/;
/**
 * Accès d'un citoyen à une demande DÉPOSÉE : compte connecté propriétaire, OU référence + code de suivi (invité).
 * Limitation de débit par client et par référence ; null = introuvable ou refusé (réponse indifférenciée).
 */
export async function authenticateByReference(referenceRaw: string, secret: string | null): Promise<ApplicationRow | null> {
  const { clientFingerprint, rateLimit } = await import("@/server/rate-limit");
  const { normalizeTrackingSecret } = await import("@/server/security/secrets");
  const reference = referenceRaw.trim().toUpperCase();
  if (!REF_RE.test(reference)) return null;
  const m = await getCurrentMunicipality();
  const { data } = await createAdminSupabase().from("applications")
    .select("id, municipality_id, service_id, reference, status, profile_id, draft_token_hash, locale, tracking_secret_hash")
    .eq("municipality_id", m.id).eq("reference", reference).maybeSingle();
  if (data?.profile_id && (await currentUserId()) === data.profile_id) return data as ApplicationRow;
  if (!secret || normalizeTrackingSecret(secret).length !== 12) return null;
  const fp = await clientFingerprint();
  if (!(await rateLimit("track-ip", fp, 60, 900)) || !(await rateLimit("track-ref", reference, 20, 900))) return null;
  const supplied = hashSecret("tracking", secret, serverEnv().TRACKING_SECRET_PEPPER);
  return data && safeEqualHex((data as { tracking_secret_hash: string | null }).tracking_secret_hash, supplied) ? (data as ApplicationRow) : null;
}
