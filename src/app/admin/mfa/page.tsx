import { Suspense } from "react";
import { redirect } from "next/navigation";
import { I18nProvider } from "@/i18n/client";
import { getLocale } from "@/i18n/server";
import { messagesFor } from "@/i18n/messages";
import { createServerSupabase } from "@/lib/supabase/server";
import { MfaForm } from "./mfa-form";

async function Content() {
  const { data } = await (await createServerSupabase()).auth.getUser();
  if (!data.user) redirect("/admin/connexion");
  const locale = await getLocale();
  return <I18nProvider locale={locale} messages={messagesFor(locale)}><main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-4 p-6"><MfaForm /></main></I18nProvider>;
}
export default function Page() { return <Suspense fallback={null}><Content /></Suspense>; }
