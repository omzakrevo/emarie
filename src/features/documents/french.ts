const UNITS = ["zéro", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf", "dix", "onze", "douze", "treize", "quatorze", "quinze", "seize", "dix-sept", "dix-huit", "dix-neuf"];
const TENS = ["", "", "vingt", "trente", "quarante", "cinquante", "soixante"];

/** 0..99, orthographe rectifiée (traits d'union). `final` : « quatre-vingts » prend un s seulement en fin de nombre. */
function below100(n: number, final: boolean): string {
  if (n < 20) return UNITS[n];
  const t = Math.floor(n / 10), u = n % 10;
  if (t === 7) return `soixante-${u === 1 ? "et-onze" : UNITS[10 + u]}`;
  if (t === 8) return u === 0 ? (final ? "quatre-vingts" : "quatre-vingt") : `quatre-vingt-${UNITS[u]}`;
  if (t === 9) return `quatre-vingt-${UNITS[10 + u]}`;
  if (u === 0) return TENS[t];
  return `${TENS[t]}${u === 1 ? "-et-un" : `-${UNITS[u]}`}`;
}
function below1000(n: number, final: boolean): string {
  const h = Math.floor(n / 100), r = n % 100;
  const head = h === 0 ? "" : h === 1 ? "cent" : `${UNITS[h]} cent${r === 0 && final ? "s" : ""}`;
  if (r === 0) return head || "zéro";
  return head ? `${head} ${below100(r, final)}` : below100(r, final);
}

/** Entier 0..9999 en toutes lettres (« mil » pour les années, selon l'usage des actes d'état civil : mil neuf cent quatre-vingt-dix-huit). */
export function numberToFrench(n: number, opts: { year?: boolean } = {}): string {
  if (!Number.isInteger(n) || n < 0 || n > 9999) throw new RangeError("0..9999 attendu");
  const th = Math.floor(n / 1000), r = n % 1000;
  const thousands = th === 0 ? "" : th === 1 ? (opts.year ? "mil" : "mille") : `${UNITS[th]} mille`;
  if (r === 0) return thousands || "zéro";
  return thousands ? `${thousands} ${below1000(r, true)}` : below1000(r, true);
}

const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

/** « 1998-10-19 » -> « dix-neuf octobre mil neuf cent quatre-vingt-dix-huit » ; le 1er du mois : « premier ». */
export function isoDateToFrenchWords(iso: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || y > 9999) return null;
  return `${d === 1 ? "premier" : numberToFrench(d)} ${MONTHS[mo - 1]} ${numberToFrench(y, { year: true })}`;
}
