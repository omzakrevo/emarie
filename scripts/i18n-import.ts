// Usage : npx tsx scripts/i18n-import.ts feuille-remplie.csv --validated-by "Nom du relecteur"
// Fusionne dans src/i18n/dyu.json UNIQUEMENT les lignes dont « valide » = oui et qui ont une traduction ; contrôle les variables {x}.
import { readFileSync, writeFileSync } from "node:fs";
import { fr } from "../src/i18n/messages";

const file = process.argv[2];
const by = process.argv[process.argv.indexOf("--validated-by") + 1];
if (!file || !by || by.startsWith("--")) { console.error("Usage : i18n-import.ts <csv> --validated-by \"Nom\""); process.exit(2); }
const parse = (line: string) => [...line.matchAll(/"((?:[^"]|"")*)"/g)].map((m) => m[1].replace(/""/g, '"'));
const vars = (t: string) => (t.match(/\{\w+\}/g) ?? []).sort().join(",");
const json = JSON.parse(readFileSync("src/i18n/dyu.json", "utf8")) as { meta: Record<string, unknown>; messages: Record<string, string> };
let added = 0; const errors: string[] = [];
for (const line of readFileSync(file, "utf8").split(/\r?\n/).slice(1).filter(Boolean)) {
  const [key, , dioula, ok] = parse(line);
  if (!(key in fr)) { errors.push(`clé inconnue : ${key}`); continue; }
  if (!dioula || !/^(oui|yes)$/i.test(ok ?? "")) continue;
  if (vars(dioula) !== vars(fr[key as keyof typeof fr])) { errors.push(`variables différentes pour ${key} : attendu ${vars(fr[key as keyof typeof fr]) || "aucune"}`); continue; }
  json.messages[key] = dioula; added++;
}
if (errors.length) { console.error(errors.join("\n")); process.exit(1); }
json.meta.validatedBy = by; json.meta.validatedAt = new Date().toISOString().slice(0, 10);
writeFileSync("src/i18n/dyu.json", JSON.stringify(json, null, 2) + "\n");
console.log(`${added} traduction(s) importée(s) ; fichier marqué validé par « ${by} ». Relancez les tests.`);
