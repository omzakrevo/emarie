import { Suspense, type ReactNode } from "react";
import { AdminShell } from "@/components/admin/shell";

export default function PanelLayout({ children }: { children: ReactNode }) {
  return <Suspense fallback={<p className="p-6 text-sm">Chargement…</p>}><AdminShell>{children}</AdminShell></Suspense>;
}
