import { NextResponse } from "next/server";

/** Sonde de disponibilité (aucune information de configuration ni de données). */
export function GET() { return NextResponse.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } }); }
