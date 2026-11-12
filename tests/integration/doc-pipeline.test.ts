import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { renderDocumentHtml } from "@/features/documents/render";
import { validateContent, type TemplateCode } from "@/features/documents/schema";
import { renderPdf } from "@/server/documents/pdf";

// Base RÉELLE (PostgreSQL jetable avec migrations) -> prepare_document -> rendu -> vrai PDF. Ignoré sans TEST_DATABASE_URL.
const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)("pipeline documentaire : SQL -> PDF", () => {
  it("l'extrait de naissance reprend les données du REGISTRE, jamais les données déclarées", async () => {
    process.env.CHROMIUM_EXECUTABLE_PATH ||= "/opt/pw-browsers/chromium"; process.env.CHROMIUM_NO_SANDBOX = "1";
    const out = execFileSync("psql", [url!, "-qAt", "-v", "ON_ERROR_STOP=1", "-f", join(process.cwd(), "tests/integration/doc-pipeline.sql")]).toString();
    const line = out.split("\n").find((l) => l.startsWith("JSON:")); expect(line, out).toBeTruthy();
    const prep = JSON.parse(line!.slice(5)) as { snapshot: Record<string, string>; content: unknown; is_specimen: boolean; template_code: TemplateCode; template_version: number };
    expect(prep.template_code).toBe("extrait_naissance"); expect(prep.is_specimen).toBe(true); expect(prep.template_version).toBe(1);
    const v = validateContent(prep.content, prep.template_code);
    expect(v.ok, JSON.stringify(v)).toBe(true); if (!v.ok) return;
    const pdf = await renderPdf(renderDocumentHtml(v.content, prep.snapshot, { specimen: prep.is_specimen }));
    const f = join(mkdtempSync(join(tmpdir(), "emairie-int-")), "d.pdf"); writeFileSync(f, pdf);
    const text = execFileSync("pdftotext", ["-layout", f, "-"]).toString();
    expect(text).toContain("REGISTRENOM"); expect(text).toContain("LieuRegistre"); expect(text).toContain("REGREF-777"); expect(text).toContain("31 décembre 1999");
    expect(text).toContain("Commune Pipeline"); expect(text).toContain("EXTRAIT D'ACTE DE NAISSANCE");
    expect(text).not.toContain("DECLARENOM"); expect(text).not.toContain("LieuDeclare");
  }, 90_000);
});
