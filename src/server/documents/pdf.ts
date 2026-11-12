import { chromium } from "playwright-core";

let running = 0;
const MAX_PARALLEL = 2;

/**
 * HTML (déjà échappé par renderDocumentHtml) -> PDF A4 via Chromium.
 * Défense en profondeur : JavaScript désactivé, TOUTE requête hors data:/about: annulée (pas de SSRF, pas de fuite).
 * Variables : CHROMIUM_EXECUTABLE_PATH (chemin du binaire), CHROMIUM_NO_SANDBOX=1 (conteneurs root uniquement).
 */
export async function renderPdf(html: string): Promise<Buffer> {
  if (html.length > 400_000) throw new Error("html_too_large");
  if (running >= MAX_PARALLEL) throw new Error("busy");
  running++;
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined,
    args: process.env.CHROMIUM_NO_SANDBOX === "1" ? ["--no-sandbox"] : [],
    timeout: 20_000,
  });
  try {
    const context = await browser.newContext({ javaScriptEnabled: false, acceptDownloads: false, serviceWorkers: "block" });
    await context.route("**/*", (route) => {
      const u = route.request().url();
      return u.startsWith("data:") || u.startsWith("about:") ? route.continue() : route.abort();
    });
    const page = await context.newPage();
    await page.setContent(html, { waitUntil: "load", timeout: 15_000 });
    const pdf = await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true });
    return Buffer.from(pdf);
  } finally {
    running--;
    await browser.close().catch(() => undefined);
  }
}
