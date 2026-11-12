// Parcours de paiement du formulaire (banc d'essai : actions simulées en mémoire, pas de Supabase ni de prestataire).
const { chromium, devices } = require("playwright");
const assert = require("node:assert/strict");
const URL_ = (process.env.E2E_URL || "http://localhost:3222/e2e-harness") + "?pay=1";

(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ ...devices["Pixel 7"], hasTouch: true })).newPage();
  const errors = []; page.on("pageerror", (e) => errors.push(String(e))); page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  const step = (n) => page.waitForSelector(`[data-testid="step-${n}"]`, { timeout: 5000 });
  let ok = 0; const check = (l) => { ok++; console.log("  ✓", l); };

  await page.goto(URL_, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Service de démonstration/ }).click(); await step(2);
  await page.getByLabel(/^Nom/).fill("Fictif"); await page.getByLabel(/Date de naissance/).fill("1990-05-17"); await page.getByLabel(/Téléphone/).fill("70123456");
  await page.getByRole("button", { name: "Suivant" }).click(); await step(3);
  await page.getByLabel(/^Qualité/).selectOption("lui_meme");
  await page.getByRole("button", { name: "Suivant" }).click(); await step(4);
  await page.getByTestId("file-piece").setInputFiles({ name: "p.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 x") });
  await page.getByText("p.pdf").waitFor();
  await page.getByRole("button", { name: "Suivant" }).click(); await step(5);
  await page.getByRole("button", { name: "Suivant" }).click(); await step(6);

  assert.match(await page.getByTestId("amount").innerText(), /^1\s?500 FCFA$/); check("montant affiché (fourni par le serveur)");
  assert.equal(await page.getByRole("radio").count(), 1); check("seul le prestataire disponible est proposé (Orange/Moov non intégrés : masqués)");
  assert.ok(await page.getByText("MODE TEST : aucun argent réel").isVisible()); check("mode test explicite");
  assert.equal(await page.getByLabel(/Numéro Mobile Money/).inputValue(), ""); await page.getByLabel(/Numéro Mobile Money/).fill("70 11 22 33");

  const pay = page.getByRole("button", { name: /Payer/ });
  await pay.dblclick(); await step(7);
  assert.equal(await page.evaluate(() => window.__store.payCalls.length), 1, "double clic : un seul paiement initié"); check("double clic : un seul paiement initié");
  const first = await page.evaluate(() => window.__store.payCalls[0]);
  assert.equal(first.provider, "sandbox"); assert.equal(first.phone, "70 11 22 33");
  assert.equal(await page.getByTestId("reference").innerText(), "TST-2026-000001");
  await page.getByTestId("pay-pending").waitFor(); check("paiement en attente affiché avec la référence");

  await page.evaluate(() => { window.__store.payOutcome = "FAILED"; });
  await page.getByTestId("pay-failed").waitFor({ timeout: 8000 }); check("échec remonté par le serveur (statut sondé)");
  await page.getByRole("button", { name: "Réessayer le paiement" }).click();
  await page.waitForFunction(() => window.__store.payCalls.length === 2);
  const second = await page.evaluate(() => window.__store.payCalls[1]);
  assert.notEqual(second.key, first.key); check("nouvelle tentative : nouvelle clé d'idempotence");

  await page.evaluate(() => { window.__store.payOutcome = "PAID"; });
  await page.getByTestId("pay-paid").waitFor({ timeout: 8000 }); check("paiement confirmé par le serveur");
  assert.ok(await page.getByText("Quittance en préparation").isVisible()); check("quittance en préparation tant que le PDF n'est pas prêt");
  await page.evaluate(() => { window.__receipt = true; });
  await page.getByRole("button", { name: "Télécharger la quittance" }).waitFor({ timeout: 8000 }); check("quittance téléchargeable");

  assert.deepEqual(errors.filter((e) => !/favicon|Failed to load resource/.test(e)), []); check("aucune erreur console");
  await browser.close(); console.log(`E2E_PAY_OK (${ok} vérifications)`);
})().catch((e) => { console.error("E2E_PAY_FAIL", e); process.exit(1); });
