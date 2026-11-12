"use client";
import { useI18n } from "@/i18n/client";
import type { MessageKey } from "@/i18n/messages";
import type { ActionState } from "@/server/admin/actions";

export function FormMessage({ state }: { state: ActionState }) {
  const { t } = useI18n();
  if (!state) return null;
  if (state.error) return <p role="alert" className="text-sm font-medium text-red-700">{t(state.error as MessageKey)}</p>;
  if (state.ok && state.message) return <p role="status" className="text-sm font-medium text-accent-700">{t(state.message as MessageKey)}</p>;
  return null;
}
