import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { getT } from "@/i18n/server";
import { getAdminContext, requireCan } from "@/server/admin/context";

export default async function Page() {
  const ctx = await getAdminContext(); requireCan(ctx, "templates.manage");
  const { t } = await getT();
  const sb = await createServerSupabase();
  const { data: tpls } = await sb.from("document_templates").select("id, code, name, document_template_versions(version, status, is_provisional)").eq("municipality_id", ctx.municipality.id).order("name");
  return (
    <div className="flex flex-col gap-4"><h1 className="text-2xl font-bold text-brand-900">{t("adm.tpl.title")}</h1>
      <p role="note" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{t("adm.tpl.notice")}</p>
      <ul className="flex flex-col gap-2">{(tpls ?? []).map((tp) => {
        const vs = (tp.document_template_versions as unknown as { version: number; status: string; is_provisional: boolean }[]) ?? [];
        const pub = vs.find((v) => v.status === "published");
        return (<li key={tp.id}><Link href={`/admin/modeles/${tp.code}`} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-surface p-4 hover:border-brand-600">
          <span className="font-semibold">{tp.name}</span>
          <span className="text-sm text-slate-600">{pub ? `v${pub.version} — ${pub.is_provisional ? t("adm.tpl.provisional") : t("adm.tpl.official")}` : "—"} · {vs.length} version(s)</span></Link></li>); })}</ul></div>);
}
