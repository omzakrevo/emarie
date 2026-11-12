import { NextResponse } from "next/server";
import { handleWebhook } from "@/server/payments/webhook";
import { clientFingerprint } from "@/server/rate-limit";

export async function POST(req: Request, ctx: RouteContext<"/api/payments/webhooks/[provider]">) {
  const { provider } = await ctx.params;
  const raw = await req.text();                       // corps BRUT : la signature porte sur les octets reçus
  const r = await handleWebhook(provider, raw, req.headers, await clientFingerprint());
  return NextResponse.json(r.body, { status: r.status, headers: { "Cache-Control": "no-store" } });
}

export const maxDuration = 60;   // rendu PDF (quittance) possible
