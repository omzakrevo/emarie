import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";

export interface Municipality {
  id: string; slug: string; name: string; region: string; province: string;
  address: string | null; logo_path: string | null; contacts: Record<string, unknown>;
}

/** Commune courante, déterminée par proxy.ts (sous-domaine). 404 si inconnue ou inactive. */
export const getCurrentMunicipality = cache(async (): Promise<Municipality> => {
  const slug = (await headers()).get("x-municipality-slug");
  if (!slug) notFound();
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("municipalities")
    .select("id, slug, name, region, province, address, logo_path, contacts")
    .eq("slug", slug)
    .maybeSingle();
  if (!data) notFound();
  return data as Municipality;
});
