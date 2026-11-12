import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { renderDocumentHtml, sampleData } from "@/features/documents/render";
import { validateContent, type TemplateCode } from "@/features/documents/schema";
import { renderPdf } from "@/server/documents/pdf";

// Test avec un vrai Chromium : ignoré (et signalé) si le binaire est absent.
const chromiumPath = process.env.CHROMIUM_EXECUTABLE_PATH || "/opt/pw-browsers/chromium";
const available = existsSync(chromiumPath);
process.env.CHROMIUM_EXECUTABLE_PATH = chromiumPath; process.env.CHROMIUM_NO_SANDBOX = "1";
const sql = readFileSync(join(process.cwd(), "supabase/migrations/0009_default_templates.sql"), "utf8");
const seeds = [...sql.matchAll(/\$json\$([\s\S]*?)\$json\$/g)].map((m) => JSON.parse(m[1]));
const CODES: TemplateCode[] = ["certificat_residence", "extrait_naissance"];
const dir = mkdtempSync(join(tmpdir(), "emairie-pdf-"));
const content = (i: number) => { const v = validateContent(seeds[i], CODES[i]); if (!v.ok) throw new Error("seed"); return v.content; };
const info = (f: string) => execFileSync("pdfinfo", [f]).toString();
const text = (f: string) => execFileSync("pdftotext", ["-layout", f, "-"]).toString();
/** Nombre de pixels nettement rouges (le filigrane est pivoté : pdftotext ne l'extrait pas). */
const redPixels = (f: string) => {
  const out = f.replace(/\.pdf$/, "");
  execFileSync("pdftoppm", ["-r", "40", "-singlefile", f, out]);               // produit <out>.ppm
  const b = readFileSync(`${out}.ppm`);
  let i = 0, nl = 0; while (nl < 3) if (b[i++] === 0x0a) nl++;            // saute l'en-tête P6 w h max
  let n = 0; for (; i + 2 < b.length; i += 3) if (b[i] > 200 && b[i + 1] < 215 && b[i] - b[i + 1] > 25) n++;
  return n;
};

describe.skipIf(!available)("génération PDF réelle", () => {
  it.each([0, 1])("modèle %i : une page A4, texte des champs, filigrane spécimen", async (i) => {
    const pdf = await renderPdf(renderDocumentHtml(content(i), { ...sampleData(CODES[i]), nom: "NOMTEST" }, { specimen: true }));
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    const f = join(dir, `m${i}.pdf`); writeFileSync(f, pdf);
    const meta = info(f);
    expect(meta).toMatch(/Pages:\s+1\b/);
    const size = meta.match(/Page size:\s+([\d.]+) x ([\d.]+)/)!; expect(Math.round(+size[1])).toBe(595); expect(Math.round(+size[2])).toBe(842);   // A4
    const t = text(f);
    expect(redPixels(f)).toBeGreaterThan(150);                                            // filigrane SPÉCIMEN présent
    expect(t).toContain("NOMTEST"); expect(t).toMatch(/Région des/); expect(t).toContain(i === 0 ? "CERTIFICAT DE RÉSIDENCE" : "EXTRAIT D'ACTE DE NAISSANCE");
    expect(t).toContain("Timbre communal"); expect(t).toContain("Cachet officiel");
  }, 60_000);

  it("sans filigrane quand le modèle est validé", async () => {
    const f = join(dir, "ok.pdf"); writeFileSync(f, await renderPdf(renderDocumentHtml(content(0), sampleData("certificat_residence"), { specimen: false })));
    expect(redPixels(f)).toBe(0);                                                          // aucun filigrane
  }, 60_000);

  it("aucune requête réseau : une ressource externe injectée n'est jamais appelée", async () => {
    let hits = 0; const srv = createServer((_q, r) => { hits++; r.end("x"); }); await new Promise<void>((ok) => srv.listen(0, "127.0.0.1", ok));
    const port = (srv.address() as { port: number }).port;
    const html = `<html><body><img src="http://127.0.0.1:${port}/a.png"><link rel="stylesheet" href="http://127.0.0.1:${port}/s.css"><script>fetch("http://127.0.0.1:${port}/js")</script>ok</body></html>`;
    await renderPdf(html); await new Promise((r) => setTimeout(r, 300)); srv.close();
    expect(hits).toBe(0);
  }, 60_000);
});
afterAll(() => undefined);
