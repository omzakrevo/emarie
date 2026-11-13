import { describe, expect, it } from "vitest";
import { isoDateToFrenchWords, numberToFrench } from "@/features/documents/french";

describe("nombres en toutes lettres", () => {
  it.each([
    [0, "zéro"], [1, "un"], [16, "seize"], [21, "vingt-et-un"], [31, "trente-et-un"], [60, "soixante"], [71, "soixante-et-onze"], [77, "soixante-dix-sept"],
    [80, "quatre-vingts"], [81, "quatre-vingt-un"], [91, "quatre-vingt-onze"], [98, "quatre-vingt-dix-huit"], [100, "cent"], [200, "deux cents"], [201, "deux cent un"],
    [280, "deux cent quatre-vingts"], [999, "neuf cent quatre-vingt-dix-neuf"], [1000, "mille"], [2026, "deux mille vingt-six"], [2000, "deux mille"],
  ])("%i -> %s", (n, w) => expect(numberToFrench(n)).toBe(w));
  it("années : « mil »", () => {
    expect(numberToFrench(1998, { year: true })).toBe("mil neuf cent quatre-vingt-dix-huit");
    expect(numberToFrench(1980, { year: true })).toBe("mil neuf cent quatre-vingts");
    expect(numberToFrench(2026, { year: true })).toBe("deux mille vingt-six");
    expect(numberToFrench(1900, { year: true })).toBe("mil neuf cents");
  });
  it("refuse les valeurs hors bornes", () => { expect(() => numberToFrench(-1)).toThrow(); expect(() => numberToFrench(10000)).toThrow(); expect(() => numberToFrench(1.5)).toThrow(); });
});
describe("dates en toutes lettres", () => {
  it("cas courants", () => {
    expect(isoDateToFrenchWords("1998-10-19")).toBe("dix-neuf octobre mil neuf cent quatre-vingt-dix-huit");
    expect(isoDateToFrenchWords("2005-01-01")).toBe("premier janvier deux mille cinq");
    expect(isoDateToFrenchWords("1990-02-28")).toBe("vingt-huit février mil neuf cent quatre-vingt-dix");
  });
  it("entrées invalides -> null", () => { expect(isoDateToFrenchWords("19/10/1998")).toBeNull(); expect(isoDateToFrenchWords("1998-13-01")).toBeNull(); expect(isoDateToFrenchWords("")).toBeNull(); });
});
