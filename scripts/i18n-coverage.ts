// Usage : npx tsx scripts/i18n-coverage.ts  — pourcentage de clés traduites en dioula.
import { dyu, dyuValidated, fr } from "../src/i18n/messages";
const keys = Object.keys(fr); const done = keys.filter((k) => dyu[k as keyof typeof fr]);
console.log(`Dioula : ${done.length}/${keys.length} clés (${((done.length / keys.length) * 100).toFixed(1)} %) — ${dyuValidated ? "VALIDÉ" : "NON validé"}`);
