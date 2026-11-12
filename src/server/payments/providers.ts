import { verifySandbox } from "@/features/payments/sandbox";
import type { PayOption, ProviderId, VerifiedEvent, WebhookStatus } from "@/features/payments/types";

export class ProviderNotIntegrated extends Error { constructor(id: string) { super(`provider_not_integrated:${id}`); } }
export type PaymentMode = "sandbox" | "live";
export const paymentMode = (): PaymentMode => (process.env.PAYMENT_MODE === "live" ? "live" : "sandbox");

export interface InitiateInput { paymentId: string; reference: string; amountXof: number; payerPhone: string | null; origin: string }
export interface PaymentProvider {
  readonly id: ProviderId; readonly label: string;
  availability(): { available: boolean; reason?: string };
  /** Déclenche le paiement chez le prestataire. Lève si impossible. Ne marque JAMAIS le paiement comme payé. */
  initiate(i: InitiateInput): Promise<{ providerReference: string; redirectUrl?: string }>;
  /** Vérifie l'authenticité d'une notification. null = rejet (échec fermé). */
  verifyWebhook(rawBody: string, headers: Headers): VerifiedEvent | null;
}

const sandboxSecret = () => process.env.SANDBOX_WEBHOOK_SECRET ?? "";

export const sandboxProvider: PaymentProvider = {
  id: "sandbox", label: "Mode test (aucun argent réel)",
  availability() {
    if (paymentMode() !== "sandbox") return { available: false, reason: "Désactivé hors mode sandbox" };
    return sandboxSecret().length >= 32 ? { available: true } : { available: false, reason: "SANDBOX_WEBHOOK_SECRET (32 caractères min.) manquant" };
  },
  async initiate(i) { return { providerReference: `SBX-${i.paymentId.slice(0, 8).toUpperCase()}`, redirectUrl: `${i.origin}/paiement/sandbox/${i.paymentId}` }; },
  verifyWebhook(raw, headers) {
    if (paymentMode() !== "sandbox" || !verifySandbox(raw, headers.get("x-sandbox-signature"), sandboxSecret())) return null;
    try {
      const j = JSON.parse(raw) as Record<string, unknown>;
      const status = j.status as WebhookStatus;
      if (typeof j.event_id !== "string" || typeof j.payment_id !== "string" || !["PAID", "FAILED", "CANCELLED"].includes(status)) return null;
      return { eventId: j.event_id, paymentId: j.payment_id, status, amountXof: typeof j.amount_xof === "number" ? j.amount_xof : null, providerReference: typeof j.provider_reference === "string" ? j.provider_reference : null };
    } catch { return null; }
  },
};

/**
 * Orange Money / Moov Money Burkina Faso : INTÉGRATION NON RÉALISÉE.
 * Elle exige un contrat marchand, les identifiants API et la documentation officielle du prestataire (formats de requête,
 * mécanisme de signature des notifications). Rien n'est simulé : l'adaptateur refuse d'initier un paiement et rejette
 * toute notification (échec fermé). Pour l'intégrer : implémenter `initiate` et `verifyWebhook` selon la documentation
 * du prestataire, puis tester en environnement de recette du prestataire (voir docs/PAYMENTS.md).
 */
const notIntegrated = (id: "orange_money" | "moov_money", label: string): PaymentProvider => ({
  id, label,
  availability: () => ({ available: false, reason: "Contrat marchand et identifiants API requis — intégration non réalisée" }),
  async initiate() { throw new ProviderNotIntegrated(id); },
  verifyWebhook: () => null,
});

export const PROVIDERS: Record<ProviderId, PaymentProvider> = {
  sandbox: sandboxProvider,
  orange_money: notIntegrated("orange_money", "Orange Money"),
  moov_money: notIntegrated("moov_money", "Moov Money"),
};
export const getProvider = (id: string): PaymentProvider | null => (id in PROVIDERS ? PROVIDERS[id as ProviderId] : null);
export const describeOption = (id: ProviderId): PayOption => { const p = PROVIDERS[id]; const a = p.availability(); return { provider: id, label: p.label, available: a.available, reason: a.reason }; };
