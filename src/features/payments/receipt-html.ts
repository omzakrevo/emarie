import { escapeHtml } from "@/features/documents/render";

export interface ReceiptData {
  receipt_number: string; amount_xof: number; is_sandbox: boolean; paid_at: string | null; issued_at: string;
  provider: string; provider_reference: string | null; reference: string; service: Record<string, string>; commune: string;
}
const PROVIDERS: Record<string, string> = { sandbox: "Sandbox (test)", orange_money: "Orange Money", moov_money: "Moov Money" };
const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleString("fr-FR", { timeZone: "Africa/Ouagadougou", dateStyle: "long", timeStyle: "short" }) : "—");
export const formatXof = (n: number) => `${n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ")} FCFA`;
const SAFE_LOGO = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;

/** Quittance A4. Aucune donnée personnelle du demandeur : référence de dossier et montant uniquement. */
export function renderReceiptHtml(d: ReceiptData, logoDataUri?: string | null): string {
  const e = escapeHtml;
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Quittance ${e(d.receipt_number)}</title><style>
@page{size:A4;margin:18mm}*{box-sizing:border-box}body{font-family:'DejaVu Sans','Liberation Sans',Arial,sans-serif;font-size:11pt;color:#111;line-height:1.5}
.head{display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #17428a;padding-bottom:5mm}.logo{max-height:22mm;max-width:28mm}
h1{font-size:20pt;margin:10mm 0 2mm;text-align:center;color:#17428a}.num{text-align:center;margin-bottom:8mm;font-weight:700}
table{width:100%;border-collapse:collapse}th{text-align:left;font-weight:400;width:42%;padding:2.2mm 0;border-bottom:1px solid #ddd}td{font-weight:700;padding:2.2mm 0;border-bottom:1px solid #ddd}
.amount{font-size:18pt;text-align:center;margin:10mm 0;padding:5mm;border:2px solid #17428a}.note{margin-top:12mm;font-size:9pt;color:#555}
.wm{position:fixed;top:40%;left:0;right:0;text-align:center;transform:rotate(-28deg);font-size:40pt;font-weight:700;color:rgba(200,0,0,.17)}
</style></head><body>${d.is_sandbox ? '<div class="wm">SANDBOX<br><span style="font-size:18pt">SANS VALEUR — AUCUN PAIEMENT RÉEL</span></div>' : ""}
<div class="head"><div><strong>${e(d.commune)}</strong><br>Mairie</div>${logoDataUri && SAFE_LOGO.test(logoDataUri) ? `<img class="logo" src="${logoDataUri}" alt="">` : ""}</div>
<h1>QUITTANCE DE PAIEMENT</h1><div class="num">N° ${e(d.receipt_number)}</div>
<table><tr><th>Demande</th><td>${e(d.reference)}</td></tr><tr><th>Service</th><td>${e(d.service.fr ?? "")}</td></tr>
<tr><th>Date du paiement</th><td>${e(fmtDate(d.paid_at))}</td></tr><tr><th>Moyen de paiement</th><td>${e(PROVIDERS[d.provider] ?? d.provider)}</td></tr>
<tr><th>Référence opérateur</th><td>${e(d.provider_reference ?? "—")}</td></tr><tr><th>Quittance émise le</th><td>${e(fmtDate(d.issued_at))}</td></tr></table>
<div class="amount">Montant payé : ${e(formatXof(d.amount_xof))}</div>
<p class="note">Document généré électroniquement. Cette quittance atteste du paiement des frais de la demande ; elle ne remplace pas le document administratif, qui est retiré à la mairie.</p>
</body></html>`;
}
