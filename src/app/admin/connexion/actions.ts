"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";

const schema = z.object({ email: z.string().trim().email().max(254), password: z.string().min(8).max(200) });

export async function signInAgent(_prev: { error?: string } | undefined, formData: FormData) {
  const parsed = schema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { error: "Identifiants invalides." };
  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  // Message volontairement générique (pas d'énumération de comptes).
  if (error) return { error: "Identifiants invalides." };
  redirect("/admin");
}

export async function signOutAgent() {
  const supabase = await createServerSupabase();
  await supabase.auth.signOut();
  redirect("/admin/connexion");
}
