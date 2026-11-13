"use server";
import { createHash } from "node:crypto";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";
import { clientFingerprint, rateLimit } from "@/server/rate-limit";

const schema = z.object({ email: z.string().trim().toLowerCase().email().max(254), password: z.string().min(8).max(200) });
export type LoginState = { error?: "adm.login.invalid" | "common.tooMany" } | undefined;

export async function signInAgent(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = schema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { error: "adm.login.invalid" };
  // Limitation des tentatives : par client (20/15 min) ET par compte visé (5/15 min) contre la force brute et le bourrage d'identifiants.
  const mailKey = createHash("sha256").update(parsed.data.email).digest("hex").slice(0, 16);
  if (!(await rateLimit("agent-login-ip", await clientFingerprint(), 20, 900)) || !(await rateLimit("agent-login-mail", mailKey, 5, 900))) return { error: "common.tooMany" };
  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: "adm.login.invalid" };      // message générique : pas d'énumération de comptes
  redirect("/admin");
}

export async function signOutAgent() {
  const supabase = await createServerSupabase();
  await supabase.auth.signOut();
  redirect("/admin/connexion");
}
