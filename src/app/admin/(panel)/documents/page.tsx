import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { getT } from "@/i18n/server";
import { pickLocalized, type MessageKey } from "@/i18n/messages";
import { can, getAdminContext } from "@/server/admin/context";

const GROUPS: [string, MessageKey][] = [
  ["VALIDATED", "adm.doc.toGenerate"], ["DOCUMENT_GENERATED", "adm.doc.toPrint"], ["PRINTED", "adm.doc.toHand"],
  ["PENDING_SIGNATURE", "adm.doc.toSign"], ["SIGNED", "adm.doc.toRelease"], ["READY_FOR_PICKUP", "adm.doc.ready"],
];

export default async function Page({ searchParams }: PageProps<"/admin/documents">) {
  const ctx = await getAdminContext();
  if (!["documents.generate", "documents.print", "documents.sign_confirm", "documents.release", "documents.withdraw"].some((p) => can(ctx, p))) redirect("/admin?error=forbidden");
  const { t, locale } = await getT();
  const sp = await searchParams; const q = (typeof sp.q === "string" ? sp.q : "").toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 20);
  const sb = await createServerSupabase();
  let query = sb.from("applications").select("id, reference, status, services(name), application_data(data), issued_documents(is_specimen, status)").eq("municipality_id", ctx.municipality.id)
    .in("status", GROUPS.map(([s]) => s)).order("submitted_at", { ascending: true }).limit(300);
  if (q) query = query.ilike("reference", `%${q}%`);
  const { data } = await query;
  type Row = { id: string; reference: string; status: string; services: { name: Record<string, string> } | null; application_data: { data: Record<string, string> } | { data: Record<string, string> }[] | null; issued_documents: { is_specimen: boolean; status: string }[] };
  const rows = (data ?? []) as unknown as Row[];
  const nameOf = (r: Row) => { const d = Array.isArray(r.application_data) ? r.application_data[0]?.data : r.application_data?.data; return [d?.nom, d?.prenoms].filter(Boolean).join(" ") || "—"; };
  return (
    <div className="flex flex-col gap-5"><h1 className="text-2xl font-bold text-brand-900">{t("adm.doc.queue")}</h1>
      <form method="get" className="flex gap-2"><input name="q" defaultValue={q} placeholder="NIA-2026-0000" aria-label={t("adm.filter.search")} className="min-h-11 rounded-lg border border-slate-300 bg-surface px-3 text-sm" />
        <button className="min-h-11 rounded-lg bg-brand-700 px-4 text-sm font-semibold text-white">{t("adm.filter.apply")}</button></form>
      {GROUPS.map(([status, label]) => { const list = rows.filter((r) => r.status === status); return (
        <section key={status} className="rounded-2xl bg-surface p-4 shadow-sm"><h2 className="mb-2 font-semibold">{t(label)} <span className="text-slate-600">({list.length})</span></h2>
          {list.length === 0 ? <p className="text-sm text-slate-600">{t("adm.doc.queueEmpty")}</p> : (
            <ul className="flex flex-col gap-1">{list.map((r) => (
              <li key={r.id}><Link href={`/admin/demandes/${r.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 p-2 text-sm hover:border-brand-600">
                <span className="font-mono font-semibold">{r.reference}</span><span>{nameOf(r)}</span><span className="text-slate-600">{pickLocalized(r.services?.name, locale)}</span>
                {r.issued_documents?.some((d) => d.status !== "superseded" && d.is_specimen) && <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">SPÉCIMEN</span>}</Link></li>))}</ul>)}
        </section>); })}
    </div>);
}
