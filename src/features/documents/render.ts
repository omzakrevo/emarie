import type { TemplateContent, TemplateCode } from "./schema";

export const escapeHtml = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

export function formatValue(key: string, raw: string | undefined): string {
  const v = (raw ?? "").trim();
  if (!v) return "";
  if (/^date_/.test(key) && /^\d{4}-\d{2}-\d{2}$/.test(v)) { const [y, m, d] = v.split("-").map(Number); return `${d === 1 ? "1er" : d} ${MONTHS[m - 1]} ${y}`; }
  if (key === "sexe") return v === "M" ? "Masculin" : v === "F" ? "Féminin" : v;
  if (key === "type_piece") return v === "cnib" ? "CNIB" : v === "passeport" ? "Passeport" : v;
  if (key === "heure_naissance" && /^\d{2}:\d{2}$/.test(v)) return `${v.slice(0, 2)} h ${v.slice(3)}`;
  return v;
}

/** Remplace {{champ}} par la valeur formatée. `empty` = le texte contenait des champs et tous sont vides. */
export function resolve(template: string, values: Record<string, string>): { text: string; empty: boolean } {
  let found = 0, filled = 0;
  const text = template.replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, (_, k: string) => { found++; const v = formatValue(k, values[k]); if (v) filled++; return v; });
  return { text, empty: found > 0 && filled === 0 };
}

const FONT = { serif: "'DejaVu Serif','Liberation Serif','Times New Roman',serif", sans: "'DejaVu Sans','Liberation Sans',Arial,sans-serif" } as const;

export interface RenderOptions { specimen: boolean; logoDataUri?: string | null }
const SAFE_LOGO = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;

/** Contenu validé + valeurs figées -> HTML A4 autonome. Tout texte est échappé ; aucun script, aucune ressource externe. */
export function renderDocumentHtml(c: TemplateContent, values: Record<string, string>, o: RenderOptions): string {
  const r = (t: string) => escapeHtml(resolve(t, values).text);
  const m = c.page.margins_mm;
  const logo = c.header.show_logo ? (o.logoDataUri && SAFE_LOGO.test(o.logoDataUri) ? `<img class="logo" src="${o.logoDataUri}" alt="">` : `<div class="logo ph">LOGO</div>`) : "<div></div>";
  const blocks = c.blocks.map((b) => {
    if (b.type === "paragraph") return `<p class="para">${r(b.text)}</p>`;
    const rows = b.rows.map((row) => ({ label: row.label, res: resolve(row.value, values) })).filter((x) => !x.res.empty)
      .map((x) => `<tr><th>${escapeHtml(x.label)}</th><td>${escapeHtml(x.res.text)}</td></tr>`).join("");
    return `<table class="rows">${rows}</table>`;
  }).join("");
  const sig = c.signature;
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${r(c.title)}</title><style>
@page{size:A4;margin:${m.top}mm ${m.right}mm ${m.bottom}mm ${m.left}mm}
*{box-sizing:border-box}html,body{margin:0;padding:0}
body{font-family:${FONT[c.page.font]};font-size:${c.page.size_pt}pt;line-height:1.45;color:#111;position:relative}
.head{display:grid;grid-template-columns:1fr 28mm 1fr;gap:6mm;align-items:start;font-size:${Math.max(8, c.page.size_pt - 1.5)}pt}
.head .l{text-align:left;font-weight:700}.head .rr{text-align:right;font-weight:700}
.logo{max-height:24mm;max-width:28mm;margin:0 auto;display:block}.logo.ph{width:24mm;height:24mm;border:1px dashed #888;color:#888;font-size:8pt;display:flex;align-items:center;justify-content:center}
.mention{text-align:center;font-weight:700;letter-spacing:.12em;margin-top:8mm}
.title{text-align:center;font-weight:700;font-size:${c.page.size_pt + 5}pt;margin:5mm 0 2mm;text-decoration:underline}
.ref{text-align:center;margin-bottom:8mm}
.para{margin:0 0 5mm;text-align:justify}
table.rows{width:100%;border-collapse:collapse;margin:0 0 6mm}.rows th{width:42%;text-align:left;font-weight:400;padding:1.6mm 2mm 1.6mm 0;vertical-align:top}.rows td{font-weight:700;padding:1.6mm 0;vertical-align:top}
.closing{margin-top:6mm}.place{text-align:right;margin:8mm 0 6mm}
.sig{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6mm;margin-top:6mm}
.box{height:34mm;border:1px dashed #666;font-size:8pt;color:#666;padding:1.5mm}.box.none{border:0}
.sigtitle{text-align:center;font-weight:700;margin-bottom:2mm}
.wm{position:fixed;top:42%;left:0;right:0;text-align:center;transform:rotate(-28deg);font-size:46pt;font-weight:700;color:rgba(200,0,0,.16);letter-spacing:.06em;pointer-events:none;z-index:9}
</style></head><body>
${o.specimen ? '<div class="wm">SPÉCIMEN<br><span style="font-size:20pt">MODÈLE NON VALIDÉ</span></div>' : ""}
<div class="head"><div class="l">${c.header.left.map((x) => `<div>${r(x)}</div>`).join("")}</div>${logo}<div class="rr">${c.header.right.map((x) => `<div>${r(x)}</div>`).join("")}</div></div>
${c.mention ? `<div class="mention">${r(c.mention)}</div>` : ""}<div class="title">${r(c.title)}</div>${c.reference_line ? `<div class="ref">${r(c.reference_line)}</div>` : ""}
${blocks}
${c.closing.text ? `<p class="closing">${r(c.closing.text)}</p>` : ""}${c.closing.place_date ? `<div class="place">${r(c.closing.place_date)}</div>` : ""}
<div class="sig"><div class="${sig.show_tax_stamp_box ? "box" : "box none"}">${sig.show_tax_stamp_box ? escapeHtml(sig.tax_stamp_label) : ""}</div>
<div class="${sig.show_stamp_box ? "box" : "box none"}">${sig.show_stamp_box ? "Cachet officiel" : ""}</div>
<div><div class="sigtitle">${r(sig.title_line)}</div><div class="${sig.show_signature_box ? "box" : "box none"}">${sig.show_signature_box ? "Signature" : ""}</div></div></div>
</body></html>`;
}

export function sampleData(code: TemplateCode): Record<string, string> {
  const base = { document_number: "EXEMPLE-0000", commune: "Commune d'exemple", province: "Province d'exemple", region: "Région d'exemple", lieu_delivrance: "Commune d'exemple", date_delivrance: "2026-01-15",
    nom: "NOM FICTIF", prenoms: "Prénom Fictif", sexe: "F", date_naissance: "1990-05-17", lieu_naissance: "Ville fictive", nom_pere: "Père Fictif", nom_mere: "Mère Fictive" };
  return code === "extrait_naissance" ? { ...base, heure_naissance: "08:30", numero_acte: "ACTE-FICTIF-000" }
    : { ...base, type_piece: "cnib", numero_piece: "B0000000", date_delivrance_piece: "2022-03-01", organisme_delivrance: "Organisme fictif", profession: "Profession fictive", domicile: "Quartier fictif, village fictif" };
}
