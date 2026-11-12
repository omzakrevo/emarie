import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { rateLimit } from "@/server/rate-limit";
import { getProvider } from "./providers";
import { generateReceipt } from "./receipt";

export const MAX_WEBHOOK_BYTES = 64 * 1024;
export interface WebhookResponse { status: number; body: { result: string } }

/**
 * Traitement d'une notification de prestataire.
 * 1) limitation de débit 2) vérification d'authenticité (échec fermé) 3) enregistrement idempotent (rejeu ignoré)
 * 4) application atomique en base (montant et prestataire revérifiés) 5) quittance. Le retour navigateur ne valide JAMAIS un paiement.
 */
export async function handleWebhook(providerId: string, rawBody: string, headers: Headers, clientFp: string): Promise<WebhookResponse> {
  const provider = getProvider(providerId);
  if (!provider) return { status: 404, body: { result: "unknown_provider" } };
  if (rawBody.length > MAX_WEBHOOK_BYTES) return { status: 413, body: { result: "too_large" } };
  if (!(await rateLimit("webhook", `${providerId}:${clientFp}`, 120, 60))) return { status: 429, body: { result: "rate_limited" } };

  const admin = createAdminSupabase();
  const event = provider.verifyWebhook(rawBody, headers);
  if (!event) {
    if (await rateLimit("webhook-invalid", `${providerId}:${clientFp}`, 20, 600)) await admin.rpc("record_webhook", { p_provider: providerId, p_event_id: "invalid", p_payload: { size: rawBody.length }, p_valid: false });
    return { status: 401, body: { result: "invalid_signature" } };           // le contenu d'une notification non authentique n'est jamais conservé
  }
  const { data: hookId, error: he } = await admin.rpc("record_webhook", { p_provider: providerId, p_event_id: event.eventId, p_payload: JSON.parse(rawBody), p_valid: true });
  if (he) return { status: 500, body: { result: "error" } };
  if (!hookId) return { status: 200, body: { result: "duplicate" } };

  const { data: outcome, error } = await admin.rpc("apply_payment_result", {
    p_payment: event.paymentId, p_provider: providerId, p_status: event.status, p_provider_reference: event.providerReference, p_amount_xof: event.amountXof,
  });
  if (error) { await admin.rpc("mark_webhook_processed", { p_id: hookId, p_result: "unknown_payment_or_invalid" }); return { status: 200, body: { result: "ignored" } }; }
  if (outcome === "paid") { try { await generateReceipt(event.paymentId); } catch { /* rattrapé par la réconciliation */ } }
  await admin.rpc("mark_webhook_processed", { p_id: hookId, p_result: String(outcome) });
  return { status: 200, body: { result: String(outcome) } };
}
