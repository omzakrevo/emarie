import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { createServerSupabase } from "@/lib/supabase/server";

/** PDF d'un document émis : visibilité décidée par la RLS (permission applications.read de la commune) ; URL signée 60 s ; accès journalisé. */
export async function GET(_req: Request, ctx: RouteContext<"/api/admin/documents/[id]/pdf">) {
  const { id } = await ctx.params;
  const sb = await createServerSupabase();
  const { data: u } = await sb.auth.getUser();
  if (!u.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data: d } = await sb.from("issued_documents").select("id, municipality_id, application_id, pdf_path, status").eq("id", id).maybeSingle();
  if (!d || !d.pdf_path || d.status === "pending") return NextResponse.json({ error: "not_found" }, { status: 404 });
  const admin = createAdminSupabase();
  const { data } = await admin.storage.from("issued-documents").createSignedUrl(d.pdf_path, 60);
  if (!data?.signedUrl) return NextResponse.json({ error: "failed" }, { status: 500 });
  await admin.from("audit_logs").insert({ municipality_id: d.municipality_id, actor_id: u.user.id, action: "document_download", entity: "issued_document", entity_id: d.id, metadata: { application_id: d.application_id } });
  const res = NextResponse.redirect(data.signedUrl, 302);
  res.headers.set("Cache-Control", "private, no-store");
  return res;
}
