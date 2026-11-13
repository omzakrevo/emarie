import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { cronAuthorized } from "@/server/cron-auth";

/**
 * Purge planifiée : brouillons expirés (fichiers du stockage supprimés D'ABORD, ligne ensuite) et données techniques périmées.
 * Les dossiers déposés ne sont jamais purgés ici (durée légale à fixer : docs/RETENTION.md).
 */
export async function POST(req: Request) {
  const a = cronAuthorized(req); if (!a.ok) return NextResponse.json({ error: "unauthorized" }, { status: a.status });
  const admin = createAdminSupabase();
  const { data: rows, error } = await admin.rpc("expired_drafts", { p_limit: 200 });
  if (error) return NextResponse.json({ error: "failed" }, { status: 500 });
  const byApp = new Map<string, string[]>();
  for (const r of (rows ?? []) as { application_id: string; storage_path: string | null }[]) {
    const list = byApp.get(r.application_id) ?? []; if (r.storage_path) list.push(r.storage_path); byApp.set(r.application_id, list);
  }
  const purgeable: string[] = [];
  for (const [id, paths] of byApp) {
    if (paths.length === 0) { purgeable.push(id); continue; }
    const { error: re } = await admin.storage.from("application-files").remove(paths);
    if (!re) purgeable.push(id);                       // si la suppression des fichiers échoue, on garde la ligne : réessai au prochain passage
  }
  let draftsPurged = 0;
  if (purgeable.length) { const { data } = await admin.rpc("purge_expired_drafts", { p_ids: purgeable }); draftsPurged = typeof data === "number" ? data : 0; }
  const { data: tech } = await admin.rpc("purge_technical_data");
  return NextResponse.json({ draftsPurged, draftsSkipped: byApp.size - purgeable.length, technical: tech }, { headers: { "Cache-Control": "no-store" } });
}
export const GET = POST;
export const maxDuration = 60;
