import { createHmac, timingSafeEqual } from "node:crypto";

/** Signature des webhooks du fournisseur SANDBOX (nôtre). Format : `t=<unix>,v1=<hex HMAC-SHA256 de "<t>.<corps brut>">`. */
export function signSandbox(rawBody: string, secret: string, t: number): string {
  return `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex")}`;
}

export function verifySandbox(rawBody: string, header: string | null, secret: string, nowSeconds = Math.floor(Date.now() / 1000), toleranceSeconds = 300): boolean {
  if (!header || secret.length < 32) return false;
  const m = /^t=(\d{9,12}),v1=([0-9a-f]{64})$/.exec(header.trim());
  if (!m) return false;
  if (Math.abs(nowSeconds - Number(m[1])) > toleranceSeconds) return false;          // anti-rejeu (fenêtre de 5 min)
  const expected = createHmac("sha256", secret).update(`${m[1]}.${rawBody}`).digest();
  const given = Buffer.from(m[2], "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}
