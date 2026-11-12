"use client";
import { pickLocalized } from "@/i18n/messages";
import { useI18n } from "@/i18n/client";
import type { FieldDef } from "@/features/demande/types";
import type { ErrorCode } from "@/features/demande/fields";

const input = "min-h-12 w-full rounded-xl border border-slate-300 bg-surface px-4 text-base focus:border-brand-600";

export function FieldInput({ def, value, error, onChange }: { def: FieldDef; value: string; error?: ErrorCode; onChange: (v: string) => void }) {
  const { t, locale } = useI18n();
  const id = `f-${def.key}`;
  const label = pickLocalized(def.label, locale);
  const help = def.help ? pickLocalized(def.help, locale) : "";
  const common = { id, name: def.key, "aria-invalid": !!error, "aria-describedby": error ? `${id}-err` : help ? `${id}-help` : undefined } as const;
  const today = new Date().toISOString().slice(0, 10);

  let control;
  switch (def.type) {
    case "textarea":
      control = <textarea {...common} rows={3} className={input + " py-3"} value={value} onChange={(e) => onChange(e.target.value)} />; break;
    case "select":
      control = (
        <select {...common} className={input} value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">—</option>
          {def.options?.map((o) => <option key={o.value} value={o.value}>{pickLocalized(o.label, locale)}</option>)}
        </select>); break;
    case "radio":
      control = (
        <div role="radiogroup" aria-labelledby={`${id}-label`} className="flex flex-wrap gap-2">
          {def.options?.map((o) => (
            <label key={o.value} className={`flex min-h-12 cursor-pointer items-center gap-2 rounded-xl border px-4 ${value === o.value ? "border-brand-600 bg-brand-50 font-semibold" : "border-slate-300 bg-surface"}`}>
              <input type="radio" name={def.key} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} className="h-4 w-4 accent-brand-700" />
              {pickLocalized(o.label, locale)}
            </label>))}
        </div>); break;
    default: {
      const type = def.type === "phone" ? "tel" : def.type === "number" ? "text" : def.type;
      control = (
        <input {...common} type={type} className={input} value={value} onChange={(e) => onChange(e.target.value)}
          inputMode={def.type === "phone" ? "tel" : def.type === "number" ? "decimal" : undefined}
          autoComplete={def.type === "phone" ? "tel" : "off"} max={def.type === "date" ? today : undefined} />);
    }
  }
  return (
    <div className="flex flex-col gap-1.5">
      <label id={`${id}-label`} htmlFor={def.type === "radio" ? undefined : id} className="text-sm font-medium">
        {label}{" "}
        <span className="font-normal text-slate-500">({def.required ? t("common.required") : t("common.optional")})</span>
      </label>
      {control}
      {help && !error && <p id={`${id}-help`} className="text-sm text-slate-600">{help}</p>}
      {error && <p id={`${id}-err`} role="alert" className="text-sm font-medium text-red-700">{t(`error.${error}` as never)}</p>}
    </div>
  );
}
