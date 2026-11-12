import type { MessageKey } from "@/i18n/messages";
const CODES = ["transition_not_allowed", "note_required", "payment_required", "registry_check_required", "forbidden", "not_found", "role_escalation", "last_admin", "invalid_input"] as const;

/** Convertit un message d'erreur de la base (codes stables) en clé de traduction. */
export function dbErrorKey(message: string | undefined | null): MessageKey {
  const code = CODES.find((c) => message?.trim() === c || message?.includes(c));
  return (code ? `adm.err.${code}` : "adm.err.generic") as MessageKey;
}
