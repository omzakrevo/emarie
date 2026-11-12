#!/usr/bin/env node
// Vérifie la configuration AVANT un déploiement. Usage : node scripts/check-env.mjs [--production]
// Lit process.env (exportez/chargez vos variables avant). Ne n'affiche jamais de valeur secrète.
const prod = process.argv.includes("--production");
const must = (k, min = 1) => (process.env[k] ?? "").length >= min;
const problems = [], warnings = [];
const need = (k, min, why) => { if (!must(k, min)) problems.push(`${k} manquant ou trop court${min > 1 ? ` (min. ${min})` : ""} — ${why}`); };

need("NEXT_PUBLIC_SUPABASE_URL", 10, "URL du projet Supabase");
need("NEXT_PUBLIC_SUPABASE_ANON_KEY", 20, "clé publique (anon/publishable) — JAMAIS la clé service_role");
need("SUPABASE_SERVICE_ROLE_KEY", 20, "clé service_role, serveur uniquement");
need("TRACKING_SECRET_PEPPER", 32, "poivre des codes de suivi (32+ caractères aléatoires)");
need("CRON_SECRET", 32, "protège /api/cron/*");
need("NEXT_PUBLIC_ROOT_DOMAIN", 3, "domaine racine pour les sous-domaines de mairies");
if (/service_role/i.test(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "")) problems.push("NEXT_PUBLIC_SUPABASE_ANON_KEY ressemble à une clé service_role : ARRÊT.");
for (const k of Object.keys(process.env)) if (k.startsWith("NEXT_PUBLIC_") && /SECRET|SERVICE_ROLE|PRIVATE/i.test(k)) problems.push(`${k} : un secret ne doit jamais être préfixé NEXT_PUBLIC_.`);

const pm = process.env.PAYMENT_MODE ?? "sandbox";
if (pm === "sandbox") { need("SANDBOX_WEBHOOK_SECRET", 32, "requis en mode sandbox"); if (prod) problems.push("PAYMENT_MODE=sandbox en production : aucun paiement réel possible (aucun prestataire intégré)."); }
if (pm === "live") warnings.push("PAYMENT_MODE=live : AUCUN adaptateur Orange/Moov n'est intégré à ce jour ; aucun paiement ne pourra être initié.");
if ((process.env.SMS_MODE ?? "test") === "test") (prod ? problems : warnings).push("SMS_MODE=test : aucun SMS réellement envoyé.");
if (process.env.PDF_CHROMIUM !== "sparticuz" && !must("CHROMIUM_EXECUTABLE_PATH")) warnings.push("Ni PDF_CHROMIUM=sparticuz ni CHROMIUM_EXECUTABLE_PATH : la génération de PDF échouera.");

for (const w of warnings) console.log("⚠ ", w);
for (const p of problems) console.log("✖ ", p);
console.log(problems.length ? `\n${problems.length} problème(s) bloquant(s).` : "\nConfiguration valide pour cet environnement.");
process.exit(problems.length ? 1 : 0);
