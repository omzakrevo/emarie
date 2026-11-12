import { describe, expect, it } from "vitest";
import { resolveMunicipalitySlug as r } from "@/lib/tenancy/resolve";

const base = { rootDomain: "e-mairie.bf", defaultSlug: "niankorodougou" };

describe("resolveMunicipalitySlug", () => {
  it("lit le sous-domaine", () => expect(r({ ...base, host: "autre.e-mairie.bf" })).toBe("autre"));
  it("ignore le port et la casse", () => expect(r({ ...base, host: "Autre.E-Mairie.bf:3000" })).toBe("autre"));
  it("domaine racine et localhost -> commune par défaut", () => {
    expect(r({ ...base, host: "e-mairie.bf" })).toBe("niankorodougou");
    expect(r({ ...base, host: "localhost:3000" })).toBe("niankorodougou");
  });
  it("refuse les sous-domaines réservés ou imbriqués", () => {
    expect(r({ ...base, host: "admin.e-mairie.bf" })).toBeNull();
    expect(r({ ...base, host: "a.b.e-mairie.bf" })).toBeNull();
  });
  it("refuse les slugs invalides", () => expect(r({ ...base, host: "-x-.e-mairie.bf" })).toBeNull());
  it("sans hôte -> défaut", () => expect(r({ ...base, host: null })).toBe("niankorodougou"));
  it("sans défaut -> null", () => expect(r({ rootDomain: "e-mairie.bf", host: "localhost" })).toBeNull());
});
