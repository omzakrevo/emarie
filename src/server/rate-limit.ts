import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { createAdminSupabase } from "@/lib/supabase/admin";

/** Empreinte (non réversible) de l'IP cliente. Derrière un proxy de confiance (Vercel/Netlify), x-forwarded-for est fiable. */
export async function clientFingerprint(): Promise<string> {
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || "unknown";
  return createHash("sha256").update(ip).digest("hex").slice(0, 16);
}

/** true = autorisé. En cas d'erreur de la base : REFUS (fail-closed). */
export async function rateLimit(bucket: string, id: string, max: number, windowSeconds: number): Promise<boolean> {
  const { data, error } = await createAdminSupabase().rpc("rate_limit_hit", {
    p_key: `${bucket}:${id}`, p_max: max, p_window_seconds: windowSeconds,
  });
  return !error && data === true;
}
