import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { AccessError, resolveApplication } from "@/server/applications/access";
import { BUCKET } from "@/server/applications/operations";
import { getCurrentMunicipality } from "@/server/tenancy";

/** Aperçu/téléchargement d'un justificatif par son propriétaire : redirection vers une URL signée valable 60 s. */
export async function GET(_req: Request, ctx: RouteContext<"/api/files/[fileId]">) {
  const { fileId } = await ctx.params;
  try {
    const m = await getCurrentMunicipality();
    const sb = createAdminSupabase();
    const { data: f } = await sb.from("application_files").select("application_id, storage_path").eq("id", fileId).eq("municipality_id", m.id).maybeSingle();
    if (!f) return NextResponse.json({ error: "not_found" }, { status: 404 });
    await resolveApplication(f.application_id, { draftOnly: false });
    const { data } = await sb.storage.from(BUCKET).createSignedUrl(f.storage_path, 60);
    if (!data?.signedUrl) return NextResponse.json({ error: "failed" }, { status: 500 });
    const res = NextResponse.redirect(data.signedUrl, 302);
    res.headers.set("Cache-Control", "private, no-store");
    return res;
  } catch (e) {
    if (e instanceof AccessError) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
