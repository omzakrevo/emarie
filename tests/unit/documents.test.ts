import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PLACEHOLDERS, validateContent, type TemplateCode } from "@/features/documents/schema";
import { escapeHtml, formatValue, renderDocumentHtml, resolve, sampleData } from "@/features/documents/render";

// Les modèles seed (SQL) sont extraits et validés avec le même schéma que celui du rendu.
const sql = readdirSync(join(process.cwd(), "supabase/migrations")).filter((f) => f.startsWith("0009")).map((f) => readFileSync(join(process.cwd(), "supabase/migrations", f), "utf8")).join("\n");
const seeds = [...sql.matchAll(/\$json\$([\s\S]*?)\$json\$/g)].map((m) => JSON.parse(m[1]));
const CODES: TemplateCode[] = ["certificat_residence", "extrait_naissance"];

describe("modèles provisoires (seed)", () => {
  it("deux modèles valides", () => { expect(seeds).toHaveLength(2); seeds.forEach((s, i) => { const v = validateContent(s, CODES[i]); expect(v.ok, JSON.stringify(v)).toBe(true); }); });
  it("ne contiennent ni donnée personnelle, ni numéro, ni tarif, ni signature d'exemple", () => {
    const txt = JSON.stringify(seeds);
    expect(txt).not.toMatch(/\d{3,}/); expect(txt).not.toMatch(/FCFA|\b300\b|\b500\b/);
  });
  it("les textes juridiques provisoires sont signalés", () => { expect(JSON.stringify(seeds)).toContain("[TEXTE PROVISOIRE]"); });
});

describe("validation du contenu", () => {
  const base = seeds[0];
  it("refuse un champ inconnu pour ce modèle", () => {
    const bad = structuredClone(base); bad.title = "Titre {{numero_acte}}";
    const v = validateContent(bad, "certificat_residence");
    expect(v.ok).toBe(false); expect(JSON.stringify(v)).toContain("numero_acte");
    const ok = structuredClone(seeds[1]); ok.title = "Titre {{numero_acte}}";
    expect(validateContent(ok, "extrait_naissance").ok).toBe(true);
  });
  it("refuse clés supplémentaires, marges hors bornes, polices libres", () => {
    expect(validateContent({ ...base, evil: 1 }, "certificat_residence").ok).toBe(false);
    const m = structuredClone(base); m.page.margins_mm.top = 200; expect(validateContent(m, "certificat_residence").ok).toBe(false);
    const f = structuredClone(base); f.page.font = "Comic; } body{display:none"; expect(validateContent(f, "certificat_residence").ok).toBe(false);
  });
  it("chaque champ autorisé est connu des deux jeux de données d'exemple", () => {
    for (const c of CODES) for (const p of PLACEHOLDERS[c]) expect(Object.keys(sampleData(c)), `${c}:${p}`).toContain(p);
  });
});

describe("rendu HTML", () => {
  const c = (i: number) => { const v = validateContent(seeds[i], CODES[i]); if (!v.ok) throw new Error("seed"); return v.content; };
  it("injecte les valeurs figées et formate dates/sexe", () => {
    const html = renderDocumentHtml(c(0), { ...sampleData("certificat_residence"), nom: "DUPONT" }, { specimen: false });
    expect(html).toContain("DUPONT"); expect(html).toContain("17 mai 1990"); expect(html).toContain("CNIB"); expect(html).toContain("@page{size:A4");
    expect(html).not.toContain("SPÉCIMEN");
  });
  it("filigrane SPÉCIMEN pour un modèle non validé", () => { expect(renderDocumentHtml(c(0), sampleData("certificat_residence"), { specimen: true })).toContain("SPÉCIMEN"); });
  it("échappe toute valeur (injection HTML/JS impossible)", () => {
    const html = renderDocumentHtml(c(0), { ...sampleData("certificat_residence"), nom: '<script>alert(1)</script>"><img src=x onerror=alert(1)>' }, { specimen: false });
    expect(html).not.toMatch(/<script/i); expect(html).not.toMatch(/<img src=x/i); expect(html).toContain("&lt;script&gt;");
  });
  it("échappe aussi les textes du modèle et refuse un logo non conforme", () => {
    const m = structuredClone(c(0)); m.title = "<b>X</b>";
    const html = renderDocumentHtml(m, sampleData("certificat_residence"), { specimen: false, logoDataUri: 'javascript:alert(1)"' });
    expect(html).not.toContain("<b>X</b>"); expect(html).not.toContain("javascript:"); expect(html).toContain("LOGO");
    expect(renderDocumentHtml(c(0), sampleData("certificat_residence"), { specimen: false, logoDataUri: "data:image/png;base64,AAAA" })).toContain('src="data:image/png;base64,AAAA"');
  });
  it("une ligne dont tous les champs sont vides est omise ; aucune valeur n'est inventée", () => {
    const v = { ...sampleData("certificat_residence"), profession: "" };
    const html = renderDocumentHtml(c(0), v, { specimen: false });
    expect(html).not.toContain("Profession");
    expect(resolve("{{x}}", {}).empty).toBe(true); expect(resolve("fixe", {}).empty).toBe(false);
  });
  it("extrait : le numéro d'acte affiché est celui fourni, rien d'autre", () => {
    const html = renderDocumentHtml(c(1), { ...sampleData("extrait_naissance"), numero_acte: "REG-9" }, { specimen: false });
    expect(html).toContain("Acte n° REG-9");
  });
  it("utilitaires", () => { expect(escapeHtml(`<&>"'`)).toBe("&lt;&amp;&gt;&quot;&#39;"); expect(formatValue("date_naissance", "2000-01-01")).toBe("1er janvier 2000"); expect(formatValue("sexe", "F")).toBe("Féminin"); });
});

import { contentFromForm, valuesFromContent } from "@/features/documents/form";
describe("éditeur : formulaire <-> contenu", () => {
  const base = (() => { const v = validateContent(seeds[0], "certificat_residence"); if (!v.ok) throw new Error(); return v.content; })();
  const toGet = (vals: Record<string, string | boolean>) => (k: string) => { const v = vals[k]; return v === undefined ? null : typeof v === "boolean" ? (v ? "on" : null) : v; };
  it("aller-retour sans perte", () => {
    const out = contentFromForm(toGet(valuesFromContent(base) as unknown as Record<string, string | boolean>), base);
    expect(validateContent(out, "certificat_residence")).toEqual({ ok: true, content: base });
  });
  it("modification de texte et de lignes", () => {
    const v = { ...valuesFromContent(base), title: "NOUVEAU TITRE", rows: "Nom | {{nom}}\nDomicile | {{domicile}}", margin_top: "20" };
    const r = validateContent(contentFromForm(toGet(v as unknown as Record<string, string | boolean>), base), "certificat_residence");
    expect(r.ok).toBe(true); if (r.ok) { expect(r.content.title).toBe("NOUVEAU TITRE"); expect(r.content.page.margins_mm.top).toBe(20); const rows = r.content.blocks.find((b) => b.type === "rows"); expect(rows && rows.type === "rows" && rows.rows).toHaveLength(2); }
  });
  it("valeurs hors bornes ou champ inconnu rejetés à la validation", () => {
    const v = { ...valuesFromContent(base), margin_left: "999", rows: "X | {{secret}}" };
    expect(validateContent(contentFromForm(toGet(v as unknown as Record<string, string | boolean>), base), "certificat_residence").ok).toBe(false);
  });
});
