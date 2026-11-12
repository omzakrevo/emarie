import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { createServerSupabase } from "@/lib/supabase/server";
import { BUCKET } from "@/server/applications/operations";

/** Téléchargement d'un justificatif par un agent : la RLS décide de la visibilité ; URL signée 60 s ; accès journalisé. */
export async function GET(_req: Request, ctx: RouteContext<"/api/admin/files/[fileId]">) {
  const { fileId } = await ctx.params;
  const sb = await createServerSupabase();
  const { data: u } = await sb.auth.getUser();
  if (!u.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data: f } = await sb.from("application_files").select("id, municipality_id, application_id, storage_path").eq("id", fileId).maybeSingle();
  if (!f) return NextResponse.json({ error: "not_found" }, { status: 404 });   // RLS : invisible = introuvable
  const admin = createAdminSupabase();
  const { data } = await admin.storage.from(BUCKET).createSignedUrl(f.storage_path, 60);
  if (!data?.signedUrl) return NextResponse.json({ error: "failed" }, { status: 500 });
  await admin.from("audit_logs").insert({ municipality_id: f.municipality_id, actor_id: u.user.id, action: "file_download", entity: "application_file", entity_id: f.id, metadata: { application_id: f.application_id } });
  const res = NextResponse.redirect(data.signedUrl, 302);
  res.headers.set("Cache-Control", "private, no-store");
  return res;
}
