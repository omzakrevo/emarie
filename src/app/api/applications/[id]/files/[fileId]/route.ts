import { NextResponse } from "next/server";
import { AccessError, resolveApplication } from "@/server/applications/access";
import { removeFile } from "@/server/applications/operations";

export async function DELETE(_req: Request, ctx: RouteContext<"/api/applications/[id]/files/[fileId]">) {
  const { id, fileId } = await ctx.params;
  try {
    const app = await resolveApplication(id, { draftOnly: true });
    return (await removeFile(app, fileId)) ? new NextResponse(null, { status: 204 }) : NextResponse.json({ error: "not_found" }, { status: 404 });
  } catch (e) {
    if (e instanceof AccessError) return NextResponse.json({ error: e.code }, { status: e.code === "locked" ? 409 : 404 });
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
