import { z } from "zod";

export const TEMPLATE_CODES = ["certificat_residence", "extrait_naissance"] as const;
export type TemplateCode = (typeof TEMPLATE_CODES)[number];

// Champs dérivés (calculés au rendu) : *_lettres, *_num (jj/mm/aaaa), filiation (Fils/Fille de), civilite (Monsieur/Madame), piece_label (CNIB/Passeport), signer_name.
const COMMON = ["document_number", "commune", "province", "region", "date_delivrance", "date_delivrance_num", "lieu_delivrance", "signer_name"];
/** Champs utilisables dans chaque modèle ({{champ}}). Tout autre nom est refusé. */
export const PLACEHOLDERS: Record<TemplateCode, string[]> = {
  certificat_residence: [...COMMON, "nom", "prenoms", "sexe", "date_naissance", "lieu_naissance", "date_naissance_num", "date_naissance_lettres", "civilite", "filiation", "type_piece", "piece_label", "numero_piece", "date_delivrance_piece", "date_delivrance_piece_num", "organisme_delivrance", "nom_pere", "nom_mere", "profession", "domicile"],
  extrait_naissance: [...COMMON, "numero_acte", "date_acte", "date_acte_num", "nom", "prenoms", "sexe", "filiation", "date_naissance", "date_naissance_num", "date_naissance_lettres", "heure_naissance", "lieu_naissance", "nom_pere", "nom_mere"],
};

const s = (max: number) => z.string().max(max);
const margin = z.number().min(5).max(40);

export const contentSchema = z.object({
  schema: z.literal(1),
  page: z.object({ margins_mm: z.object({ top: margin, right: margin, bottom: margin, left: margin }).strict(), font: z.enum(["serif", "sans"]), size_pt: z.number().min(9).max(14) }).strict(),
  header: z.object({ left: z.array(s(120)).max(8), right: z.array(s(120)).max(8), show_logo: z.boolean(), dashed: z.boolean().optional() }).strict(),
  layout: z.object({ mention_align: z.enum(["left", "center"]), reference_align: z.enum(["left", "center"]), title_style: z.enum(["underline", "banner"]), body_italic: z.boolean(), row_style: z.enum(["table", "leader"]) }).strict().optional(),
  mention: s(80), title: s(120).min(1), reference_line: s(160),
  blocks: z.array(z.discriminatedUnion("type", [
    z.object({ type: z.literal("paragraph"), text: s(1200) }).strict(),
    z.object({ type: z.literal("rows"), rows: z.array(z.object({ label: s(80), value: s(300), label2: s(80).optional(), value2: s(300).optional() }).strict()).max(30) }).strict(),
  ])).max(10),
  closing: z.object({ text: s(600), place_date: s(200) }).strict(),
  signature: z.object({ title_line: s(120), show_signature_box: z.boolean(), show_stamp_box: z.boolean(), show_tax_stamp_box: z.boolean(), tax_stamp_label: s(80), show_signer_name: z.boolean().optional() }).strict(),
}).strict();
export type TemplateContent = z.infer<typeof contentSchema>;

const PLACEHOLDER_RE = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;
export function strings(c: TemplateContent): string[] {
  return [...c.header.left, ...c.header.right, c.mention, c.title, c.reference_line, c.closing.text, c.closing.place_date, c.signature.title_line, c.signature.tax_stamp_label,
    ...c.blocks.flatMap((b) => (b.type === "paragraph" ? [b.text] : b.rows.flatMap((r) => [r.label, r.value, r.label2 ?? "", r.value2 ?? ""])))];
}
export function placeholdersIn(c: TemplateContent): string[] {
  return [...new Set(strings(c).flatMap((t) => [...t.matchAll(PLACEHOLDER_RE)].map((m) => m[1])))];
}

export type Validation = { ok: true; content: TemplateContent } | { ok: false; errors: string[] };
/** Validation stricte : structure, bornes et champs autorisés pour ce modèle. Utilisée à l'enregistrement ET au rendu (échec fermé). */
export function validateContent(raw: unknown, code: TemplateCode): Validation {
  const r = contentSchema.safeParse(raw);
  if (!r.success) return { ok: false, errors: r.error.issues.map((i) => `${i.path.join(".") || "contenu"} : ${i.message}`) };
  const unknown = placeholdersIn(r.data).filter((p) => !PLACEHOLDERS[code].includes(p));
  if (unknown.length) return { ok: false, errors: unknown.map((u) => `champ inconnu : {{${u}}}`) };
  return { ok: true, content: r.data };
}
