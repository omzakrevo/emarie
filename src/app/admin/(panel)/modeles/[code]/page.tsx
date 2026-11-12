import { notFound } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { getT } from "@/i18n/server";
import { valuesFromContent } from "@/features/documents/form";
import { PLACEHOLDERS, TEMPLATE_CODES, validateContent, type TemplateCode } from "@/features/documents/schema";
import { getAdminContext, requireCan, can } from "@/server/admin/context";
import { CreateDraftForm, DeleteDraftForm, Editor, PublishForm } from "./editor";

export default async function Page({ params, searchParams }: PageProps<"/admin/modeles/[code]">) {
  const { code } = await params; const sp = await searchParams;
  if (!TEMPLATE_CODES.includes(code as TemplateCode)) notFound();
  const ctx = await getAdminContext(); requireCan(ctx, "templates.manage");
  const { t } = await getT();
  const sb = await createServerSupabase();
  const { data: tpl } = await sb.from("document_templates").select("id, name").eq("municipality_id", ctx.municipality.id).eq("code", code).maybeSingle();
  if (!tpl) notFound();
  const { data: versions } = await sb.from("document_template_versions").select("id, version, status, is_provisional, content, published_at, validated_at").eq("template_id", tpl.id).order("version", { ascending: false });
  const list = versions ?? [];
  const wanted = typeof sp.v === "string" ? Number(sp.v) : NaN;
  const current = list.find((v) => v.version === wanted) ?? list.find((v) => v.status === "draft") ?? list.find((v) => v.status === "published") ?? list[0];
  if (!current) notFound();
  const parsed = validateContent(current.content, code as TemplateCode);
  const label = (s: string) => (s === "published" ? t("adm.tpl.published") : s === "archived" ? t("adm.tpl.archived") : t("adm.tpl.draft"));
  return (
    <div className="flex flex-col gap-5"><h1 className="text-2xl font-bold text-brand-900">{tpl.name}</h1>
      <p role="note" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{t("adm.tpl.notice")}</p>
      <ul className="flex flex-wrap gap-2">{list.map((v) => (
        <li key={v.id}><a href={`?v=${v.version}`} aria-current={v.id === current.id} className={`inline-block rounded-full border px-3 py-1 text-sm ${v.id === current.id ? "border-brand-600 bg-brand-50 font-semibold" : "border-slate-300"}`}>
          v{v.version} · {label(v.status)}{v.status !== "draft" ? ` · ${v.is_provisional ? t("adm.tpl.provisional") : t("adm.tpl.official")}` : ""}</a></li>))}</ul>
      {!parsed.ok ? <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{parsed.errors.join(" ; ")}</p> :
        <Editor key={current.id} versionId={current.id} v={valuesFromContent(parsed.content)} placeholders={PLACEHOLDERS[code as TemplateCode]} readOnly={current.status !== "draft"} />}
      <div className="flex flex-wrap gap-3">
        {can(ctx, "templates.manage") && <CreateDraftForm fromVersionId={current.id} />}
        {current.status === "draft" && can(ctx, "templates.publish") && <PublishForm versionId={current.id} />}
        {current.status === "draft" && <DeleteDraftForm versionId={current.id} />}</div>
    </div>);
}

export const maxDuration = 60;   // actions serveur de génération/prévisualisation PDF
