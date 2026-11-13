"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { createServerSupabase } from "@/lib/supabase/server";
import { dbErrorKey } from "@/features/admin/errors";
import { validateNumberFormat } from "@/features/documents/number-format";
import { getAdminContext, can } from "./context";

export type ActionState = { ok?: boolean; message?: string; error?: string } | undefined;
const uuid = z.string().uuid();
const fail = (msg?: string | null): ActionState => ({ error: dbErrorKey(msg) });
const forbidden = (): ActionState => ({ error: "adm.err.forbidden" });

/** Transition de workflow : la base applique TOUTES les règles (statut, permission, motif, registre, paiement). */
export async function transitionAction(_p: ActionState, form: FormData): Promise<ActionState> {
  const id = uuid.safeParse(form.get("applicationId")); const to = z.string().max(40).safeParse(form.get("to"));
  if (!id.success || !to.success) return { error: "adm.err.invalid_input" };
  const note = String(form.get("note") ?? "").slice(0, 1000);
  await getAdminContext();
  const { error } = await (await createServerSupabase()).rpc("agent_transition", { p_application: id.data, p_to: to.data, p_public_note: note || null });
  if (error) return fail(error.message);
  revalidatePath(`/admin/demandes/${id.data}`); revalidatePath("/admin/demandes"); revalidatePath("/admin");
  return { ok: true };
}

export async function addNoteAction(_p: ActionState, form: FormData): Promise<ActionState> {
  const id = uuid.safeParse(form.get("applicationId")); const body = z.string().trim().min(1).max(2000).safeParse(form.get("body"));
  if (!id.success || !body.success) return { error: "adm.err.invalid_input" };
  const ctx = await getAdminContext();
  const { error } = await (await createServerSupabase()).from("application_notes")
    .insert({ municipality_id: ctx.municipality.id, application_id: id.data, author_id: ctx.userId, body: body.data });
  if (error) return fail("forbidden");
  revalidatePath(`/admin/demandes/${id.data}`);
  return { ok: true };
}

const REGISTRY_KEYS = ["nom", "prenoms", "sexe", "date_naissance", "heure_naissance", "lieu_naissance", "nom_pere", "nom_mere", "date_acte"] as const;
export async function registryCheckAction(_p: ActionState, form: FormData): Promise<ActionState> {
  const id = uuid.safeParse(form.get("applicationId"));
  const outcome = z.enum(["found", "not_found"]).safeParse(form.get("outcome"));
  if (!id.success || !outcome.success) return { error: "adm.err.invalid_input" };
  await getAdminContext();
  // Données relevées DANS LE REGISTRE (pas les données déclarées) : elles alimenteront le document.
  const data: Record<string, string> = {};
  if (outcome.data === "found") for (const k of REGISTRY_KEYS) { const v = String(form.get(`r_${k}`) ?? "").trim().slice(0, 200); if (v) data[k] = v; }
  const { error } = await (await createServerSupabase()).rpc("record_registry_check", {
    p_application: id.data, p_outcome: outcome.data, p_registry_ref: String(form.get("ref") ?? "").slice(0, 120),
    p_registry_data: outcome.data === "found" ? data : null, p_note: String(form.get("note") ?? "").slice(0, 500) || null,
  });
  if (error) return fail(error.message);
  revalidatePath(`/admin/demandes/${id.data}`);
  return { ok: true };
}

// ---- Agents ---------------------------------------------------------------------------------------------------
const agentSchema = z.object({ email: z.string().trim().toLowerCase().email().max(254), name: z.string().trim().min(2).max(120), roleId: uuid });

/** Crée/invite un agent : compte Supabase Auth (service_role, côté serveur seulement) puis rattachement via add_member (contrôles en base). */
export async function addAgentAction(_p: ActionState, form: FormData): Promise<ActionState> {
  const parsed = agentSchema.safeParse({ email: form.get("email"), name: form.get("name"), roleId: form.get("roleId") });
  if (!parsed.success) return { error: "adm.err.invalid_input" };
  const ctx = await getAdminContext();
  if (!can(ctx, "agents.manage")) return forbidden();
  const sb = await createServerSupabase();
  // Pré-contrôle SANS effet de bord : on n'invite aucun compte si l'attribution du rôle serait refusée par la base.
  const { data: allowed } = await sb.rpc("can_assign_role", { p_municipality: ctx.municipality.id, p_role: parsed.data.roleId });
  if (allowed !== true) return { error: "adm.err.role_escalation" };

  const admin = createAdminSupabase();
  const { data: existing } = await admin.from("profiles").select("id").eq("email", parsed.data.email).maybeSingle();
  let profileId = existing?.id as string | undefined; let invited = false;
  if (!profileId) {
    const { data, error } = await admin.auth.admin.inviteUserByEmail(parsed.data.email, {
      data: { full_name: parsed.data.name }, redirectTo: `${(await originUrl())}/admin/confirm`,
    });
    if (error || !data.user) return { error: "adm.ag.inviteFailed" };
    profileId = data.user.id; invited = true;
  }
  const { error } = await sb.rpc("add_member", { p_municipality: ctx.municipality.id, p_profile: profileId, p_role: parsed.data.roleId });
  if (error) return fail(error.message);
  revalidatePath("/admin/agents");
  return { ok: true, message: invited ? "adm.ag.invited" : "adm.ag.added" };
}

