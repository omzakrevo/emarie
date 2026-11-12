"use client";
import { useActionState } from "react";
import { signInAgent } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(signInAgent, undefined);
  return (
    <form action={action} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm">E-mail
        <input name="email" type="email" required autoComplete="username" className="rounded border p-2" />
      </label>
      <label className="flex flex-col gap-1 text-sm">Mot de passe
        <input name="password" type="password" required minLength={8} autoComplete="current-password" className="rounded border p-2" />
      </label>
      {state?.error && <p role="alert" className="text-sm text-red-700">{state.error}</p>}
      <button disabled={pending} className="rounded bg-blue-800 p-2 font-medium text-white disabled:opacity-60">
        {pending ? "Connexion…" : "Se connecter"}
      </button>
    </form>
  );
}
