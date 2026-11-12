import { timingSafeEqual } from "node:crypto";

/** Les tâches planifiées exigent `Authorization: Bearer $CRON_SECRET` (32 caractères min.). Sans secret configuré : refus. */
export function cronAuthorized(req: Request): { ok: true } | { ok: false; status: 401 | 503 } {
  const secret = process.env.CRON_SECRET ?? "";
  if (secret.length < 32) return { ok: false, status: 503 };
  const got = Buffer.from((req.headers.get("authorization") ?? "").replace(/^Bearer /, ""));
  const want = Buffer.from(secret);
  return got.length === want.length && timingSafeEqual(got, want) ? { ok: true } : { ok: false, status: 401 };
}
