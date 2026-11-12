export type Localized = Record<string, string>;
export type FieldType = "text" | "textarea" | "date" | "time" | "select" | "radio" | "phone" | "number";
export interface Condition { field: string; op: "eq" | "neq" | "in"; value: unknown }
export interface FieldOption { value: string; label: Localized }
export interface FieldDef {
  key: string; label: Localized; help?: Localized; type: FieldType; required: boolean;
  options?: FieldOption[] | null;
  validation?: { min?: number; max?: number; pattern?: string };
  visible_if?: Condition | null; step: 2 | 3; sort_order: number;
}
export interface DocumentDef { key: string; label: Localized; required: boolean; max_size_kb: number; sort_order: number }
export interface ServiceSummary { code: string; icon: string; name: Localized; description: Localized; amount_xof: number | null; indicative_delay_days: number | null }
export interface ServiceDetail extends ServiceSummary { procedure: Localized; fields: FieldDef[]; documents: DocumentDef[] }
export interface UploadedFile { id: string; document_key: string; original_name: string; mime_type: string; size_bytes: number }
export type FormData_ = Record<string, string>;
