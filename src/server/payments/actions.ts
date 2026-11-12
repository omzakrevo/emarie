"use server";
import { headers } from "next/headers";
import { z } from "zod";
import type { PayStatus } from "@/features/payments/types";
import { authenticateByReference } from "@/server/applications/access";
import { clientFingerprint, rateLimit } from "@/server/rate-limit";
import { paymentStatus, receiptSignedUrl, startPayment, type StartError } from "./service";

const cred = z.object({ reference: z.string().min(8).max(30), secret: z.string().max(30).nullable() });
async function origin() { const h = await headers(); return `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host")}`; }

export type StartPaymentResult = { ok: true; free: boolean; paymentId?: string; redirectUrl?: string } | { ok: false; error: StartError | "denied" | "rate_limited" };

/** Le client n'envoie JAMAIS de montant : il est calculé en base. La clé d'idempotence évite le double débit sur double clic. */
export async function startPaymentAction(input: { reference: string; secret: string | null; provider: string; phone: string; key: string }): Promise<StartPaymentResult> {
  const p = cred.safeParse(input); const key = z.string().min(8).max(80).safeParse(input.key);
  if (!p.success || !key.success) return { ok: false, error: "denied" };
  if (!(await rateLimit("pay-start", await clientFingerprint(), 20, 600))) return { ok: false, error: "rate_limited" };
  const app = await authenticateByReference(p.data.reference, p.data.secret);
  if (!app) return { ok: false, error: "denied" };
  const r = await startPayment({ app, provider: String(input.provider).slice(0, 30), phone: String(input.phone).slice(0, 30), key: key.data, origin: await origin() });
  return r.ok ? { ok: true, free: r.free, paymentId: r.paymentId, redirectUrl: r.redirectUrl } : r;
}

export type PaymentStatusResult = { ok: true; status: PayStatus; amountXof: number | null; receiptReady: boolean; applicationStatus: string } | { ok: false };
export async function paymentStatusAction(input: { reference: string; secret: string | null }): Promise<PaymentStatusResult> {
  const p = cred.safeParse(input); if (!p.success) return { ok: false };
  if (!(await rateLimit("pay-status", await clientFingerprint(), 120, 60))) return { ok: false };
  const app = await authenticateByReference(p.data.reference, p.data.secret);
  return app ? { ok: true, ...(await paymentStatus(app)) } : { ok: false };
}

export async function receiptUrlAction(input: { reference: string; secret: string | null }): Promise<{ ok: true; url: string } | { ok: false }> {
  const p = cred.safeParse(input); if (!p.success) return { ok: false };
  const app = await authenticateByReference(p.data.reference, p.data.secret);
  const url = app ? await receiptSignedUrl(app) : null;     // URL signée de 60 s, jamais d'identifiant personnel dans une adresse publique
  return url ? { ok: true, url } : { ok: false };
}
