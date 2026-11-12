import { createServerSupabase } from "@/lib/supabase/server";
import { getT } from "@/i18n/server";
import { can, type AdminContext } from "@/server/admin/context";
import { DiscardForm, GenerateForm, SignForm, StepButton, WithdrawForm } from "@/app/admin/(panel)/demandes/[id]/doc-forms";

const card = "rounded-2xl bg-surface p-5 shadow-sm";
const SHOW = ["VALIDATED", "DOCUMENT_GENERATED", "PRINTED", "PENDING_SIGNATURE", "SIGNED", "READY_FOR_PICKUP", "WITHDRAWN"];

export async function DocumentPanel({ ctx, applicationId, status }: { ctx: AdminContext; applicationId: string; status: string }) {
  if (!SHOW.includes(status)) return null;
  const { t } = await getT();
  const sb = await createServerSupabase();
  const { data: docs } = await sb.from("issued_documents").select("id, document_number, is_specimen, status, template_version_id, document_template_versions(version)").eq("application_id", applicationId).neq("status", "superseded").order("created_at", { ascending: false }).limit(1);
  const doc = docs?.[0];
  const [{ data: sig }, { data: wd }] = doc ? await Promise.all([
    sb.from("signatures").select("signer_name, signer_title, confirmed_at").eq("issued_document_id", doc.id).maybeSingle(),
    sb.from("withdrawals").select("withdrawn_by_name, relationship, id_type, id_number_last4, withdrawn_at").eq("issued_document_id", doc.id).maybeSingle(),
  ]) : [{ data: null }, { data: null }];
  const version = (doc?.document_template_versions as unknown as { version: number } | null)?.version;
  return (
    <section className={card}><h2 className="mb-3 font-semibold">{t("adm.doc.title")}</h2>
      {doc?.is_specimen && <p role="note" className="mb-3 rounded-xl bg-red-50 p-3 text-sm font-medium text-red-800">{t("adm.doc.specimen")}</p>}
      {doc && doc.status !== "pending" && (<div className="mb-3 text-sm"><p><strong>{t("adm.doc.number")} :</strong> <span className="font-mono">{doc.document_number}</span> · {t("adm.doc.version")} {version}</p>
        <a href={`/api/admin/documents/${doc.id}/pdf`} target="_blank" rel="noreferrer" className="mt-1 inline-block font-semibold text-brand-700 underline">{t("adm.doc.open")}</a></div>)}
      {sig && <p className="mb-2 text-sm">{t("adm.doc.signedBy")} <strong>{sig.signer_name}</strong> ({sig.signer_title}) — {new Date(sig.confirmed_at).toLocaleString("fr-FR")}. {t("adm.doc.locked")}</p>}
      {wd && <p className="mb-2 text-sm">{t("adm.doc.withdrawnBy")} <strong>{wd.withdrawn_by_name}</strong> ({wd.relationship}), {wd.id_type.toUpperCase()} {t("adm.doc.idLast4")} {wd.id_number_last4} — {new Date(wd.withdrawn_at).toLocaleString("fr-FR")}</p>}
      <div className="flex flex-col gap-3">
        {status === "VALIDATED" && can(ctx, "documents.generate") && <GenerateForm applicationId={applicationId} />}
        {doc && status === "DOCUMENT_GENERATED" && can(ctx, "documents.print") && <StepButton applicationId={applicationId} docId={doc.id} kind="print" label={t("adm.doc.printed")} />}
        {doc && status === "PRINTED" && can(ctx, "documents.print") && <StepButton applicationId={applicationId} docId={doc.id} kind="hand" label={t("adm.doc.handed")} />}
        {doc && status === "PENDING_SIGNATURE" && can(ctx, "documents.sign_confirm") && <SignForm applicationId={applicationId} docId={doc.id} />}
        {doc && status === "SIGNED" && can(ctx, "documents.release") && <StepButton applicationId={applicationId} docId={doc.id} kind="release" label={t("adm.doc.release")} variant="accent" />}
        {doc && status === "READY_FOR_PICKUP" && can(ctx, "documents.withdraw") && <WithdrawForm applicationId={applicationId} docId={doc.id} />}
        {doc && ["DOCUMENT_GENERATED", "PRINTED", "PENDING_SIGNATURE"].includes(status) && can(ctx, "documents.generate") && <DiscardForm applicationId={applicationId} docId={doc.id} />}
      </div></section>
  );
}
