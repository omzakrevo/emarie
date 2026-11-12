import { describe, expect, it } from "vitest";
import { generateDraftToken, generateTrackingSecret, hashSecret, normalizeTrackingSecret, safeEqualHex } from "@/server/security/secrets";
import { safeDisplayName, sniffMime } from "@/server/files/sniff";

const pepper = "p".repeat(32);
describe("secrets de suivi", () => {
  it("format et unicité", () => {
    const s = generateTrackingSecret();
    expect(s).toMatch(/^[A-HJ-NP-Z2-9]{4}(-[A-HJ-NP-Z2-9]{4}){2}$/);
    expect(new Set(Array.from({ length: 500 }, generateTrackingSecret)).size).toBe(500);
  });
  it("hash insensible à la casse/séparateurs, sensible au pepper et au type", () => {
    const h = hashSecret("tracking", "ABCD-EFGH-JKLM", pepper);
    expect(hashSecret("tracking", " abcd efgh jklm ", pepper)).toBe(h);
    expect(hashSecret("tracking", "ABCD-EFGH-JKLM", "q".repeat(32))).not.toBe(h);
    expect(hashSecret("draft", "ABCDEFGHJKLM", pepper)).not.toBe(h);
    expect(normalizeTrackingSecret("ab-cd")).toBe("ABCD");
  });
  it("comparaison à temps constant", () => {
    const h = hashSecret("draft", generateDraftToken(), pepper);
    expect(safeEqualHex(h, h)).toBe(true);
    expect(safeEqualHex(h, hashSecret("draft", "autre", pepper))).toBe(false);
    expect(safeEqualHex(null, h)).toBe(false);
    expect(safeEqualHex("abc", h)).toBe(false);
  });
});
describe("détection de fichiers", () => {
  const b = (...x: number[]) => Uint8Array.from(x);
  it("reconnaît pdf/jpeg/png/webp", () => {
    expect(sniffMime(Buffer.from("%PDF-1.7"))).toBe("application/pdf");
    expect(sniffMime(b(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
    expect(sniffMime(b(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe("image/png");
    expect(sniffMime(Buffer.from("RIFF\0\0\0\0WEBPVP8 "))).toBe("image/webp");
  });
  it("refuse exécutables, HTML, SVG, vide", () => {
    expect(sniffMime(Buffer.from("MZ\x90\0"))).toBeNull();
    expect(sniffMime(Buffer.from("<html><script>"))).toBeNull();
    expect(sniffMime(Buffer.from("<svg xmlns"))).toBeNull();
    expect(sniffMime(new Uint8Array())).toBeNull();
  });
  it("nom d'affichage assaini", () => expect(safeDisplayName("../../etc/passwd\n.pdf")).not.toMatch(/[\\/\n]/));
});
