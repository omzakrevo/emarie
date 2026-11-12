"use server";
import { createHash } from "node:crypto";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";
import { normalizePhone } from "@/features/demande/fields";
import { clientFingerprint, rateLimit } from "@/server/rate-limit";

export type OtpState = { phase: "phone" | "code"; phone?: string; error?: "invalid" | "rate_limited" | "sms_unavailable" | "code" } | undefined;

const hash = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 16);
const nameSchema = z.string().trim().min(2).max(120);

/** Envoie un code SMS (Supabase Auth). Sans fournisseur SMS configuré dans Supabase, l'envoi échoue : on le dit clairement. */
export async function requestOtp(mode: "login" | "register", _prev: OtpState, form: FormData): Promise<OtpState> {
  const phone = normalizePhone(String(form.get("phone") ?? ""));
  const fullName = nameSchema.safeParse(form.get("name"));
  if (!phone || (mode === "register" && !fullName.success)) return { phase: "phone", error: "invalid" };
  if (!(await rateLimit("otp-phone", hash(phone), 5, 3600)) || !(await rateLimit("otp-ip", await clientFingerprint(), 20, 3600)))
    return { phase: "phone", error: "rate_limited" };
  const sb = await createServerSupabase();
  const { error } = await sb.auth.signInWithOtp({
    phone, options: { shouldCreateUser: mode === "register", data: mode === "register" && fullName.success ? { full_name: fullName.data } : undefined },
  });
  // Connexion d'un numéro inconnu : même réponse que le succès (pas d'énumération de comptes).
  if (error && mode === "register") return { phase: "phone", error: "sms_unavailable" };
  return { phase: "code", phone };
}

export async function verifyOtp(_prev: OtpState, form: FormData): Promise<OtpState> {
  const phone = normalizePhone(String(form.get("phone") ?? ""));
  const code = String(form.get("code") ?? "").replace(/\s/g, "");
  if (!phone || !/^\d{4,8}$/.test(code)) return { phase: "code", phone: phone ?? undefined, error: "code" };
  if (!(await rateLimit("otp-verify", hash(phone), 8, 900))) return { phase: "code", phone, error: "rate_limited" };
  const { error } = await (await createServerSupabase()).auth.verifyOtp({ phone, token: code, type: "sms" });
  if (error) return { phase: "code", phone, error: "code" };
  redirect("/mon-espace");
}

export async function signOutCitizen() {
  await (await createServerSupabase()).auth.signOut();
  redirect("/");
}

export async function updateProfile(_prev: { ok?: boolean; error?: boolean } | undefined, form: FormData) {
  const name = nameSchema.safeParse(form.get("name"));
  const lang = form.get("language") === "dyu" ? "dyu" : "fr";
  if (!name.success) return { error: true };
  const sb = await createServerSupabase();
  const { data } = await sb.auth.getUser();
  if (!data.user) redirect("/connexion");
  // RLS : un utilisateur ne peut modifier que sa propre ligne. Le téléphone n'est pas modifiable ici (revérification requise).
  const { error } = await sb.from("profiles").update({ full_name: name.data, preferred_language: lang }).eq("id", data.user.id);
  return error ? { error: true } : { ok: true };
}
