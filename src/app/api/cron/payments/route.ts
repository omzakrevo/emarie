import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { cronAuthorized } from "@/server/cron-auth";
import { generateReceipt } from "@/server/payments/receipt";

/** Réconciliation technique : génère les quittances manquantes. Les écarts d'argent restent à traiter par un humain (/admin/paiements). */
export async function POST(req: Request) {
  const a = cronAuthorized(req); if (!a.ok) return NextResponse.json({ error: "unauthorized" }, { status: a.status });
  const admin = createAdminSupabase();
  const { data: paid } = await admin.from("payments").select("id, receipts(pdf_sha256)").in("status", ["PAID", "REFUNDED"]).limit(100);
  let fixed = 0;
  for (const p of paid ?? []) {
    const rc = p.receipts as unknown as { pdf_sha256: string | null } | { pdf_sha256: string | null }[] | null;
    const has = Array.isArray(rc) ? rc[0]?.pdf_sha256 : rc?.pdf_sha256;
    if (!has) { try { if (await generateReceipt(p.id)) fixed++; } catch { /* réessayé au prochain passage */ } }
  }
  return NextResponse.json({ receiptsGenerated: fixed }, { headers: { "Cache-Control": "no-store" } });
}
export const GET = POST;
