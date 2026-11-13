// Accessibilité (axe-core, WCAG 2 A/AA) + absence de défilement horizontal, à chaque étape du formulaire et sur 4 largeurs.
// Banc d'essai (actions simulées). Usage : E2E_HARNESS=1 npx next dev -p 3222 &  node tests/e2e/a11y-responsive.e2e.cjs
const { chromium } = require("playwright");
const AxeBuilder = require("@axe-core/playwright").default;
const URL_ = (process.env.E2E_URL || "http://localhost:3222/e2e-harness") + "?pay=1";
const SIZES = [[320, 640], [375, 812], [768, 1024], [1280, 800]];

(async () => {
  const browser = await chromium.launch();
  let problems = 0, checks = 0;
  for (const [w, h] of SIZES) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: w < 800 });
    const page = await ctx.newPage();
    await page.goto(URL_, { waitUntil: "networkidle" });
    const audit = async (label) => {
      await page.waitForTimeout(350);                                   // fin de l'animation de transition
      const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      const res = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).exclude("nextjs-portal").analyze();
      checks++;
      if (over > 0) { problems++; console.log(`✖ ${w}px ${label} : débordement horizontal de ${over}px`); }
      for (const v of res.violations) { problems++; console.log(`✖ ${w}px ${label} : [${v.impact}] ${v.id} — ${v.help} (${v.nodes.length} élément(s)) ex: ${v.nodes[0].target.join(" ")}`); }
    };
    const step = (n) => page.waitForSelector(`[data-testid="step-${n}"]`);
    await audit("étape 1");
    await page.getByRole("button", { name: /Service de démonstration/ }).click(); await step(2); await audit("étape 2");
    await page.getByRole("button", { name: "Suivant" }).click(); await audit("étape 2 (erreurs)");
    await page.getByLabel(/^Nom/).fill("Fictif"); await page.getByLabel(/Date de naissance/).fill("1990-05-17"); await page.getByLabel(/Téléphone/).fill("70123456");
    await page.getByRole("button", { name: "Suivant" }).click(); await step(3); await audit("étape 3");
    await page.getByLabel(/^Qualité/).selectOption("parent"); await audit("étape 3 (champ conditionnel)");
    await page.getByLabel(/Nom du demandeur/).fill("Parent Fictif");
    await page.getByRole("button", { name: "Suivant" }).click(); await step(4); await audit("étape 4");
    await page.getByTestId("file-piece").setInputFiles({ name: "p.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 x") }); await page.getByText("p.pdf").waitFor(); await audit("étape 4 (fichier)");
    await page.getByRole("button", { name: "Suivant" }).click(); await step(5); await audit("étape 5");
    await page.getByRole("button", { name: "Suivant" }).click(); await step(6); await audit("étape 6");
    await page.getByLabel(/Numéro Mobile Money/).fill("70112233");
    await page.getByRole("button", { name: /Payer/ }).click(); await step(7); await audit("étape 7");
    await ctx.close();
  }
  await browser.close();
  console.log(problems ? `\nA11Y_FAIL : ${problems} problème(s) sur ${checks} contrôles` : `A11Y_RESPONSIVE_OK (${checks} contrôles, 0 problème)`);
  process.exit(problems ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
