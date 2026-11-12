import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";

/** Lien d'invitation / réinitialisation reçu par e-mail : échange le jeton contre une session puis demande un mot de passe. */
export async function GET(req: NextRequest) {
  const tokenHash = req.nextUrl.searchParams.get("token_hash");
  const type = req.nextUrl.searchParams.get("type") as EmailOtpType | null;
  const dest = req.nextUrl.clone(); dest.search = "";
  if (tokenHash && type && ["invite", "recovery", "magiclink", "email"].includes(type)) {
    const { error } = await (await createServerSupabase()).auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) { dest.pathname = "/admin/mot-de-passe"; return NextResponse.redirect(dest); }
  }
  dest.pathname = "/admin/connexion"; dest.searchParams.set("error", "forbidden");
  return NextResponse.redirect(dest);
}
