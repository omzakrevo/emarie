import { isoDateToFrenchWords } from "./french";
import type { TemplateContent, TemplateCode } from "./schema";

export const escapeHtml = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

export function formatValue(key: string, raw: string | undefined): string {
  const v = (raw ?? "").trim();
  if (!v) return "";
  if (/^date_/.test(key) && ISO.test(v)) { const [, y, m, d] = ISO.exec(v)!; return `${d} ${MONTHS[Number(m) - 1]} ${y}`; }   // « 02 septembre 2025 »
  if (key === "sexe") return v === "M" ? "Masculin" : v === "F" ? "Féminin" : v;
  if (key === "type_piece") return v === "cnib" ? "CNIB" : v === "passeport" ? "Passeport" : v;
  if (key === "heure_naissance" && /^\d{2}:\d{2}$/.test(v)) return `${v.slice(0, 2)}h${v.slice(3)}'`;                     // « 22h05' »
  return v;
}

/** Valeur d'un champ : stocké, ou DÉRIVÉ (jamais inventé : une donnée absente donne une chaîne vide, sauf formules neutres). */
function fieldValue(key: string, values: Record<string, string>): string {
  if (key in values) return formatValue(key, values[key]);
  const num = /^(date_[a-z_]+)_num$/.exec(key);
  if (num) { const m = ISO.exec(values[num[1]] ?? ""); return m ? `${m[3]}/${m[2]}/${m[1]}` : ""; }
  const words = /^(date_[a-z_]+)_lettres$/.exec(key);
  if (words) return isoDateToFrenchWords(values[words[1]] ?? "") ?? "";
  switch (key) {
    case "filiation": return values.sexe === "M" ? "Fils de" : values.sexe === "F" ? "Fille de" : "Fils/Fille de";
    case "civilite": return values.sexe === "M" ? "Monsieur" : values.sexe === "F" ? "Madame" : "Monsieur/Madame";
    case "piece_label": return values.type_piece === "cnib" ? "CNIB" : values.type_piece === "passeport" ? "Passeport" : "CNIB/Passeport";
    default: return "";
  }
}

/** Remplace {{champ}} par la valeur. `empty` = le texte contenait des champs et tous sont vides. */
export function resolve(template: string, values: Record<string, string>): { text: string; empty: boolean } {
  let found = 0, filled = 0;
  const text = template.replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, (_, k: string) => { found++; const v = fieldValue(k, values); if (v) filled++; return v; });
  return { text, empty: found > 0 && filled === 0 };
}

const FONT = { serif: "'DejaVu Serif','Liberation Serif','Times New Roman',serif", sans: "'DejaVu Sans','Liberation Sans',Arial,sans-serif" } as const;

export interface RenderOptions { specimen: boolean; logoDataUri?: string | null }
const SAFE_LOGO = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
/** En-têtes institutionnels : le modèle officiel est composé en capitales sans accents (REGION, LERABA). */
const plain = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const dash = (text: string) => "-".repeat(Math.max(6, Math.min(26, Math.round(text.length * 0.85))));

