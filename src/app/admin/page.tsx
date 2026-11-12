import { Suspense } from "react";
import { requireMember } from "@/server/auth/permissions";
import { signOutAgent } from "./connexion/actions";

export default function AdminPage() {
  return <Suspense fallback={<p className="p-6 text-sm">Chargement…</p>}><AdminHome /></Suspense>;
}

async function AdminHome() {
  const { municipality, member } = await requireMember();
  const role = (member.roles as unknown as { label: string } | null)?.label;
  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl font-semibold text-blue-900">Back-office — {municipality.name}</h1>
      <p className="mt-2 text-sm text-gray-600">Rôle : {role}. Les modules arrivent en Phase 4.</p>
      <form action={signOutAgent} className="mt-6"><button className="rounded border px-3 py-1 text-sm">Se déconnecter</button></form>
    </main>
  );
}