async function originUrl() {
  const { headers } = await import("next/headers");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  return `${h.get("x-forwarded-proto") ?? "https"}://${host}`;
}

export async function setMemberRoleAction(_p: ActionState, form: FormData): Promise<ActionState> {
  const m = uuid.safeParse(form.get("memberId")); const r = uuid.safeParse(form.get("roleId"));
  if (!m.success || !r.success) return { error: "adm.err.invalid_input" };
  await getAdminContext();
  const { error } = await (await createServerSupabase()).rpc("set_member_role", { p_member: m.data, p_role: r.data });
  if (error) return fail(error.message);
  revalidatePath("/admin/agents"); return { ok: true };
}
export async function setMemberActiveAction(_p: ActionState, form: FormData): Promise<ActionState> {
  const m = uuid.safeParse(form.get("memberId"));
  if (!m.success) return { error: "adm.err.invalid_input" };
  await getAdminContext();
  const { error } = await (await createServerSupabase()).rpc("set_member_active", { p_member: m.data, p_active: form.get("active") === "true" });
  if (error) return fail(error.message);
  revalidatePath("/admin/agents"); return { ok: true };
}
export async function setRolePermissionAction(roleId: string, permission: string, granted: boolean): Promise<ActionState> {
  if (!uuid.safeParse(roleId).success || !/^[a-z_.]{3,60}$/.test(permission)) return { error: "adm.err.invalid_input" };
  await getAdminContext();
  const { error } = await (await createServerSupabase()).rpc("set_role_permission", { p_role: roleId, p_permission: permission, p_granted: granted });
  if (error) return fail(error.message);
  revalidatePath("/admin/roles"); return { ok: true };
}

// ---- Paramètres ------------------------------------------------------------------------------------------------
const settingsSchema = z.object({
  about_mairie: z.string().max(5000), about_commune: z.string().max(5000), opening_hours: z.string().max(1000),
  address: z.string().max(300), phone: z.string().max(40), email: z.string().max(254),
  signer_name: z.string().trim().max(120), cr_number_format: z.string().trim().max(60).refine((f) => f === "" || validateNumberFormat(f)),
});
export async function saveSettingsAction(_p: ActionState, form: FormData): Promise<ActionState> {
  const parsed = settingsSchema.safeParse(Object.fromEntries(["about_mairie","about_commune","opening_hours","address","phone","email","signer_name","cr_number_format"].map((k) => [k, String(form.get(k) ?? "")])));
  if (!parsed.success) return { error: "adm.err.invalid_input" };
  const ctx = await getAdminContext();
  if (!can(ctx, "municipality.settings.manage")) return forbidden();
  const sb = await createServerSupabase(); const mid = ctx.municipality.id; const d = parsed.data;
  const rows = [
    { municipality_id: mid, key: "public.about_mairie", value: { fr: d.about_mairie } },
    { municipality_id: mid, key: "public.about_commune", value: { fr: d.about_commune } },
    { municipality_id: mid, key: "public.opening_hours", value: { fr: d.opening_hours } },
    { municipality_id: mid, key: "workflow.skip_payment", value: { enabled: form.get("skip_payment") === "on" } },
    { municipality_id: mid, key: "documents.signer_name", value: { name: d.signer_name } },
    ...(d.cr_number_format ? [{ municipality_id: mid, key: "documents.number_format.CR", value: { format: d.cr_number_format } }] : []),
  ];
  const a = await sb.from("municipality_settings").upsert(rows);
  const b = await sb.from("municipalities").update({ address: d.address || null, contacts: { phone: d.phone || undefined, email: d.email || undefined } }).eq("id", mid);
  if (a.error || b.error) return fail("forbidden");
  revalidatePath("/", "layout"); return { ok: true, message: "adm.st.saved" };
}

export async function setPasswordAction(_p: ActionState, form: FormData): Promise<ActionState> {
  const pw = z.string().min(12).max(200).safeParse(form.get("password"));
  if (!pw.success) return { error: "adm.err.invalid_input" };
  const { error } = await (await createServerSupabase()).auth.updateUser({ password: pw.data });
  return error ? { error: "adm.err.generic" } : { ok: true };
}
