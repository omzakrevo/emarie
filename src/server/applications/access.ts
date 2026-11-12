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
