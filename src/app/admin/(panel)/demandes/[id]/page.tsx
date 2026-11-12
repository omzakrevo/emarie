import Link from "next/link";
import { notFound } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { getT } from "@/i18n/server";
import { pickLocalized } from "@/i18n/messages";
import { visibleFields } from "@/features/demande/fields";
import type { FieldDef } from "@/features/demande/types";
import { can, getAdminContext, requireCan } from "@/server/admin/context";
import { DocumentPanel } from "@/components/admin/document-panel";
import { NoteForm, RegistryForm, TransitionForm } from "./forms";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const card = "rounded-2xl bg-surface p-5 shadow-sm";

export default async function Page({ params }: PageProps<"/admin/demandes/[id]">) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const ctx = await getAdminContext(); requireCan(ctx, "applications.read");
  const { t, locale } = await getT();
  const sb = await createServerSupabase(); const mid = ctx.municipality.id;
  // Toutes ces lectures passent par la RLS : un dossier d'une autre commune est simplement introuvable.
  const { data: app } = await sb.from("applications").select("id, reference, status, submitted_at, contact_phone, service_id, services(code, name)").eq("id", id).eq("municipality_id", mid).maybeSingle();
  if (!app) notFound();
  const service = app.services as unknown as { code: string; name: Record<string, string> };
  const [{ data: dataRow }, { data: fieldRows }, { data: files }, { data: events }, { data: notes }, { data: transitions }, { data: checks }, { data: skip }] = await Promise.all([
    sb.from("application_data").select("data").eq("application_id", id).maybeSingle(),
    sb.from("service_fields").select("key,label,type,required,options,visible_if,step,sort_order").eq("service_id", app.service_id),
    sb.from("application_files").select("id, document_key, original_name, mime_type, size_bytes").eq("application_id", id).order("created_at"),
    sb.from("application_events").select("to_status, actor_type, public_note, created_at").eq("application_id", id).order("created_at"),
    sb.from("application_notes").select("id, body, created_at, profiles(full_name)").eq("application_id", id).order("created_at"),
    sb.from("workflow_transitions").select("to_status, permission, requires_note").eq("from_status", app.status).eq("enabled", true),
    sb.from("civil_registry_checks").select("outcome, registry_ref, note, checked_at, seq").eq("application_id", id).order("seq", { ascending: false }).limit(1),
    sb.from("municipality_settings").select("value").eq("municipality_id", mid).eq("key", "workflow.skip_payment").maybeSingle(),
  ]);
  const data = (dataRow?.data ?? {}) as Record<string, string>;
  const fields = (fieldRows ?? []) as unknown as FieldDef[];
  const isCivil = service.code === "extrait_naissance";
  const paymentBlocked = app.status === "SUBMITTED" && (skip?.value as { enabled?: boolean } | null)?.enabled !== true;
  const actions = (transitions ?? []).filter((x) => can(ctx, x.permission) && !(paymentBlocked && x.to_status === "UNDER_REVIEW"));
  const lastCheck = checks?.[0];
  return (
    <div className="flex flex-col gap-5">
      <Link href="/admin/demandes" className="text-sm font-semibold text-brand-700 underline">← {t("adm.d.back")}</Link>
      <header className={card}>
        <p className="font-mono text-2xl font-bold">{app.reference}</p>
        <p className="text-slate-600">{pickLocalized(service.name, locale)}</p>
        <p className="mt-2 inline-block rounded-full bg-brand-50 px-3 py-1 font-medium text-brand-900" data-testid="status">{t(`status.${app.status}` as never)}</p>
      </header>

      <section className={card}><h2 className="mb-1 font-semibold">{t("adm.d.applicant")}</h2><p className="mb-3 text-xs text-slate-500">{t("adm.d.declared")}</p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          {visibleFields(fields, data).map((f) => { const v = data[f.key]; const opt = f.options?.find((o) => o.value === v);
            return <div key={f.key} className="contents"><dt className="text-slate-600">{pickLocalized(f.label, locale)}</dt><dd className="font-medium">{v ? (opt ? pickLocalized(opt.label, locale) : v) : "—"}</dd></div>; })}
        </dl></section>

      <section className={card}><h2 className="mb-2 font-semibold">{t("adm.d.files")}</h2>
        {!files?.length ? <p className="text-sm text-slate-600">{t("adm.d.noFiles")}</p> :
          <ul className="flex flex-col gap-2 text-sm">{files.map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-2"><span className="truncate">{f.original_name} <span className="text-slate-500">({(f.size_bytes / 1024).toFixed(0)} Ko)</span></span>
              <a href={`/api/admin/files/${f.id}`} target="_blank" rel="noreferrer" className="shrink-0 font-semibold text-brand-700 underline">{t("adm.d.download")}</a></li>))}</ul>}
      </section>

      {isCivil && (can(ctx, "civil_registry.verify") || lastCheck) && (
        <section className={card}><h2 className="mb-1 font-semibold">{t("adm.reg.title")}</h2><p className="mb-3 text-sm text-slate-600">{t("adm.reg.hint")}</p>
          <p className="mb-3 text-sm" data-testid="registry-latest">{lastCheck ? <><strong>{t("adm.reg.latest")} :</strong> {lastCheck.outcome === "found" ? `${t("adm.reg.found")} — ${lastCheck.registry_ref}` : t("adm.reg.notFound")}</> : t("adm.reg.none")}</p>
          {can(ctx, "civil_registry.verify") && app.status === "UNDER_REVIEW" && <RegistryForm applicationId={id} declared={data} />}</section>)}

      <section className={card}><h2 className="mb-2 font-semibold">{t("adm.d.actions")}</h2>
        {paymentBlocked && <p className="mb-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{t("adm.d.paymentGate")}</p>}
        {actions.length === 0 ? <p className="text-sm text-slate-600">{t("adm.d.noActions")}</p> :
          <div className="grid gap-3 sm:grid-cols-2">{actions.map((a) => <TransitionForm key={a.to_status} applicationId={id} to={a.to_status} needsNote={a.requires_note} />)}</div>}
      </section>

      <DocumentPanel ctx={ctx} applicationId={id} status={app.status} />

      <section className={card}><h2 className="mb-1 font-semibold">{t("adm.d.notes")}</h2><p className="mb-3 text-xs text-slate-500">{t("adm.d.notesHint")}</p>
        <ul className="mb-3 flex flex-col gap-2 text-sm">{(notes ?? []).map((n) => (
          <li key={n.id} className="rounded-xl bg-slate-50 p-2"><p>{n.body}</p><p className="text-xs text-slate-500">{(n.profiles as unknown as { full_name: string | null } | null)?.full_name ?? "—"} · {new Date(n.created_at).toLocaleString("fr-FR")}</p></li>))}</ul>
        {can(ctx, "applications.review") && <NoteForm applicationId={id} />}</section>

      <section className={card}><h2 className="mb-2 font-semibold">{t("adm.d.history")}</h2>
        <ol className="flex flex-col gap-2 text-sm">{(events ?? []).map((e, i) => (
          <li key={i} className="border-l-2 border-accent-600 pl-3"><span className="font-medium">{t(`status.${e.to_status}` as never)}</span> <span className="text-slate-500">({e.actor_type}) {new Date(e.created_at).toLocaleString("fr-FR")}</span>
            {e.public_note && <p className="text-slate-700">{e.public_note}</p>}</li>))}</ol></section>
    </div>
  );
}
