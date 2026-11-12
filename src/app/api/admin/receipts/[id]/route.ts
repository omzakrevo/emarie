import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { createServerSupabase } from "@/lib/supabase/server";

export async function GET(_req: Request, ctx: RouteContext<"/api/admin/receipts/[id]">) {
  const { id } = await ctx.params;
  const sb = await createServerSupabase();
  const { data: u } = await sb.auth.getUser(); if (!u.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data: r } = await sb.from("receipts").select("id, municipality_id, pdf_path, pdf_sha256").eq("id", id).maybeSingle();   // RLS : payments.read de la commune
  if (!r?.pdf_path || !r.pdf_sha256) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const admin = createAdminSupabase(); const { data } = await admin.storage.from("receipts").createSignedUrl(r.pdf_path, 60);
  if (!data?.signedUrl) return NextResponse.json({ error: "failed" }, { status: 500 });
  await admin.from("audit_logs").insert({ municipality_id: r.municipality_id, actor_id: u.user.id, action: "receipt_download", entity: "receipt", entity_id: r.id, metadata: {} });
  const res = NextResponse.redirect(data.signedUrl, 302); res.headers.set("Cache-Control", "private, no-store"); return res;
}
