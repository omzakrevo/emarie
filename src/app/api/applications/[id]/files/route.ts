import { NextResponse } from "next/server";
import { AccessError, resolveApplication } from "@/server/applications/access";
import { getServiceById } from "@/server/applications/catalog";
import { addFile } from "@/server/applications/operations";
import { rateLimit } from "@/server/rate-limit";

export async function POST(req: Request, ctx: RouteContext<"/api/applications/[id]/files">) {
  const { id } = await ctx.params;
  try {
    const app = await resolveApplication(id, { draftOnly: true });
    if (!(await rateLimit("upload", id, 60, 3600))) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
    const service = await getServiceById(app.municipality_id, app.service_id);
    if (!service) return NextResponse.json({ error: "not_found" }, { status: 404 });
    const form = await req.formData();
    const file = form.get("file");
    const documentKey = String(form.get("documentKey") ?? "");
    if (!(file instanceof File)) return NextResponse.json({ error: "empty" }, { status: 400 });
    const r = await addFile(app, service, documentKey, file);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.error === "too_big" ? 413 : r.error === "storage_failed" ? 500 : 400 });
    return NextResponse.json({ file: r.file }, { status: 201 });
  } catch (e) {
    if (e instanceof AccessError) return NextResponse.json({ error: e.code }, { status: e.code === "locked" ? 409 : 404 });
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
