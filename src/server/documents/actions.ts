"use server";
import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { createServerSupabase } from "@/lib/supabase/server";
import { dbErrorKey } from "@/features/admin/errors";
import { renderDocumentHtml } from "@/features/documents/render";
import { validateContent, type TemplateCode } from "@/features/documents/schema";
import { getAdminContext, can } from "@/server/admin/context";
import type { ActionState } from "@/server/admin/actions";
import { rateLimit } from "@/server/rate-limit";
import { sniffMime } from "@/server/files/sniff";
import { renderPdf } from "./pdf";

const uuid = z.string().uuid();
const bad = (): ActionState => ({ error: "adm.err.invalid_input" });
const refresh = (appId?: string) => { revalidatePath("/admin/documents"); revalidatePath("/admin"); if (appId) revalidatePath(`/admin/demandes/${appId}`); };

export async function logoDataUri(municipalityId: string, logoPath: string | null): Promise<string | null> {
  if (!logoPath) return null;
  try {
    const { data } = await createAdminSupabase().storage.from("municipality-logos").download(logoPath);
    if (!data) return null;
    const buf = new Uint8Array(await data.arrayBuffer()); const mime = sniffMime(buf);
    if (!mime || mime === "application/pdf" || buf.length > 1_000_000) return null;
    return `data:${mime};base64,${Buffer.from(buf).toString("base64")}`;
  } catch { return null; }
}

/** prepare (base : droits, statut, numéro, données figées) -> rendu PDF -> stockage privé -> finalize (base : statut + empreinte). */
export async function generateDocumentAction(_p: ActionState, form: FormData): Promise<ActionState> {
  const appId = uuid.safeParse(form.get("applicationId")); if (!appId.success) return bad();
  const ctx = await getAdminContext();
  if (!can(ctx, "documents.generate")) return { error: "adm.err.forbidden" };
  if (!(await rateLimit("docgen", ctx.userId, 30, 600))) return { error: "common.tooMany" };
  const sb = await createServerSupabase();
  const { data: prep, error } = await sb.rpc("prepare_document", { p_application: appId.data });
  if (error) return { error: dbErrorKey(error.message) };
  const p = prep as { document_id: string; snapshot: Record<string, unknown>; content: unknown; is_specimen: boolean; template_code: TemplateCode };
  const v = validateContent(p.content, p.template_code);
  if (!v.ok) return bad();                                              // modèle invalide : échec fermé
  const values = Object.fromEntries(Object.entries(p.snapshot).filter(([, x]) => typeof x === "string")) as Record<string, string>;
  let pdf: Buffer;
  try {
    pdf = await renderPdf(renderDocumentHtml(v.content, values, { specimen: p.is_specimen, logoDataUri: await logoDataUri(ctx.municipality.id, ctx.municipality.logo_path) }));
  } catch { return { error: "adm.doc.renderFailed" }; }                 // le document « pending » est repris au prochain essai (même numéro)
  const path = `${ctx.municipality.id}/${appId.data}/${p.document_id}.pdf`;
  const up = await createAdminSupabase().storage.from("issued-documents").upload(path, pdf, { contentType: "application/pdf", upsert: true });
  if (up.error) return { error: "adm.doc.renderFailed" };
  const { error: fe } = await sb.rpc("finalize_document", { p_doc: p.document_id, p_pdf_path: path, p_sha256: createHash("sha256").update(pdf).digest("hex") });
  if (fe) return { error: dbErrorKey(fe.message) };
  refresh(appId.data); return { ok: true };
}

const stepSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("print") }), z.object({ kind: z.literal("hand") }), z.object({ kind: z.literal("release") }),
  z.object({ kind: z.literal("discard"), reason: z.string().trim().min(1).max(300) }),
  z.object({ kind: z.literal("sign"), signer: z.string().trim().min(2).max(120), title: z.string().trim().min(2).max(120) }),
  z.object({ kind: z.literal("withdraw"), name: z.string().trim().min(2).max(120), relationship: z.string().trim().min(2).max(60),
    idType: z.enum(["cnib", "passeport", "permis", "autre"]), idNumber: z.string().trim().min(4).max(40), verified: z.boolean() }),
]);

export async function documentStepAction(_p: ActionState, form: FormData): Promise<ActionState> {
  const docId = uuid.safeParse(form.get("docId")); const appId = uuid.safeParse(form.get("applicationId"));
  const s = stepSchema.safeParse({ kind: form.get("kind"), reason: form.get("reason") ?? undefined, signer: form.get("signer") ?? undefined, title: form.get("title") ?? undefined,
    name: form.get("name") ?? undefined, relationship: form.get("relationship") ?? undefined, idType: form.get("idType") ?? undefined, idNumber: form.get("idNumber") ?? undefined, verified: form.get("verified") === "on" });
  if (!docId.success || !appId.success || !s.success) return bad();
  await getAdminContext();
  const sb = await createServerSupabase(); const d = docId.data; const k = s.data;
  const { error } =
    k.kind === "print" ? await sb.rpc("mark_printed", { p_doc: d }) :
    k.kind === "hand" ? await sb.rpc("hand_to_signer", { p_doc: d }) :
    k.kind === "release" ? await sb.rpc("release_document", { p_doc: d }) :
    k.kind === "discard" ? await sb.rpc("discard_document", { p_doc: d, p_reason: k.reason }) :
    k.kind === "sign" ? await sb.rpc("confirm_signature", { p_doc: d, p_signer_name: k.signer, p_signer_title: k.title }) :
    await sb.rpc("record_withdrawal", { p_doc: d, p_name: k.name, p_relationship: k.relationship, p_id_type: k.idType, p_id_number: k.idNumber, p_identity_verified: k.verified });
  if (error) return { error: dbErrorKey(error.message) };
  refresh(appId.data); return { ok: true };
}

// ---- Logo -----------------------------------------------------------------------------------------------------
export async function uploadLogoAction(_p: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await getAdminContext();
  if (!can(ctx, "municipality.settings.manage")) return { error: "adm.err.forbidden" };
  const file = form.get("logo");
  if (!(file instanceof File) || file.size === 0 || file.size > 1_000_000) return bad();
  const buf = new Uint8Array(await file.arrayBuffer()); const mime = sniffMime(buf);
  if (!mime || mime === "application/pdf") return bad();
  const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
  const path = `${ctx.municipality.id}/logo-${Date.now()}.${ext}`;
  const up = await createAdminSupabase().storage.from("municipality-logos").upload(path, buf, { contentType: mime, upsert: false });
  if (up.error) return bad();
  const { error } = await (await createServerSupabase()).from("municipalities").update({ logo_path: path }).eq("id", ctx.municipality.id);
  if (error) return { error: "adm.err.forbidden" };
  revalidatePath("/", "layout"); return { ok: true, message: "adm.st.saved" };
}
