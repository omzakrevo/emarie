"use client";
import { useActionState } from "react";
import { FormMessage } from "@/components/admin/form-message";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/client";
import { uploadLogoAction } from "@/server/documents/actions";

export function LogoForm({ currentUrl }: { currentUrl: string | null }) {
  const { t } = useI18n(); const [s, action, pending] = useActionState(uploadLogoAction, undefined);
  return (<form action={action} className="flex flex-col gap-3 rounded-2xl bg-surface p-5 shadow-sm"><h2 className="font-semibold">{t("adm.st.logo")}</h2>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    {currentUrl && <img src={currentUrl} alt="" className="h-20 w-20 rounded-lg border border-slate-200 object-contain" />}
    <p className="text-sm text-slate-600">{t("adm.st.logoHint")}</p>
    <input type="file" name="logo" accept="image/png,image/jpeg,image/webp" required className="text-sm" />
    <Button variant="secondary" disabled={pending}>{t("adm.st.logoSave")}</Button><FormMessage state={s} /></form>);
}
