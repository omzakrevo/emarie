import type { ReactNode } from "react";
export function TextPage({ title, children }: { title: string; children: ReactNode }) {
  return <article className="rounded-2xl bg-surface p-6 shadow-sm"><h1 className="mb-4 text-2xl font-bold text-brand-900">{title}</h1><div className="whitespace-pre-line text-slate-800">{children}</div></article>;
}
