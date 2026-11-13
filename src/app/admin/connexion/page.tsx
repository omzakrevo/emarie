import { Suspense } from "react";
import { I18nProvider } from "@/i18n/client";
import { getLocale } from "@/i18n/server";
import { messagesFor } from "@/i18n/messages";
import { LoginForm } from "./login-form";

export default function Page({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  return <Suspense fallback={null}><Content searchParams={searchParams} /></Suspense>;
}

async function Content({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const locale = await getLocale(); const messages = messagesFor(locale);
  return (
    <I18nProvider locale={locale} messages={messages}>
      <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-4 p-6">
        <h1 className="text-2xl font-semibold text-brand-900">{messages["adm.login.title"]}</h1>
        {error === "forbidden" && <p role="alert" className="rounded bg-amber-50 p-3 text-sm text-amber-900">{messages["adm.login.forbidden"]}</p>}
        <LoginForm />
      </main>
    </I18nProvider>
  );
}
