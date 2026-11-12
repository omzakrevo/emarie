import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sans 0/O/1/I : lisible au téléphone

/** Code de suivi invité : 12 caractères sur 32 symboles = 60 bits d'entropie. Format XXXX-XXXX-XXXX. */
export function generateTrackingSecret(): string {
  const raw = Array.from({ length: 12 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8)}`;
}
export function normalizeTrackingSecret(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}
/** Jeton de reprise de brouillon : 256 bits. */
export function generateDraftToken(): string { return randomBytes(32).toString("base64url"); }

export type SecretKind = "tracking" | "draft";
export function hashSecret(kind: SecretKind, value: string, pepper: string): string {
  const v = kind === "tracking" ? normalizeTrackingSecret(value) : value;
  return createHmac("sha256", pepper).update(`${kind}:${v}`).digest("hex");
}
export function safeEqualHex(a: string | null | undefined, b: string): boolean {
  if (!a || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}
