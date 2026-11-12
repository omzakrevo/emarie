import { NextResponse } from "next/server";
import { cronAuthorized } from "@/server/cron-auth";
import { processSmsQueue } from "@/server/sms/queue";

export async function POST(req: Request) {
  const a = cronAuthorized(req); if (!a.ok) return NextResponse.json({ error: "unauthorized" }, { status: a.status });
  return NextResponse.json(await processSmsQueue(50), { headers: { "Cache-Control": "no-store" } });
}
export const GET = POST;

export const maxDuration = 60;   // rendu PDF (quittance) possible
