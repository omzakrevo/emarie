export type AllowedMime = "application/pdf" | "image/jpeg" | "image/png" | "image/webp";
export const EXT: Record<AllowedMime, string> = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/** Détermine le type réel d'après les premiers octets (le type annoncé par le navigateur n'est jamais cru). */
export function sniffMime(b: Uint8Array): AllowedMime | null {
  const s = (i: number, str: string) => str.split("").every((c, k) => b[i + k] === c.charCodeAt(0));
  if (b.length >= 5 && s(0, "%PDF-")) return "application/pdf";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 8 && b[0] === 0x89 && s(1, "PNG") && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return "image/png";
  if (b.length >= 12 && s(0, "RIFF") && s(8, "WEBP")) return "image/webp";
  return null;
}
/** Nom de fichier d'origine : conservé pour affichage uniquement, jamais utilisé comme chemin. */
export function safeDisplayName(name: string): string {
  return name.replace(/[\u0000-\u001f\\/]/g, "_").replace(/\s+/g, " ").trim().slice(0, 120) || "fichier";
}
