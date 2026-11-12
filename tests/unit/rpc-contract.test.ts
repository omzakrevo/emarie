import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** Contrat TS ↔ SQL : chaque `.rpc("nom", { p_x })` doit viser une fonction définie dans les migrations, avec des paramètres existants. */
const root = process.cwd();
const walk = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });

const sql = readdirSync(join(root, "supabase/migrations")).sort().map((f) => readFileSync(join(root, "supabase/migrations", f), "utf8")).join("\n");
const functions = new Map<string, Set<string>>();
for (const m of sql.matchAll(/create or replace function public\.(\w+)\(([^)]*)\)/gi)) {
  const params = m[2].split(",").map((a) => a.trim().split(/\s+/)[0]).filter(Boolean);
  functions.set(m[1], new Set(params));
}

const calls: { file: string; name: string; keys: string[] }[] = [];
for (const file of walk(join(root, "src")).filter((f) => /\.(ts|tsx)$/.test(f))) {
  const src = readFileSync(file, "utf8");
  for (const m of src.matchAll(/\.rpc\(\s*"(\w+)"\s*(?:,\s*\{([^}]*)\})?/g)) {
    const keys = [...(m[2] ?? "").matchAll(/\b(p_\w+)\s*:/g)].map((k) => k[1]);
    calls.push({ file: file.replace(root + "/", ""), name: m[1], keys });
  }
}

describe("contrat RPC TypeScript ↔ SQL", () => {
  it("détecte des appels (le test n'est pas vide)", () => { expect(calls.length).toBeGreaterThan(8); expect(functions.size).toBeGreaterThan(10); });
  for (const c of calls) {
    it(`${c.name} (${c.file})`, () => {
      const def = functions.get(c.name);
      expect(def, `fonction SQL ${c.name} introuvable`).toBeDefined();
      for (const k of c.keys) expect(def!.has(k), `paramètre ${k} inconnu pour ${c.name} (attendus : ${[...def!].join(", ")})`).toBe(true);
    });
  }
});
