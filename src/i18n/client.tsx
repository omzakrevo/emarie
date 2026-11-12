"use client";
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { format, type Locale, type MessageKey } from "./messages";

interface Ctx { locale: Locale; messages: Record<MessageKey, string> }
const I18nContext = createContext<Ctx | null>(null);

export function I18nProvider({ locale, messages, children }: Ctx & { children: ReactNode }) {
  const value = useMemo(() => ({ locale, messages }), [locale, messages]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
export function useI18n() {
  const c = useContext(I18nContext);
  if (!c) throw new Error("I18nProvider manquant");
  return { locale: c.locale, t: (k: MessageKey, p?: Record<string, string | number>) => format(c.messages[k], p) };
}
