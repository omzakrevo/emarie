"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { sandboxDecideAction } from "@/server/payments/sandbox-actions";

export function SandboxPanel({ paymentId }: { paymentId: string }) {
  const [msg, setMsg] = useState(""); const [busy, setBusy] = useState(false);
  async function decide(o: "PAID" | "FAILED" | "CANCELLED" | "WRONG_AMOUNT") { setBusy(true); const r = await sandboxDecideAction(paymentId, o); setBusy(false); setMsg(r.ok ? `Notification envoyée — résultat : ${r.result}` : "Notification refusée (paiement introuvable ou déjà traité)."); }
  return (
    <div className="mx-auto flex max-w-md flex-col gap-4">
      <p role="alert" className="rounded-xl bg-red-50 p-4 text-center font-bold text-red-800">MODE TEST — AUCUN ARGENT RÉEL</p>
      <h1 className="text-xl font-bold text-brand-900">Simulateur de paiement</h1>
      <p className="text-sm text-slate-700">Cette page remplace l&apos;opérateur Mobile Money en environnement de test. Elle envoie une notification signée au serveur, comme le ferait un vrai prestataire.</p>
      <Button disabled={busy} variant="accent" onClick={() => decide("PAID")}>Simuler : paiement réussi</Button>
      <Button disabled={busy} variant="secondary" onClick={() => decide("FAILED")}>Simuler : paiement échoué</Button>
      <Button disabled={busy} variant="secondary" onClick={() => decide("CANCELLED")}>Simuler : annulé par l&apos;utilisateur</Button>
      <Button disabled={busy} variant="ghost" onClick={() => decide("WRONG_AMOUNT")}>Simuler : montant discordant (à revoir)</Button>
      {msg && <p role="status" className="text-sm font-medium">{msg}</p>}
      <p className="text-xs text-slate-500">Revenez ensuite sur l&apos;onglet de votre demande : le statut se met à jour automatiquement.</p>
    </div>
  );
}
