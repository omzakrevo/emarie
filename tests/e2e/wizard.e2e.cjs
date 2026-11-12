// Test navigateur du formulaire en 7 étapes (banc d'essai : actions simulées en mémoire, pas de Supabase).
// Usage : E2E_HARNESS=1 npx next dev -p 3222 &  puis  node tests/e2e/wizard.e2e.cjs
const { chromium, devices } = require("playwright");
const assert = require("node:assert/strict");
const URL_ = process.env.E2E_URL || "http://localhost:3222/e2e-harness";
const SHOT = process.env.E2E_SHOTS || "";

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices["Pixel 7"], hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  const step = async (n) => page.waitForSelector(`[data-testid="step-${n}"]`, { timeout: 5000 });
  const shot = (name) => SHOT && page.screenshot({ path: `${SHOT}/${name}.png`, fullPage: true });
  let ok = 0; const check = (label, fn) => { fn(); ok++; console.log("  ✓", label); };

  await page.goto(URL_, { waitUntil: "networkidle" });
  await step(1); await shot("1-service");
  await page.getByRole("button", { name: /Service de démonstration/ }).click();
  await step(2);
  check("choix du service -> étape 2 (transition avant)", () => {});
  assert.equal(await page.locator('[data-testid="step-2"]').getAttribute("class"), "step-forward");
  assert.equal(await page.getByRole("progressbar").getAttribute("aria-valuenow"), "2");

  // Validation étape 2
  await page.getByRole("button", { name: "Suivant" }).click();
  assert.ok(await page.getByText("Corrigez les champs signalés").isVisible());
  assert.equal(await page.locator("[aria-invalid='true']").count(), 3);
  await step(2); check("étape 2 bloquée si champs invalides (3 erreurs)", () => {});
  await shot("2-erreurs");

  await page.getByLabel(/^Nom/).fill("Fictif Test");
  await page.getByLabel(/Date de naissance/).fill("2999-01-01");
  await page.getByLabel(/Téléphone/).fill("12");
  await page.getByRole("button", { name: "Suivant" }).click();
  assert.ok(await page.getByText("La date ne peut pas être dans le futur.").isVisible());
  assert.ok(await page.getByText("Format invalide.").isVisible());
  check("date future et téléphone invalide refusés", () => {});
  await page.getByLabel(/Date de naissance/).fill("1990-05-17");
  await page.getByLabel(/Téléphone/).fill("70 12 34 56");

  // Sauvegarde automatique
  await page.waitForFunction(() => window.__store.saves.length > 0, null, { timeout: 4000 });
  const saved = await page.evaluate(() => window.__store.saves.at(-1));
  assert.equal(saved.nom, "Fictif Test");
  check("sauvegarde automatique du brouillon (anti-rebond)", () => {});

  await page.getByRole("button", { name: "Suivant" }).click(); await step(3);
  check("étape 3 atteinte", () => {});

  // Champ conditionnel
  assert.equal(await page.getByLabel(/Nom du demandeur/).count(), 0);
  await page.getByLabel(/^Qualité/).selectOption("parent");
  assert.equal(await page.getByLabel(/Nom du demandeur/).count(), 1);
  await page.getByRole("button", { name: "Suivant" }).click();
  assert.equal(await page.locator("[aria-invalid='true']").count(), 1);
  check("champ conditionnel affiché et exigé seulement quand visible", () => {});
  await page.getByLabel(/Nom du demandeur/).fill("Parent Fictif");
  await page.getByRole("button", { name: "Suivant" }).click(); await step(4);
  await shot("4-documents");

  // Documents
  await page.getByRole("button", { name: "Suivant" }).click();
  assert.ok(await page.getByText("Ajoutez les justificatifs obligatoires").isVisible());
  check("justificatif obligatoire exigé", () => {});
  await page.getByTestId("file-piece").setInputFiles({ name: "piece.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 fictif") });
  await page.getByText("piece.pdf").waitFor();
  check("téléversement + liste", () => {});
  await page.getByRole("button", { name: /Supprimer piece.pdf/ }).click();
  await page.getByText("piece.pdf").waitFor({ state: "detached" });
  check("suppression avant soumission", () => {});
  await page.getByTestId("camera-piece").setInputFiles({ name: "photo.png", mimeType: "image/png", buffer: Buffer.from("89504e470d0a1a0a", "hex") });
  await page.getByText(/photo/).first().waitFor();
  check("import via l'entrée caméra (capture=environment)", () => {});
  assert.equal(await page.getByTestId("camera-piece").getAttribute("capture"), "environment");

  await page.getByRole("button", { name: "Suivant" }).click(); await step(5);
  assert.ok(await page.getByText("Fictif Test").isVisible());
  assert.ok(await page.getByText("Parent Fictif").isVisible());
  await shot("5-recap");
  check("récapitulatif complet", () => {});

  // Retour (transition arrière) + modification depuis le récap
  await page.getByRole("button", { name: "Précédent" }).click(); await step(4);
  assert.equal(await page.locator('[data-testid="step-4"]').getAttribute("class"), "step-backward");
  check("bouton Précédent -> transition arrière", () => {});
  await page.getByRole("button", { name: "Suivant" }).click(); await step(5);
  await page.getByRole("button", { name: "Modifier" }).first().click(); await step(2);
  assert.equal(await page.getByLabel(/^Nom/).inputValue(), "Fictif Test");
  check("modification depuis le récapitulatif conserve les données", () => {});
  await page.getByRole("button", { name: "Suivant" }).click(); await step(3);
  await page.getByRole("button", { name: "Suivant" }).click(); await step(4);
  await page.getByRole("button", { name: "Suivant" }).click(); await step(5);
  await page.getByRole("button", { name: "Suivant" }).click(); await step(6);

  // Paiement : aucune simulation
  assert.equal(await page.getByTestId("amount").innerText(), "Tarif à confirmer par la mairie");
  assert.ok(await page.getByText(/Mode test : le paiement en ligne n'est pas encore activé/).isVisible());
  await shot("6-paiement");
  check("étape paiement : tarif non inventé, mode test explicite", () => {});

  await page.getByRole("button", { name: "Soumettre ma demande" }).click(); await step(7);
  assert.equal(await page.getByTestId("reference").innerText(), "TST-2026-000001");
  assert.match(await page.getByTestId("tracking-secret").innerText(), /^[A-Z0-9]{4}(-[A-Z0-9]{4}){2}$/);
  await shot("7-confirmation");
  check("confirmation : référence + code de suivi", () => {});

  // Pas de défilement horizontal pendant l'animation (échantillonnage à chaque image)
  await page.goto(URL_, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Service de démonstration/ }).click(); await step(2);
  await page.getByLabel(/^Nom/).fill("X"); await page.getByLabel(/Date de naissance/).fill("1990-01-01"); await page.getByLabel(/Téléphone/).fill("70123456");
  await page.evaluate(() => { window.__maxW = 0; const t0 = performance.now();
    const loop = () => { window.__maxW = Math.max(window.__maxW, document.documentElement.scrollWidth - window.innerWidth); if (performance.now() - t0 < 700) requestAnimationFrame(loop); };
    requestAnimationFrame(loop); });
  await page.getByRole("button", { name: "Suivant" }).click(); await step(3); await page.waitForTimeout(600);
  const over = await page.evaluate(() => window.__maxW);
  assert.equal(over, 0, `débordement horizontal de ${over}px pendant la transition`);
  check("aucun débordement horizontal pendant la transition", () => {});
  assert.deepEqual(errors.filter((e) => !/favicon|Failed to load resource/.test(e)), [], "erreurs console");
  check("aucune erreur console/JS", () => {});
  await browser.close();
  console.log(`E2E_OK (${ok} vérifications)`);
})().catch((e) => { console.error("E2E_FAIL", e); process.exit(1); });
