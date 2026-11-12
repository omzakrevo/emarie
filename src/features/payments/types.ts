export type ProviderId = "sandbox" | "orange_money" | "moov_money";
export type WebhookStatus = "PAID" | "FAILED" | "CANCELLED";
export interface VerifiedEvent { eventId: string; paymentId: string; status: WebhookStatus; amountXof: number | null; providerReference: string | null }
export interface PayOption { provider: ProviderId; label: string; available: boolean; reason?: string }
export type PayStatus = "NONE" | "CREATED" | "PENDING" | "PAID" | "FAILED" | "CANCELLED" | "REFUNDED";
