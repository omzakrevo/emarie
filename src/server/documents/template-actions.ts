"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";
import { dbErrorKey } from "@/features/admin/errors";
import { contentFromForm } from "@/features/documents/form";
import { renderDocumentHtml, sampleData } from "@/features/documents/render";
import { validateContent, TEMPLATE_CODES, type TemplateContent, type TemplateCode } from "@/features/documents/schema";
import { getAdminContext } from "@/server/admin/context";
import { rateLimit } from "@/server/rate-limit";
import { logoDataUri } from "./actions";
import { renderPdf } from "./pdf";

const uuid = z.string().uuid();
export type TemplateState = { ok?: boolean; message?: string; error?: string; details?: string[]; pdf?: string } | undefined;
const refresh = () => revalidatePath("/admin/modeles", "layout");

async function loadVersion(versionId: string, municipalityId: string) {
  const sb = await createServerSupabase();
  const { data } = await sb.from("document_template_versions").select("id, template_id, version, status, content, document_templates(code)").eq("id", versionId).eq("municipality_id", municipalityId).maybeSingle();
  if (!data) return null;
  const code = (data.document_templates as unknown as { code: TemplateCode } | null)?.code;
  if (!code || !TEMPLATE_CODES.includes(code)) return null;
  return { ...data, code, content: data.content as TemplateContent };
}
const fromForm = (form: FormData) => (k: string) => { const v = form.get(k); return typeof v === "string" ? v : null; };

export async function createDraftAction(_p: TemplateState, form: FormData): Promise<TemplateState> {
  const from = uuid.safeParse(form.get("fromVersionId")); if (!from.success) return { error: "adm.err.invalid_input" };
  const ctx = await getAdminContext(); const src = await loadVersion(from.data, ctx.municipality.id); if (!src) return { error: "adm.err.not_found" };
  const sb = await createServerSupabase();
  const { data: max } = await sb.from("document_template_versions").select("version").eq("template_id", src.template_id).order("version", { ascending: false }).limit(1).maybeSingle();
  const { data, error } = await sb.from("document_template_versions").insert({
    municipality_id: ctx.municipality.id, template_id: src.template_id, version: (max?.version ?? 0) + 1, status: "draft", content: src.content, is_provisional: true, created_by: ctx.userId,
  }).select("id").single();
  if (error || !data) return { error: dbErrorKey("forbidden") };
  refresh(); return { ok: true, message: data.id };
}

export async function saveDraftAction(_p: TemplateState, form: FormData): Promise<TemplateState> {
  const id = uuid.safeParse(form.get("versionId")); if (!id.success) return { error: "adm.err.invalid_input" };
  const ctx = await getAdminContext(); const v = await loadVersion(id.data, ctx.municipality.id); if (!v) return { error: "adm.err.not_found" };
  if (v.status !== "draft") return { error: "adm.err.document_locked" };
  const val = validateContent(contentFromForm(fromForm(form), v.content), v.code);
  if (!val.ok) return { error: "adm.err.invalid_input", details: val.errors };
  const { data, error } = await (await createServerSupabase()).from("document_template_versions").update({ content: val.content }).eq("id", id.data).eq("municipality_id", ctx.municipality.id).select("id");
  if (error || !data?.length) return { error: dbErrorKey("document_locked") };
  refresh(); return { ok: true, message: "adm.sv.saved" };
}

/** Prévisualisation avec des données FICTIVES uniquement (jamais de dossier réel). Toujours en filigrane spécimen. */
export async function previewTemplateAction(_p: TemplateState, form: FormData): Promise<TemplateState> {
  const id = uuid.safeParse(form.get("versionId")); if (!id.success) return { error: "adm.err.invalid_input" };
  const ctx = await getAdminContext(); const v = await loadVersion(id.data, ctx.municipality.id); if (!v) return { error: "adm.err.not_found" };
  if (!(await rateLimit("tpl-preview", ctx.userId, 20, 300))) return { error: "common.tooMany" };
  const val = validateContent(contentFromForm(fromForm(form), v.content), v.code);
  if (!val.ok) return { error: "adm.err.invalid_input", details: val.errors };
  try {
    const data = { ...sampleData(v.code), commune: ctx.municipality.name, province: ctx.municipality.province, region: ctx.municipality.region, lieu_delivrance: ctx.municipality.name };
    const pdf = await renderPdf(renderDocumentHtml(val.content, data, { specimen: true, logoDataUri: await logoDataUri(ctx.municipality.id, ctx.municipality.logo_path) }));
    return { ok: true, pdf: pdf.toString("base64") };
  } catch { return { error: "adm.doc.renderFailed" }; }
}

export async function publishVersionAction(_p: TemplateState, form: FormData): Promise<TemplateState> {
  const id = uuid.safeParse(form.get("versionId")); if (!id.success) return { error: "adm.err.invalid_input" };
  await getAdminContext();
  const { error } = await (await createServerSupabase()).rpc("publish_template_version", { p_version: id.data, p_official: form.get("official") === "on" });
  if (error) return { error: dbErrorKey(error.message) };
  refresh(); return { ok: true, message: "adm.sv.saved" };
}

export async function deleteDraftAction(_p: TemplateState, form: FormData): Promise<TemplateState> {
  const id = uuid.safeParse(form.get("versionId")); if (!id.success) return { error: "adm.err.invalid_input" };
  const ctx = await getAdminContext();
  const { data, error } = await (await createServerSupabase()).from("document_template_versions").delete().eq("id", id.data).eq("municipality_id", ctx.municipality.id).select("id");
  if (error || !data?.length) return { error: dbErrorKey("document_locked") };
  refresh(); return { ok: true, message: "adm.sv.saved" };
}
