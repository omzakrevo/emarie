import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { normalizePhone } from "@/features/demande/fields";
import type { PayOption, PayStatus, ProviderId } from "@/features/payments/types";
import type { ApplicationRow } from "@/server/applications/access";
import { describeOption, getProvider, paymentMode, ProviderNotIntegrated } from "./providers";

/** Prestataires ACTIVÉS par la commune ET réellement utilisables sur ce serveur. */
export async function listPayOptions(municipalityId: string): Promise<PayOption[]> {
  const { data } = await createAdminSupabase().from("payment_provider_configs").select("provider").eq("municipality_id", municipalityId).eq("enabled", true);
  return (data ?? []).map((r) => describeOption(r.provider as ProviderId));
}

export type StartError = "provider_unavailable" | "invalid_phone" | "price_unknown" | "payment_in_progress" | "not_payable" | "provider_error";
export type StartResult = { ok: true; free: boolean; paymentId?: string; redirectUrl?: string; reused?: boolean } | { ok: false; error: StartError };

const mapDbError = (msg: string): StartError =>
  msg.includes("price_unknown") ? "price_unknown" : msg.includes("payment_in_progress") ? "payment_in_progress" : msg.includes("provider_disabled") ? "provider_unavailable" : "not_payable";

export async function startPayment(i: { app: ApplicationRow; provider: string; phone: string; key: string; origin: string }): Promise<StartResult> {
  const provider = getProvider(i.provider);
  if (!provider || !provider.availability().available) return { ok: false, error: "provider_unavailable" };
  const phone = normalizePhone(i.phone); if (!phone) return { ok: false, error: "invalid_phone" };
  const admin = createAdminSupabase();
  const { data, error } = await admin.rpc("initiate_payment", { p_application: i.app.id, p_provider: provider.id, p_payer_phone: phone, p_idempotency_key: i.key, p_mode: paymentMode() });
  if (error) return { ok: false, error: mapDbError(error.message) };
  const r = data as { free: boolean; payment_id?: string; amount_xof: number; status?: string; reused?: boolean };
  if (r.free) return { ok: true, free: true };
  if (r.reused) return { ok: true, free: false, paymentId: r.payment_id, reused: true };
  try {
    const init = await provider.initiate({ paymentId: r.payment_id!, reference: i.app.reference!, amountXof: r.amount_xof, payerPhone: phone, origin: i.origin });
    const { error: e2 } = await admin.rpc("mark_payment_pending", { p_payment: r.payment_id, p_provider_reference: init.providerReference });
    if (e2) throw new Error("mark_pending_failed");
    return { ok: true, free: false, paymentId: r.payment_id, redirectUrl: init.redirectUrl };
  } catch (e) {
    await admin.rpc("fail_payment_creation", { p_payment: r.payment_id, p_reason: e instanceof ProviderNotIntegrated ? "provider_not_integrated" : "provider_error" });
    return { ok: false, error: "provider_error" };
  }
}

export async function paymentStatus(app: ApplicationRow): Promise<{ status: PayStatus; amountXof: number | null; receiptReady: boolean; applicationStatus: string }> {
  const admin = createAdminSupabase();
  const { data: p } = await admin.from("payments").select("id, status, amount_xof").eq("application_id", app.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
  let receiptReady = false;
  if (p) { const { data: r } = await admin.from("receipts").select("pdf_sha256").eq("payment_id", p.id).maybeSingle(); receiptReady = !!r?.pdf_sha256; }
  const { data: a } = await admin.from("applications").select("status").eq("id", app.id).single();
  return { status: (p?.status as PayStatus) ?? "NONE", amountXof: p?.amount_xof ?? null, receiptReady, applicationStatus: a?.status ?? app.status };
}

export async function receiptSignedUrl(app: ApplicationRow): Promise<string | null> {
  const admin = createAdminSupabase();
  const { data: r } = await admin.from("receipts").select("pdf_path, pdf_sha256").eq("application_id", app.id).eq("municipality_id", app.municipality_id).order("issued_at", { ascending: false }).limit(1).maybeSingle();
  if (!r?.pdf_path || !r.pdf_sha256) return null;
  const { data } = await admin.storage.from("receipts").createSignedUrl(r.pdf_path, 60);
  return data?.signedUrl ?? null;
}
