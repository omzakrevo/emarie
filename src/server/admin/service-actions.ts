"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";
import { dbErrorKey } from "@/features/admin/errors";
import { getAdminContext } from "./context";
import type { ActionState } from "./actions";

const uuid = z.string().uuid();
const bad = (): ActionState => ({ error: "adm.err.invalid_input" });
const done = (): ActionState => ({ ok: true, message: "adm.sv.saved" });
const refresh = () => { revalidatePath("/admin/services", "layout"); revalidatePath("/services", "layout"); revalidatePath("/", "layout"); };

export async function saveServiceAction(_p: ActionState, form: FormData): Promise<ActionState> {
  const p = z.object({ id: uuid, description: z.string().max(1000), procedure: z.string().max(5000), delay: z.string().regex(/^\d{0,3}$/) })
    .safeParse({ id: form.get("id"), description: form.get("description") ?? "", procedure: form.get("procedure") ?? "", delay: form.get("delay") ?? "" });
  if (!p.success) return bad();
  const ctx = await getAdminContext(); const sb = await createServerSupabase();
  const { data: cur } = await sb.from("services").select("description, procedure").eq("id", p.data.id).eq("municipality_id", ctx.municipality.id).maybeSingle();
  if (!cur) return { error: "adm.err.not_found" };
  const { error } = await sb.from("services").update({
    description: { ...(cur.description as object), fr: p.data.description }, procedure: { ...(cur.procedure as object), fr: p.data.procedure },
    indicative_delay_days: p.data.delay === "" ? null : Number(p.data.delay), is_active: form.get("active") === "on",
  }).eq("id", p.data.id).eq("municipality_id", ctx.municipality.id);
  if (error) return { error: dbErrorKey("forbidden") };
  refresh(); return done();
}

export async function setPriceAction(_p: ActionState, form: FormData): Promise<ActionState> {
  const p = z.object({ id: uuid, amount: z.coerce.number().int().min(0).max(10_000_000), from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) })
    .safeParse({ id: form.get("id"), amount: form.get("amount"), from: form.get("from") });
  if (!p.success) return bad();
  await getAdminContext();
  const { error } = await (await createServerSupabase()).rpc("set_service_price", { p_service: p.data.id, p_amount_xof: p.data.amount, p_valid_from: p.data.from });
  if (error) return { error: dbErrorKey(error.message) };
  refresh(); return done();
}

export async function saveFieldAction(_p: ActionState, form: FormData): Promise<ActionState> {
  const p = z.object({ id: uuid, label: z.string().trim().min(1).max(200), help: z.string().max(300) }).safeParse({ id: form.get("id"), label: form.get("label"), help: form.get("help") ?? "" });
  if (!p.success) return bad();
  const ctx = await getAdminContext(); const sb = await createServerSupabase();
  const { data: cur } = await sb.from("service_fields").select("label, help").eq("id", p.data.id).eq("municipality_id", ctx.municipality.id).maybeSingle();
  if (!cur) return { error: "adm.err.not_found" };
  const { error } = await sb.from("service_fields").update({
    label: { ...(cur.label as object), fr: p.data.label }, help: { ...((cur.help as object) ?? {}), fr: p.data.help }, required: form.get("required") === "on",
  }).eq("id", p.data.id).eq("municipality_id", ctx.municipality.id);
  if (error) return { error: dbErrorKey("forbidden") };
  refresh(); return done();
}

const slug = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 30);

export async function saveDocumentAction(_p: ActionState, form: FormData): Promise<ActionState> {
  const p = z.object({ serviceId: uuid, docId: uuid.optional(), label: z.string().trim().min(1).max(200), max: z.coerce.number().int().min(100).max(10240) })
    .safeParse({ serviceId: form.get("serviceId"), docId: form.get("docId") || undefined, label: form.get("label"), max: form.get("max") || 5120 });
  if (!p.success) return bad();
  const ctx = await getAdminContext(); const sb = await createServerSupabase(); const required = form.get("required") === "on";
  if (p.data.docId) {
    const { data: cur } = await sb.from("service_documents").select("label").eq("id", p.data.docId).eq("municipality_id", ctx.municipality.id).maybeSingle();
    if (!cur) return { error: "adm.err.not_found" };
    const { error } = await sb.from("service_documents").update({ label: { ...(cur.label as object), fr: p.data.label }, required, max_size_kb: p.data.max }).eq("id", p.data.docId).eq("municipality_id", ctx.municipality.id);
    if (error) return { error: dbErrorKey("forbidden") };
  } else {
    let base = slug(p.data.label); if (!/^[a-z]/.test(base)) base = `doc_${base}`; if (base.length < 2) base = "doc_piece";
    for (let i = 0; i < 5; i++) {
      const key = i === 0 ? base : `${base}_${i + 1}`;
      const { error } = await sb.from("service_documents").insert({ municipality_id: ctx.municipality.id, service_id: p.data.serviceId, key, label: { fr: p.data.label }, required, max_size_kb: p.data.max });
      if (!error) { refresh(); return done(); }
      if (error.code !== "23505") return { error: dbErrorKey("forbidden") };   // seul un doublon de clé justifie un nouvel essai
    }
    return bad();
  }
  refresh(); return done();
}

export async function deleteDocumentAction(_p: ActionState, form: FormData): Promise<ActionState> {
  const id = uuid.safeParse(form.get("docId")); if (!id.success) return bad();
  const ctx = await getAdminContext();
  const { data, error } = await (await createServerSupabase()).from("service_documents").delete().eq("id", id.data).eq("municipality_id", ctx.municipality.id).select("id");
  if (error) return { error: dbErrorKey(error.message) };
  if (!data?.length) return { error: "adm.err.forbidden" };
  refresh(); return done();
}
