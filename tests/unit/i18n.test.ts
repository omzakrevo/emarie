import { describe, expect, it } from "vitest";
import { dyu, format, fr, messagesFor, pickLocalized } from "@/i18n/messages";

describe("i18n", () => {
  it("toute clé dioula existe en français (pas de clé orpheline)", () => {
    for (const k of Object.keys(dyu)) expect(k in fr, k).toBe(true);
  });
  it("repli sur le français pour les clés non traduites", () => {
    const m = messagesFor("dyu");
    expect(m["common.next"]).toBe(fr["common.next"]);
    expect(m["common.yes"]).toBe("Awɔ");
  });
  it("interpolation et champs localisés", () => {
    expect(format("Bonjour {name}", { name: "X" })).toBe("Bonjour X");
    expect(pickLocalized({ fr: "a" }, "dyu")).toBe("a");
    expect(pickLocalized({ fr: "a", dyu: "b" }, "dyu")).toBe("b");
    expect(pickLocalized(null, "fr")).toBe("");
  });
  it("chaque message d'erreur de validation existe", () => {
    for (const c of ["required","too_short","too_long","invalid_format","invalid_date","future_date","invalid_option","invalid_number"]) expect(`error.${c}` in fr).toBe(true);
  });
});
