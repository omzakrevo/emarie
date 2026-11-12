import { Suspense } from "react";
import { isSupabaseConfigured } from "@/lib/env";
import { getCurrentMunicipality } from "@/server/tenancy";

export default function Page() {
  return <Suspense fallback={<p className="p-8 text-sm">Chargement…</p>}><Home /></Suspense>;
}

async function Home() {
  if (!isSupabaseConfigured()) {
    return (
      <main className="mx-auto max-w-xl p-8">
        <h1 className="text-2xl font-semibold text-blue-900">E-MAIRIE</h1>
        <p className="mt-3 text-sm text-gray-700">Supabase n&apos;est pas configuré. Copiez <code>.env.example</code> vers <code>.env.local</code>.</p>
      </main>
    );
  }
  const m = await getCurrentMunicipality();
  return (
    <main className="mx-auto max-w-xl p-8">
      <h1 className="text-2xl font-semibold text-blue-900">E-MAIRIE</h1>
      <p className="mt-1 text-green-700">La mairie, plus proche de vous.</p>
      <p className="mt-4">Commune de {m.name} — province de la {m.province}, région des {m.region}.</p>
      <p className="mt-6 text-xs text-gray-500">Portail citoyen : Phase 3 (en attente de validation).</p>
    </main>
  );
}
