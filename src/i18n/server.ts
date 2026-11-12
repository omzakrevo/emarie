import "server-only";
import { cookies } from "next/headers";
import { format, LOCALES, messagesFor, type Locale, type MessageKey } from "./messages";

export const LOCALE_COOKIE = "em_locale";
export async function getLocale(): Promise<Locale> {
  const v = (await cookies()).get(LOCALE_COOKIE)?.value;
  return LOCALES.includes(v as Locale) ? (v as Locale) : "fr";
}
export async function getT() {
  const locale = await getLocale();
  const m = messagesFor(locale);
  return { locale, t: (k: MessageKey, p?: Record<string, string | number>) => format(m[k], p) };
}
