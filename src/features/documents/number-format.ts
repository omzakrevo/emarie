/** Format de numéro d'un document : jetons {year} {seq} {seq3} {seq6} {prefix} ; doit contenir un compteur. Même règle que la base (next_document_number). */
const ALLOWED = /^[A-Za-z0-9{}/_. -]{3,60}$/;
export function validateNumberFormat(fmt: string): boolean {
  if (!ALLOWED.test(fmt) || !/\{seq(3|6)?\}/.test(fmt)) return false;
  return (fmt.match(/\{[a-z0-9]*\}/g) ?? []).every((t) => ["{year}", "{seq}", "{seq3}", "{seq6}", "{prefix}"].includes(t));
}
export function previewNumber(fmt: string, prefix: string, year: number, seq: number): string {
  return fmt.replace("{year}", String(year)).replace("{prefix}", prefix).replace("{seq3}", String(seq).padStart(3, "0")).replace("{seq6}", String(seq).padStart(6, "0")).replace("{seq}", String(seq));
}
