import "server-only";
import { createClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env";

/**
 * Client service_role : CONTOURNE la RLS. Réservé aux services serveur (webhooks, numérotation,
 * génération de documents). Toujours filtrer par municipality_id explicitement. Jamais importé
 * depuis un composant client (le paquet `server-only` fait échouer le build sinon).
 */
export function createAdminSupabase() {
  const { SUPABASE_SERVICE_ROLE_KEY } = serverEnv();
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
