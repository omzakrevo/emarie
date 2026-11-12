import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { sniffMime } from "@/server/files/sniff";

/** Logo de la commune en data URI (jamais de ressource externe dans le PDF). */
export async function logoDataUri(_municipalityId: string, logoPath: string | null): Promise<string | null> {
  if (!logoPath) return null;
  try {
    const { data } = await createAdminSupabase().storage.from("municipality-logos").download(logoPath);
    if (!data) return null;
    const buf = new Uint8Array(await data.arrayBuffer()); const mime = sniffMime(buf);
    if (!mime || mime === "application/pdf" || buf.length > 1_000_000) return null;
    return `data:${mime};base64,${Buffer.from(buf).toString("base64")}`;
  } catch { return null; }
}

