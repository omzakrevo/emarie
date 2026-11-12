export const STATUS_GROUPS = {
  pending: ["SUBMITTED", "PAYMENT_PENDING"],
  toReview: ["PAID", "UNDER_REVIEW"],
  infoRequired: ["ADDITIONAL_INFO_REQUIRED"],
  validated: ["VALIDATED"],
  rejected: ["REJECTED"],
  toPrint: ["DOCUMENT_GENERATED"],
  toSign: ["PRINTED", "PENDING_SIGNATURE"],
  signed: ["SIGNED"],
  ready: ["READY_FOR_PICKUP"],
  withdrawn: ["WITHDRAWN"],
} as const;
export type GroupKey = keyof typeof STATUS_GROUPS;

/** Agrège le décompte par statut (hors brouillons) en groupes d'indicateurs. */
export function summarize(byStatus: Record<string, number>): Record<GroupKey | "total", number> {
  const out = { total: 0 } as Record<GroupKey | "total", number>;
  for (const [g, list] of Object.entries(STATUS_GROUPS)) out[g as GroupKey] = list.reduce((n, s) => n + (byStatus[s] ?? 0), 0);
  out.total = Object.entries(byStatus).filter(([s]) => s !== "DRAFT").reduce((n, [, c]) => n + c, 0);
  return out;
}
