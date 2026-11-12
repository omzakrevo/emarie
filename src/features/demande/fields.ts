import type { Condition, FieldDef, FormData_ } from "./types";

/** Logique pure partagée client/serveur : le serveur reste l'autorité (il revalide tout à la soumission). */
export function evalCondition(c: Condition | null | undefined, data: FormData_): boolean {
  if (!c) return true;
  const v = data[c.field] ?? "";
  if (c.op === "eq") return v === c.value;
  if (c.op === "neq") return v !== c.value;
  if (c.op === "in") return Array.isArray(c.value) && c.value.includes(v);
  return false;
}

export function visibleFields(fields: FieldDef[], data: FormData_, step?: 2 | 3): FieldDef[] {
  return fields
    .filter((f) => (step ? f.step === step : true) && evalCondition(f.visible_if, data))
    .sort((a, b) => a.sort_order - b.sort_order);
}

export type ErrorCode = "required" | "too_short" | "too_long" | "invalid_format" | "invalid_date" | "future_date" | "invalid_option" | "invalid_number";

const isRealDate = (s: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};

/** Normalise un numéro : 8 chiffres burkinabè -> +226XXXXXXXX ; sinon format international conservé. */
export function normalizePhone(raw: string): string | null {
  const s = raw.replace(/[\s.-]/g, "");
  if (/^\d{8}$/.test(s)) return `+226${s}`;
  if (/^(\+|00)226\d{8}$/.test(s)) return `+226${s.slice(-8)}`;
  if (/^\+\d{8,15}$/.test(s)) return s;
  return null;
}

export function validateField(f: FieldDef, raw: string | undefined, today = new Date().toISOString().slice(0, 10)): ErrorCode | null {
  const v = (raw ?? "").trim();
  if (v === "") return f.required ? "required" : null;
  const max = f.validation?.max ?? (f.type === "textarea" ? 1000 : 200);
  const min = f.validation?.min ?? 0;
  switch (f.type) {
    case "text": case "textarea":
      if (v.length < min) return "too_short";
      if (v.length > max) return "too_long";
      if (f.validation?.pattern) { try { if (!new RegExp(f.validation.pattern).test(v)) return "invalid_format"; } catch { /* motif invalide ignoré */ } }
      return null;
    case "date":
      if (!isRealDate(v) || v < "1900-01-01") return "invalid_date";
      return v > today ? "future_date" : null;
    case "time": return /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? null : "invalid_format";
    case "phone": return normalizePhone(v) ? null : "invalid_format";
    case "number": return /^-?\d+(\.\d+)?$/.test(v) ? null : "invalid_number";
    case "select": case "radio": return f.options?.some((o) => o.value === v) ? null : "invalid_option";
  }
}

export function validateFields(fields: FieldDef[], data: FormData_, step?: 2 | 3, today?: string): Record<string, ErrorCode> {
  const errors: Record<string, ErrorCode> = {};
  for (const f of visibleFields(fields, data, step)) {
    const e = validateField(f, data[f.key], today);
    if (e) errors[f.key] = e;
  }
  return errors;
}

/** Ne garde que les champs connus ET visibles, en texte rogné (aucune clé arbitraire stockée). */
export function sanitizeData(fields: FieldDef[], data: Record<string, unknown>): FormData_ {
  const input: FormData_ = {};
  for (const f of fields) { const v = data[f.key]; if (typeof v === "string") input[f.key] = v.trim().slice(0, 1000); }
  const out: FormData_ = {};
  for (const f of visibleFields(fields, input)) {
    if (input[f.key] !== undefined && input[f.key] !== "") out[f.key] = f.type === "phone" ? normalizePhone(input[f.key]) ?? input[f.key] : input[f.key];
  }
  return out;
}
