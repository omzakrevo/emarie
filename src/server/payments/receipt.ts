import "server-only";
import { createHash } from "node:crypto";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { renderReceiptHtml, type ReceiptData } from "@/features/payments/receipt-html";
import { logoDataUri } from "@/server/documents/logo";
import { renderPdf } from "@/server/documents/pdf";

/** Émet (idempotent) puis génère la quittance PDF d'un paiement confirmé. Un échec est rattrapé par /api/cron/payments. */
export async function generateReceipt(paymentId: string): Promise<boolean> {
  const admin = createAdminSupabase();
  const { data, error } = await admin.rpc("issue_receipt", { p_payment: paymentId });
  if (error || !data) return false;
  const r = data as ReceiptData & { receipt_id: string; has_pdf: boolean; municipality_id: string };
  if (r.has_pdf) return true;
  const { data: m } = await admin.from("municipalities").select("logo_path").eq("id", r.municipality_id).single();
  const pdf = await renderPdf(renderReceiptHtml(r, await logoDataUri(r.municipality_id, m?.logo_path ?? null)));
  const path = `${r.municipality_id}/${r.receipt_id}.pdf`;
  const up = await admin.storage.from("receipts").upload(path, pdf, { contentType: "application/pdf", upsert: true });
  if (up.error) return false;
  const { error: fe } = await admin.rpc("finalize_receipt", { p_receipt: r.receipt_id, p_pdf_path: path, p_sha256: createHash("sha256").update(pdf).digest("hex") });
  return !fe;
}
