import { Suspense, type ReactNode } from "react";
import { SiteShell } from "@/components/site/shell";

export default function SiteLayout({ children }: { children: ReactNode }) {
  return <Suspense fallback={<p className="p-8 text-sm">Chargement…</p>}><SiteShell>{children}</SiteShell></Suspense>;
}
