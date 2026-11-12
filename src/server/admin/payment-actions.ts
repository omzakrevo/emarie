"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";
import { dbErrorKey } from "@/features/admin/errors";
import { invalidTemplateVars } from "@/server/sms/provider";
import { processSmsQueue } from "@/server/sms/queue";
import { getProvider } from "@/server/payments/providers";
import { getAdminContext, can } from "./context";
import type { ActionState } from "./actions";

const uuid = z.string().uuid();
const bad = (): ActionState => ({ error: "adm.err.invalid_input" });
const done = (): ActionState => ({ ok: true, message: "adm.sv.saved" });

export async function requestRefundAction(_p: ActionState, form: FormData): Promise<ActionState> {
  const p = z.object({ payment: uuid, amount: z.coerce.number().int().min(1).max(10_000_000), reason: z.string().trim().min(3).max(300) })
    .safeParse({ payment: form.get("payment"), amount: form.get("amount"), reason: form.get("reason") });
  if (!p.success) return bad(); await getAdminContext();
  const { error } = await (await createServerSupabase()).rpc("request_refund", { p_payment: p.data.payment, p_amount_xof: p.data.amount, p_reason: p.data.reason });
  if (error) return { error: dbErrorKey(error.message) };
  revalidatePath("/admin/paiements"); return done();
}
export async function decideRefundAction(_p: ActionState, form: FormData): Promise<ActionState> {
  const id = uuid.safeParse(form.get("refund")); if (!id.success) return bad(); await getAdminContext();
  const { error } = await (await createServerSupabase()).rpc("decide_refund", { p_refund: id.data, p_approve: form.get("approve") === "true" });
  if (error) return { error: dbErrorKey(error.message) };
  revalidatePath("/admin/paiements"); return done();
}
export async function executeRefundAction(_p: ActionState, form: FormData): Promise<ActionState> {
  const id = uuid.safeParse(form.get("refund")); const ref = z.string().trim().min(3).max(120).safeParse(form.get("ref")); if (!id.success || !ref.success) return bad(); await getAdminContext();
  const { error } = await (await createServerSupabase()).rpc("mark_refund_executed", { p_refund: id.data, p_provider_reference: ref.data });
  if (error) return { error: dbErrorKey(error.message) };
  revalidatePath("/admin/paiements"); return done();
}

/** Active un moyen de paiement pour la commune — uniquement s'il est réellement utilisable sur ce serveur (jamais un prestataire non intégré). */
export async function setProviderEnabledAction(_p: ActionState, form: FormData): Promise<ActionState> {
  const provider = z.enum(["sandbox", "orange_money", "moov_money"]).safeParse(form.get("provider")); if (!provider.success) return bad();
  const enabled = form.get("enabled") === "true";
  const ctx = await getAdminContext(); if (!can(ctx, "municipality.settings.manage")) return { error: "adm.err.forbidden" };
  if (enabled && !getProvider(provider.data)?.availability().available) return { error: "adm.err.invalid_input" };
  const { error } = await (await createServerSupabase()).from("payment_provider_configs").upsert({ municipality_id: ctx.municipality.id, provider: provider.data, enabled, updated_at: new Date().toISOString() });
  if (error) return { error: "adm.err.forbidden" };
  revalidatePath("/admin/paiements"); revalidatePath("/demande"); return done();
}

// ---- SMS --------------------------------------------------------------------------------------------------------
export async function saveSmsTemplateAction(_p: ActionState, form: FormData): Promise<ActionState> {
  const id = uuid.safeParse(form.get("id")); const body = z.string().trim().min(5).max(320).safeParse(form.get("body"));
  if (!id.success || !body.success || invalidTemplateVars(body.data).length) return bad();
  const ctx = await getAdminContext();
  const { data, error } = await (await createServerSupabase()).from("notification_templates").update({ body: body.data, is_active: form.get("active") === "on", updated_at: new Date().toISOString() })
    .eq("id", id.data).eq("municipality_id", ctx.municipality.id).select("id");
  if (error || !data?.length) return { error: "adm.err.forbidden" };
  revalidatePath("/admin/sms"); return done();
}
export async function retryNotificationAction(_p: ActionState, form: FormData): Promise<ActionState> {
  const id = uuid.safeParse(form.get("id")); if (!id.success) return bad(); await getAdminContext();
  const { error } = await (await createServerSupabase()).rpc("retry_notification", { p_id: id.data });
  if (error) return { error: dbErrorKey(error.message) };
  revalidatePath("/admin/sms"); return done();
}
export async function processQueueNowAction(): Promise<ActionState> {
  const ctx = await getAdminContext(); if (!can(ctx, "sms.manage")) return { error: "adm.err.forbidden" };
  const r = await processSmsQueue(50); revalidatePath("/admin/sms");
  return r.skipped ? { error: "adm.err.generic" } : { ok: true, message: `${r.processed}` };
}
