import { afterEach, describe, expect, it } from "vitest";
import { signSandbox, verifySandbox } from "@/features/payments/sandbox";
import { formatXof, renderReceiptHtml, type ReceiptData } from "@/features/payments/receipt-html";
import { PROVIDERS, ProviderNotIntegrated, describeOption, paymentMode, sandboxProvider } from "@/server/payments/providers";
import { ALLOWED_TEMPLATE_VARS, invalidTemplateVars, getSmsProvider, smsMode } from "@/server/sms/provider";

const SECRET = "s".repeat(40);
const now = 1_800_000_000;
const body = JSON.stringify({ event_id: "e1", payment_id: "11111111-1111-1111-1111-111111111111", status: "PAID", amount_xof: 1000, provider_reference: "SBX-1" });

describe("signature des webhooks sandbox", () => {
  it("accepte une signature valide", () => expect(verifySandbox(body, signSandbox(body, SECRET, now), SECRET, now)).toBe(true));
  it("refuse un corps modifié, un mauvais secret, un format invalide, l'absence d'en-tête", () => {
    const sig = signSandbox(body, SECRET, now);
    expect(verifySandbox(body.replace("1000", "1"), sig, SECRET, now)).toBe(false);
    expect(verifySandbox(body, sig, "x".repeat(40), now)).toBe(false);
    expect(verifySandbox(body, "garbage", SECRET, now)).toBe(false);
    expect(verifySandbox(body, null, SECRET, now)).toBe(false);
  });
  it("refuse le rejeu hors fenêtre de 5 minutes (passé et futur)", () => {
    const sig = signSandbox(body, SECRET, now);
    expect(verifySandbox(body, sig, SECRET, now + 299)).toBe(true);
    expect(verifySandbox(body, sig, SECRET, now + 301)).toBe(false);
    expect(verifySandbox(body, sig, SECRET, now - 301)).toBe(false);
  });
  it("refuse un secret trop court (configuration faible)", () => expect(verifySandbox(body, signSandbox(body, "court", now), "court", now)).toBe(false));
});

describe("fournisseurs", () => {
  const env = { ...process.env }; afterEach(() => { process.env = { ...env }; });
  it("Orange/Moov : jamais disponibles, initiation refusée, notifications rejetées (échec fermé)", async () => {
    for (const id of ["orange_money", "moov_money"] as const) {
      const p = PROVIDERS[id];
      expect(p.availability().available).toBe(false); expect(describeOption(id).reason).toMatch(/non réalisée/);
      await expect(p.initiate({ paymentId: "x", reference: "r", amountXof: 1, payerPhone: null, origin: "https://x" })).rejects.toBeInstanceOf(ProviderNotIntegrated);
      expect(p.verifyWebhook(body, new Headers({ "x-sandbox-signature": signSandbox(body, SECRET, Math.floor(Date.now() / 1000)) }))).toBeNull();
    }
  });
  it("sandbox : indisponible sans secret ou hors mode sandbox", () => {
    delete process.env.SANDBOX_WEBHOOK_SECRET; process.env.PAYMENT_MODE = "sandbox"; expect(sandboxProvider.availability().available).toBe(false);
    process.env.SANDBOX_WEBHOOK_SECRET = SECRET; expect(sandboxProvider.availability().available).toBe(true);
    process.env.PAYMENT_MODE = "live"; expect(paymentMode()).toBe("live"); expect(sandboxProvider.availability().available).toBe(false);
  });
  it("sandbox : vérifie et normalise un événement ; rejette en mode live", () => {
    process.env.PAYMENT_MODE = "sandbox"; process.env.SANDBOX_WEBHOOK_SECRET = SECRET;
    const t = Math.floor(Date.now() / 1000); const h = new Headers({ "x-sandbox-signature": signSandbox(body, SECRET, t) });
    expect(sandboxProvider.verifyWebhook(body, h)).toEqual({ eventId: "e1", paymentId: "11111111-1111-1111-1111-111111111111", status: "PAID", amountXof: 1000, providerReference: "SBX-1" });
    process.env.PAYMENT_MODE = "live"; expect(sandboxProvider.verifyWebhook(body, h)).toBeNull();
  });
  it("statut inconnu ou JSON invalide rejetés", () => {
    process.env.PAYMENT_MODE = "sandbox"; process.env.SANDBOX_WEBHOOK_SECRET = SECRET; const t = Math.floor(Date.now() / 1000);
    for (const raw of [body.replace("PAID", "REFUNDED"), "{pas du json", "{}"]) expect(sandboxProvider.verifyWebhook(raw, new Headers({ "x-sandbox-signature": signSandbox(raw, SECRET, t) }))).toBeNull();
  });
});

describe("SMS", () => {
  const env = { ...process.env }; afterEach(() => { process.env = { ...env }; });
  it("mode test par défaut ; mode live sans fournisseur = pas de traitement", () => {
    delete process.env.SMS_MODE; expect(smsMode()).toBe("test"); expect(getSmsProvider()?.isTest).toBe(true);
    process.env.SMS_MODE = "live"; expect(getSmsProvider()).toBeNull();
  });
  it("variables de modèle : seules {commune} et {reference}", () => {
    expect(ALLOWED_TEMPLATE_VARS).toEqual(["commune", "reference"]);
    expect(invalidTemplateVars("{commune} : {reference}")).toEqual([]);
    expect(invalidTemplateVars("{nom} {commune} {}")).toEqual(["nom", ""]);
  });
});

describe("quittance", () => {
  const d: ReceiptData = { receipt_number: "TSA-RC-2026-000001", amount_xof: 1500, is_sandbox: false, paid_at: "2026-03-01T10:00:00Z", issued_at: "2026-03-01T10:00:05Z", provider: "orange_money", provider_reference: "OM-1", reference: "TSA-2026-000001", service: { fr: "Certificat de résidence" }, commune: "Commune A" };
  it("contenu et format du montant", () => {
    const h = renderReceiptHtml(d); expect(h).toContain("TSA-RC-2026-000001"); expect(h).toContain("1 500 FCFA"); expect(h).toContain("Orange Money"); expect(h).not.toContain("SANDBOX");
    expect(formatXof(1234567)).toBe("1 234 567 FCFA");
  });
  it("sandbox : filigrane « sans valeur »", () => expect(renderReceiptHtml({ ...d, is_sandbox: true })).toContain("AUCUN PAIEMENT RÉEL"));
  it("échappe les valeurs", () => { const h = renderReceiptHtml({ ...d, commune: "<script>x</script>", service: { fr: "<img onerror=1>" } }); expect(h).not.toMatch(/<script|<img onerror/); });
});
