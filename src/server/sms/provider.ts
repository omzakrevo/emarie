export interface SmsResult { ok: boolean; providerMessageId?: string; error?: string }
export interface SmsProvider { readonly id: string; readonly isTest: boolean; send(toE164: string, body: string): Promise<SmsResult> }

export const smsMode = (): "test" | "live" => (process.env.SMS_MODE === "live" ? "live" : "test");

/** Mode test : N'ENVOIE RIEN. Le message est seulement journalisé (statut « test_sent » dans l'historique). */
export const testProvider: SmsProvider = {
  id: "test", isTest: true,
  async send(to, body) { console.info(`[SMS TEST — non envoyé] ${to.slice(0, 6)}… (${body.length} car.)`); return { ok: true, providerMessageId: "test" }; },
};

/**
 * Aucun fournisseur SMS réel n'est intégré. Pour en brancher un : implémenter `SmsProvider` (documentation et identifiants du
 * fournisseur requis), l'enregistrer ici, puis tester en recette. Tant que SMS_MODE=live sans fournisseur : la file n'est PAS
 * traitée (les messages restent en attente, rien n'est perdu ni faussement marqué envoyé).
 */
export function getSmsProvider(): SmsProvider | null { return smsMode() === "test" ? testProvider : null; }

export const RETRY_DELAYS_MINUTES = [1, 5, 30, 120] as const;
export const MAX_ATTEMPTS = 5;
export const ALLOWED_TEMPLATE_VARS = ["commune", "reference"] as const;
/** Variables {x} d'un modèle SMS non autorisées (liste vide = valide). */
export function invalidTemplateVars(body: string): string[] {
  return [...body.matchAll(/\{(\w*)\}/g)].map((m) => m[1]).filter((v) => !(ALLOWED_TEMPLATE_VARS as readonly string[]).includes(v));
}
