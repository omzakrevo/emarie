"use server";
import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { z } from "zod";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { signSandbox } from "@/features/payments/sandbox";
import { paymentMode } from "./providers";

/**
 * Banc d'essai du circuit de paiement (mode sandbox UNIQUEMENT). Il émet un vrai webhook SIGNÉ vers /api/payments/webhooks/sandbox :
 * le même chemin de vérification que celui d'un prestataire réel est exercé. Aucun argent ne circule.
 */
export async function sandboxDecideAction(paymentId: string, outcome: "PAID" | "FAILED" | "CANCELLED" | "WRONG_AMOUNT"): Promise<{ ok: boolean; result?: string }> {
  if (paymentMode() !== "sandbox" || !z.string().uuid().safeParse(paymentId).success) return { ok: false };
  const secret = process.env.SANDBOX_WEBHOOK_SECRET ?? ""; if (secret.length < 32) return { ok: false };
  const { data: p } = await createAdminSupabase().from("payments").select("id, provider, status, amount_xof, provider_reference").eq("id", paymentId).maybeSingle();
  if (!p || p.provider !== "sandbox" || p.status !== "PENDING") return { ok: false };
  const raw = JSON.stringify({ event_id: randomUUID(), payment_id: p.id, status: outcome === "WRONG_AMOUNT" ? "PAID" : outcome,
    amount_xof: outcome === "WRONG_AMOUNT" ? p.amount_xof - 1 : p.amount_xof, provider_reference: p.provider_reference });
  const h = await headers(); const base = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
  const res = await fetch(`${base}/api/payments/webhooks/sandbox`, { method: "POST", body: raw, headers: { "content-type": "application/json", "x-sandbox-signature": signSandbox(raw, secret, Math.floor(Date.now() / 1000)) } });
  const j = (await res.json().catch(() => ({}))) as { result?: string };
  return { ok: res.ok, result: j.result };
}