/** Contenu validé + valeurs figées -> HTML A4 autonome. Tout texte est échappé ; aucun script, aucune ressource externe. */
export function renderDocumentHtml(c: TemplateContent, values: Record<string, string>, o: RenderOptions): string {
  const R = (t: string) => resolve(t, values);
  const r = (t: string) => escapeHtml(R(t).text);
  const m = c.page.margins_mm;
  const L = c.layout ?? { mention_align: "center", reference_align: "center", title_style: "underline", body_italic: false, row_style: "table" };
  const logo = c.header.show_logo ? (o.logoDataUri && SAFE_LOGO.test(o.logoDataUri) ? `<img class="logo" src="${o.logoDataUri}" alt="">` : `<div class="logo ph">LOGO</div>`) : "<div></div>";

  const colLeft = c.header.left.map((x) => { const t = plain(R(x).text); return `<div class="hl">${escapeHtml(t)}</div>${c.header.dashed ? `<div class="dash">${dash(t)}</div>` : ""}`; }).join("");
  const colRight = c.header.right.map((x, i) => { const t = plain(R(x).text); const last = i === c.header.right.length - 1; return `<div class="${i === 0 ? "hl" : "sub"}">${escapeHtml(t)}</div>${c.header.dashed && !last ? `<div class="dash">${dash(t)}</div>` : ""}`; }).join("");

  const seg = (label: string, value: string, first = false) => `<span class="lb">${escapeHtml(label)}</span> <span class="vl">${escapeHtml(value)}</span><span class="fl${first ? " fl1" : ""}"></span>`;
  const blocks = c.blocks.map((b) => {
    if (b.type === "paragraph") return `<p class="para">${r(b.text)}</p>`;
    const lines = b.rows.map((row) => ({ a: { l: R(row.label).text, v: R(row.value) }, b: { l: R(row.label2 ?? "").text, v: R(row.value2 ?? "") } })).filter((x) => !x.a.v.empty);
    if (L.row_style === "leader")
      return lines.map((x) => `<div class="ld">${seg(x.a.l, x.a.v.text, !!x.b.v.text)}${x.b.v.text ? seg(x.b.l, x.b.v.text) : ""}</div>`).join("");
    return `<table class="rows">${lines.map((x) => `<tr><th>${escapeHtml(x.a.l)}</th><td>${escapeHtml(x.a.v.text)}${x.b.v.text ? ` ${escapeHtml(x.b.l)} ${escapeHtml(x.b.v.text)}` : ""}</td></tr>`).join("")}</table>`;
  }).join("");

  const sig = c.signature;
  const signerName = sig.show_signer_name ? R("{{signer_name}}").text : "";
  const title = c.title.split("\n").map((t) => r(t)).join("<br>");
  const align = (a: string) => (a === "left" ? "left" : "center");
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${escapeHtml(R(c.title.replace(/\n/g, " ")).text)}</title><style>
@page{size:A4;margin:${m.top}mm ${m.right}mm ${m.bottom}mm ${m.left}mm}
*{box-sizing:border-box}html,body{margin:0;padding:0}
body{font-family:${FONT[c.page.font]};font-size:${c.page.size_pt}pt;line-height:1.4;color:#111;position:relative${L.body_italic ? ";font-style:italic" : ""}}
.head{display:grid;grid-template-columns:1.3fr 30mm .85fr;gap:3mm;align-items:start;font-style:normal}
.hl{font-weight:700;text-transform:uppercase;font-size:${Math.max(9, c.page.size_pt - 1)}pt;line-height:1.25}.sub{font-size:${Math.max(8, c.page.size_pt - 2)}pt}
.dash{font-size:7pt;letter-spacing:.5px;line-height:1.1;margin:.4mm 0 1.2mm;color:#222}
.head .r{text-align:center}.head .r .hl{font-size:${Math.max(9, c.page.size_pt - 1)}pt}
.logo{max-height:30mm;max-width:34mm;margin:0 auto;display:block}.logo.ph{width:30mm;height:30mm;border:1px solid #888;color:#999;font-size:8pt;display:flex;align-items:center;justify-content:center}
.mention{text-align:${align(L.mention_align)};font-weight:700;text-transform:uppercase;margin-top:3mm;font-style:normal}
.refline{text-align:${align(L.reference_align)};font-weight:700;margin:2mm 0;font-style:normal}
.title{font-weight:700;font-size:${c.page.size_pt + 5}pt;margin:11mm 0 3mm;text-align:center;font-style:normal;${L.title_style === "underline" ? "text-decoration:underline;line-height:1.7" : "background:#111;color:#fff;font-style:italic;font-variant:small-caps;text-align:left;padding:2.5mm 7mm;width:80%;margin:8mm 0 10mm 10mm;font-weight:400;letter-spacing:.03em;text-decoration:none"}}
.para{margin:0 0 5mm;text-align:justify}
table.rows{width:100%;border-collapse:collapse;margin:0 0 6mm}.rows th{width:42%;text-align:left;font-weight:400;padding:1.6mm 2mm 1.6mm 0;vertical-align:top}.rows td{font-weight:700;padding:1.6mm 0;vertical-align:top}
.ld{display:flex;align-items:baseline;gap:2mm;margin:0 0 5.2mm}.ld .lb{${L.body_italic ? "" : "font-weight:700;"}white-space:nowrap}.ld .vl{white-space:pre-wrap}.ld .fl{flex:1;min-width:8mm;border-bottom:1.4px dotted #333;transform:translateY(-1.2px)}.ld .fl.fl1{flex:0 1 7mm;min-width:3mm}
.closing{margin-top:4mm;font-size:${Math.max(9, c.page.size_pt - 1)}pt}.place{text-align:right;margin:5mm 0 3mm}
.sig{display:grid;grid-template-columns:32mm 1fr 62mm;gap:4mm;margin-top:3mm;align-items:start;font-style:normal}
.box{height:30mm;border:1px dashed #666;font-size:7.5pt;color:#666;padding:1.5mm}.box.none{border:0}
.sigtitle{text-align:center;font-weight:700;margin-bottom:2mm}.signer{text-align:center;font-weight:700;text-decoration:underline;margin-top:2mm}
.wm{position:fixed;top:42%;left:0;right:0;text-align:center;transform:rotate(-28deg);font-size:46pt;font-weight:700;color:rgba(200,0,0,.16);letter-spacing:.06em;pointer-events:none;z-index:9;font-style:normal}
</style></head><body>
${o.specimen ? '<div class="wm">SPÉCIMEN<br><span style="font-size:20pt">MODÈLE NON VALIDÉ</span></div>' : ""}
<div class="head"><div class="l">${colLeft}${c.mention ? `<div class="mention">${r(c.mention)}</div>` : ""}</div>${logo}<div class="r">${colRight}</div></div>
${c.reference_line && L.reference_align === "left" ? `<div class="refline">${r(c.reference_line)}</div>` : ""}
<div class="title${L.title_style === "banner" ? " banner" : ""}">${title}</div>${c.reference_line && L.reference_align !== "left" ? `<div class="refline">${r(c.reference_line)}</div>` : ""}
${blocks}
${c.closing.text ? `<p class="closing">${r(c.closing.text)}</p>` : ""}${c.closing.place_date ? `<div class="place">${r(c.closing.place_date)}</div>` : ""}
<div class="sig"><div class="${sig.show_tax_stamp_box ? "box" : "box none"}">${sig.show_tax_stamp_box ? escapeHtml(sig.tax_stamp_label) : ""}</div>
<div class="${sig.show_stamp_box ? "box" : "box none"}">${sig.show_stamp_box ? "Cachet officiel" : ""}</div>
<div><div class="sigtitle">${r(sig.title_line)}</div><div class="${sig.show_signature_box ? "box" : "box none"}">${sig.show_signature_box ? "Signature" : ""}</div>${signerName ? `<div class="signer">${escapeHtml(signerName)}</div>` : ""}</div></div>
</body></html>`;
}

export function sampleData(code: TemplateCode): Record<string, string> {
  // Données ENTIÈREMENT FICTIVES (aucune personne réelle)
  const base = { document_number: "2026-001/EXEMPLE", commune: "Niankorodougou", province: "Léraba", region: "Tannounyan", lieu_delivrance: "Niankorodougou", date_delivrance: "2026-01-15",
    signer_name: "NOM Prénom (fictif)", nom: "EXEMPLE", prenoms: "Prénom Fictif", sexe: "M", date_naissance: "1990-05-17", lieu_naissance: "Ville fictive", nom_pere: "EXEMPLE Père", nom_mere: "EXEMPLE Mère" };
  return code === "extrait_naissance" ? { ...base, heure_naissance: "08:30", numero_acte: "000", date_acte: "1990-05-20" }
    : { ...base, type_piece: "cnib", numero_piece: "B00000000", date_delivrance_piece: "2022-03-01", organisme_delivrance: "ONI/Ville fictive", profession: "Profession fictive", domicile: "Quartier fictif" };
}
