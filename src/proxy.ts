import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { resolveMunicipalitySlug } from "@/lib/tenancy/resolve";

export async function proxy(request: NextRequest) {
  const slug = resolveMunicipalitySlug({
    host: request.headers.get("host"),
    rootDomain: process.env.NEXT_PUBLIC_ROOT_DOMAIN || "localhost",
    defaultSlug: process.env.NEXT_PUBLIC_DEFAULT_MUNICIPALITY || "niankorodougou",
  });
  if (!slug) return new NextResponse("Commune inconnue", { status: 404 });

  // On écrase toujours l'en-tête entrant : un client ne peut pas choisir sa commune.
  const headers = new Headers(request.headers);
  headers.set("x-municipality-slug", slug);
  let response = NextResponse.next({ request: { headers } });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url && key) {
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(list) {
          list.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request: { headers } });
          list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    });
    await supabase.auth.getClaims(); // rafraîchit la session ; l'autorisation reste vérifiée côté serveur
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|ico)$).*)"],
};
