import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";

/** Journalise une consultation de données personnelles (ne bloque jamais l'affichage en cas d'échec). */
export async function auditView(municipalityId: string, actorId: string, entity: string, entityId: string): Promise<void> {
  try { await createAdminSupabase().from("audit_logs").insert({ municipality_id: municipalityId, actor_id: actorId, action: "view", entity, entity_id: entityId, metadata: {} }); } catch { /* ignoré */ }
}
