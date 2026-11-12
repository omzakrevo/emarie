import { Suspense } from "react";
import { LoginForm } from "./login-form";

export default function Page({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  return <Suspense fallback={null}><Content searchParams={searchParams} /></Suspense>;
}

async function Content({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-4 p-6">
      <h1 className="text-2xl font-semibold text-blue-900">Espace agents</h1>
      {error === "forbidden" && (
        <p role="alert" className="rounded bg-amber-50 p-3 text-sm text-amber-900">
          Ce compte n&apos;a pas accès à cette mairie.
        </p>
      )}
      <LoginForm />
    </main>
  );
}
