/** Résolution de la commune à partir de l'hôte. Fonction pure (testable, utilisable dans proxy.ts). */
const SLUG_RE = /^[a-z0-9-]{2,50}$/;
const RESERVED = new Set(["www", "admin", "api", "app", "static", "assets"]);

export interface ResolveInput {
  host: string | null | undefined;
  rootDomain: string;
  /** Commune utilisée hors sous-domaine (dev local, domaine racine). */
  defaultSlug?: string;
}

export function isValidSlug(s: string): boolean {
  return SLUG_RE.test(s) && !s.startsWith("-") && !s.endsWith("-");
}

export function resolveMunicipalitySlug({ host, rootDomain, defaultSlug }: ResolveInput): string | null {
  const fallback = defaultSlug && isValidSlug(defaultSlug) ? defaultSlug : null;
  if (!host) return fallback;
  const h = host.toLowerCase().split(":")[0].replace(/\.$/, "");
  const root = rootDomain.toLowerCase();
  if (h.endsWith(`.${root}`)) {
    const label = h.slice(0, -(root.length + 1));
    // un seul niveau de sous-domaine accepté
    if (!label.includes(".") && isValidSlug(label) && !RESERVED.has(label)) return label;
    return null;
  }
  return fallback;
}
