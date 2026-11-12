import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { renderReceiptHtml, type ReceiptData } from "@/features/payments/receipt-html";
import { renderPdf } from "@/server/documents/pdf";

// Base RÉELLE : paiement sandbox confirmé -> issue_receipt -> rendu -> vrai PDF. Ignoré sans TEST_DATABASE_URL.
const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)("pipeline quittance : SQL -> PDF", () => {
  it("quittance sandbox : numéro, montant, référence ; filigrane « sans valeur »", async () => {
    process.env.CHROMIUM_EXECUTABLE_PATH ||= "/opt/pw-browsers/chromium"; process.env.CHROMIUM_NO_SANDBOX = "1";
    const out = execFileSync("psql", [url!, "-qAt", "-v", "ON_ERROR_STOP=1", "-f", join(process.cwd(), "tests/integration/receipt-pipeline.sql")]).toString();
    const line = out.split("\n").find((l) => l.startsWith("JSON:")); expect(line, out).toBeTruthy();
    const r = JSON.parse(line!.slice(5)) as ReceiptData & { receipt_id: string; has_pdf: boolean };
    expect(r.receipt_number).toMatch(/^PIQ-RC-\d{4}-000001$/); expect(r.amount_xof).toBe(1500); expect(r.is_sandbox).toBe(true); expect(r.has_pdf).toBe(false);
    expect(r.reference).toMatch(/^PIQ-\d{4}-000001$/);
    const dir = mkdtempSync(join(tmpdir(), "emairie-rc-")); const f = join(dir, "q.pdf");
    writeFileSync(f, await renderPdf(renderReceiptHtml(r)));
    const text = execFileSync("pdftotext", ["-layout", f, "-"]).toString();
    expect(text).toContain(r.receipt_number); expect(text).toContain(r.reference); expect(text).toMatch(/1\s?500 FCFA/); expect(text).toContain("Sandbox (test)"); expect(text).toContain("Commune Quittance");
    expect(text).not.toContain("FICTIF");                                     // aucune donnée personnelle du demandeur
    execFileSync("pdftoppm", ["-r", "40", "-singlefile", f, join(dir, "q")]);
    const b = readFileSync(join(dir, "q.ppm")); let i = 0, nl = 0; while (nl < 3) if (b[i++] === 0x0a) nl++;
    let red = 0; for (; i + 2 < b.length; i += 3) if (b[i] > 200 && b[i + 1] < 215 && b[i] - b[i + 1] > 25) red++;
    expect(red).toBeGreaterThan(150);                                         // filigrane SANDBOX visible
  }, 90_000);
});
