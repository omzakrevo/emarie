import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import { pickLocalized, type Locale } from "@/i18n/messages";

/** Texte public configurable (clé "public.*"). Vide tant que la mairie ne l'a pas renseigné : rien n'est inventé. */
export async function getPublicText(municipalityId: string, key: string, locale: Locale): Promise<string> {
  const { data } = await (await createServerSupabase()).from("municipality_settings").select("value").eq("municipality_id", municipalityId).eq("key", key).maybeSingle();
  return pickLocalized(data?.value as Record<string, string> | undefined, locale);
}
