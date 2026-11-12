import Link from "next/link";
import { Icon } from "@/components/ui/icons";
import { pickLocalized, type Locale } from "@/i18n/messages";
import type { ServiceSummary } from "@/features/demande/types";

export function ServiceCard({ s, locale, price }: { s: ServiceSummary; locale: Locale; price: string }) {
  return (
    <Link href={`/services/${s.code}`} className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-surface p-5 shadow-sm transition hover:border-brand-600">
      <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-brand-700"><Icon name={s.icon} className="h-7 w-7" /></span>
      <span className="text-lg font-semibold text-brand-900">{pickLocalized(s.name, locale)}</span>
      <span className="text-sm text-slate-600">{pickLocalized(s.description, locale)}</span>
      <span className="mt-1 text-sm font-medium text-accent-700">{price}</span>
    </Link>
  );
}
