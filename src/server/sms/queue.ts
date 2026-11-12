import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { normalizePhone } from "@/features/demande/fields";
import { getSmsProvider } from "./provider";

/** Traite la file SMS. En mode live sans fournisseur : rien n'est réservé, rien n'est marqué envoyé. */
export async function processSmsQueue(limit = 20): Promise<{ processed: number; skipped?: string }> {
  const provider = getSmsProvider();
  if (!provider) return { processed: 0, skipped: "no_provider_in_live_mode" };
  const admin = createAdminSupabase();
  const { data, error } = await admin.rpc("claim_notifications", { p_limit: limit });
  if (error || !data) return { processed: 0, skipped: "claim_failed" };
  let n = 0;
  for (const row of data as { id: string; to_phone: string; body: string }[]) {
    const phone = normalizePhone(row.to_phone);
    let res: { ok: boolean; providerMessageId?: string; error?: string };
    try { res = phone ? await provider.send(phone, row.body) : { ok: false, error: "invalid_phone" }; } catch { res = { ok: false, error: "exception" }; }
    await admin.rpc("complete_notification", { p_id: row.id, p_ok: res.ok, p_test: provider.isTest, p_provider: provider.id, p_message_id: res.providerMessageId ?? null, p_error: res.error ?? null });
    n++;
  }
  return { processed: n };
}
