import type { TemplateContent } from "./schema";

/** Valeurs du formulaire d'édition d'un modèle (champs simples) <-> contenu structuré. */
export interface EditorValues {
  title: string; mention: string; reference_line: string; header_left: string; header_right: string; show_logo: boolean;
  margin_top: string; margin_right: string; margin_bottom: string; margin_left: string; font: "serif" | "sans"; size_pt: string;
  intro: string; rows: string; closing_text: string; place_date: string; title_line: string;
  show_signature_box: boolean; show_stamp_box: boolean; show_tax_stamp_box: boolean; tax_stamp_label: string;
}
const lines = (t: string) => t.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

export function valuesFromContent(c: TemplateContent): EditorValues {
  const para = c.blocks.find((b) => b.type === "paragraph"); const rows = c.blocks.find((b) => b.type === "rows");
  return { title: c.title, mention: c.mention, reference_line: c.reference_line, header_left: c.header.left.join("\n"), header_right: c.header.right.join("\n"), show_logo: c.header.show_logo,
    margin_top: String(c.page.margins_mm.top), margin_right: String(c.page.margins_mm.right), margin_bottom: String(c.page.margins_mm.bottom), margin_left: String(c.page.margins_mm.left), font: c.page.font, size_pt: String(c.page.size_pt),
    intro: para?.type === "paragraph" ? para.text : "", rows: rows?.type === "rows" ? rows.rows.map((r) => `${r.label} | ${r.value}`).join("\n") : "",
    closing_text: c.closing.text, place_date: c.closing.place_date, title_line: c.signature.title_line,
    show_signature_box: c.signature.show_signature_box, show_stamp_box: c.signature.show_stamp_box, show_tax_stamp_box: c.signature.show_tax_stamp_box, tax_stamp_label: c.signature.tax_stamp_label };
}

/** Reconstruit un contenu (à valider ensuite par validateContent) ; les blocs non éditables de `base` sont conservés. */
export function contentFromForm(get: (k: string) => string | null, base: TemplateContent): unknown {
  const bool = (k: string) => get(k) === "on";
  const intro = get("intro") ?? ""; const rows = lines(get("rows") ?? "").map((l) => { const i = l.indexOf("|"); return i < 0 ? { label: l, value: "" } : { label: l.slice(0, i).trim(), value: l.slice(i + 1).trim() }; });
  let usedP = false, usedR = false;
  const blocks = base.blocks.map((b) => {
    if (b.type === "paragraph" && !usedP) { usedP = true; return { type: "paragraph" as const, text: intro }; }
    if (b.type === "rows" && !usedR) { usedR = true; return { type: "rows" as const, rows }; }
    return b;
  });
  if (!usedP && intro) blocks.unshift({ type: "paragraph", text: intro });
  if (!usedR && rows.length) blocks.push({ type: "rows", rows });
  return {
    schema: 1,
    page: { margins_mm: { top: Number(get("margin_top")), right: Number(get("margin_right")), bottom: Number(get("margin_bottom")), left: Number(get("margin_left")) }, font: get("font"), size_pt: Number(get("size_pt")) },
    header: { left: lines(get("header_left") ?? ""), right: lines(get("header_right") ?? ""), show_logo: bool("show_logo") },
    mention: (get("mention") ?? "").trim(), title: (get("title") ?? "").trim(), reference_line: (get("reference_line") ?? "").trim(),
    blocks: blocks.filter((b) => (b.type === "paragraph" ? b.text.trim() !== "" : b.rows.length > 0)),
    closing: { text: (get("closing_text") ?? "").trim(), place_date: (get("place_date") ?? "").trim() },
    signature: { title_line: (get("title_line") ?? "").trim(), show_signature_box: bool("show_signature_box"), show_stamp_box: bool("show_stamp_box"), show_tax_stamp_box: bool("show_tax_stamp_box"), tax_stamp_label: (get("tax_stamp_label") ?? "").trim() },
  };
}
