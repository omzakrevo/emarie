import { notFound } from "next/navigation";
import { Harness } from "./harness";

/** Banc d'essai UI du formulaire (actions simulées EN MÉMOIRE). Désactivé sauf E2E_HARNESS=1 ; jamais utilisé en production. */
export default function Page() {
  if (process.env.E2E_HARNESS !== "1") notFound();
  return <Harness />;
}
