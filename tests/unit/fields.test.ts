import { describe, expect, it } from "vitest";
import { sanitizeData, validateFields, visibleFields, normalizePhone } from "@/features/demande/fields";
import type { FieldDef } from "@/features/demande/types";

const F = (o: Partial<FieldDef> & { key: string }): FieldDef =>
  ({ label: { fr: o.key }, type: "text", required: false, step: 2, sort_order: 1, ...o }) as FieldDef;

const fields: FieldDef[] = [
  F({ key: "nom", required: true }),
  F({ key: "date_naissance", type: "date", required: true }),
  F({ key: "tel", type: "phone", required: true }),
  F({ key: "qualite", type: "select", step: 3, required: true, options: [{ value: "lui", label: { fr: "x" } }, { value: "parent", label: { fr: "y" } }] }),
  F({ key: "mandataire", step: 3, required: true, visible_if: { field: "qualite", op: "in", value: ["parent"] } }),
];

describe("champs dynamiques", () => {
  it("champ conditionnel masqué puis affiché", () => {
    expect(visibleFields(fields, { qualite: "lui" }, 3).map((f) => f.key)).toEqual(["qualite"]);
    expect(visibleFields(fields, { qualite: "parent" }, 3).map((f) => f.key)).toEqual(["qualite", "mandataire"]);
  });
  it("un champ masqué n'est jamais exigé", () => {
    expect(validateFields(fields, { qualite: "lui" }, 3)).toEqual({});
    expect(validateFields(fields, { qualite: "parent" }, 3)).toEqual({ mandataire: "required" });
  });
  it("valide l'étape 2", () => {
    const e = validateFields(fields, { nom: " ", date_naissance: "2999-01-01", tel: "12" }, 2, "2026-11-12");
    expect(e).toEqual({ nom: "required", date_naissance: "future_date", tel: "invalid_format" });
  });
  it("dates impossibles", () => {
    expect(validateFields(fields, { nom: "a", date_naissance: "2020-02-31", tel: "70123456" }, 2)).toEqual({ date_naissance: "invalid_date" });
  });
  it("option inconnue refusée", () => expect(validateFields(fields, { qualite: "hack" }, 3).qualite).toBe("invalid_option"));
  it("normalise les numéros", () => {
    expect(normalizePhone("70 12 34 56")).toBe("+22670123456");
    expect(normalizePhone("00226 70123456")).toBe("+22670123456");
    expect(normalizePhone("+33612345678")).toBe("+33612345678");
    expect(normalizePhone("abc")).toBeNull();
  });
  it("sanitize : clés inconnues, champs masqués et non-textes supprimés", () => {
    const out = sanitizeData(fields, { nom: "  Fictif ", qualite: "lui", mandataire: "caché", evil: "x", tel: 5 as unknown as string });
    expect(out).toEqual({ nom: "Fictif", qualite: "lui" });
  });
});
