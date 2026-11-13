// Usage : npx tsx scripts/i18n-sheet.ts > traductions-dioula.csv
// Produit la feuille à faire remplir par un locuteur dioula : clé ; français ; dioula (actuel) ; à valider.
import { dyu, fr } from "../src/i18n/messages";
const q = (v: string) => `"${v.replace(/"/g, '""')}"`;
console.log("cle;francais;dioula;valide(oui/non)");
for (const [k, v] of Object.entries(fr)) console.log([q(k), q(v), q(dyu[k as keyof typeof fr] ?? ""), q("")].join(";"));
