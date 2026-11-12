"use client";
import { useActionState } from "react";
import { FormMessage } from "@/components/admin/form-message";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/client";
import { addAgentAction, setMemberActiveAction, setMemberRoleAction } from "@/server/admin/actions";

type Role = { id: string; label: string };
const input = "min-h-11 w-full rounded-lg border border-slate-300 bg-surface px-3 text-sm";

export function AddAgentForm({ roles }: { roles: Role[] }) {
  const { t } = useI18n();
  const [state, action, pending] = useActionState(addAgentAction, undefined);
  return (
    <form action={action} className="grid gap-3 rounded-2xl bg-surface p-5 shadow-sm sm:grid-cols-2">
      <h2 className="font-semibold sm:col-span-2">{t("adm.ag.add")}</h2>
      <label className="flex flex-col gap-1 text-sm">{t("adm.ag.name")}<input name="name" required minLength={2} className={input} /></label>
      <label className="flex flex-col gap-1 text-sm">{t("adm.ag.email")}<input name="email" type="email" required className={input} /></label>
      <label className="flex flex-col gap-1 text-sm">{t("adm.ag.role")}<select name="roleId" required className={input}>{roles.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</select></label>
      <div className="flex items-end"><Button disabled={pending} className="w-full">{t("adm.ag.add")}</Button></div>
      <div className="sm:col-span-2"><FormMessage state={state} /></div>
    </form>
  );
}

export function MemberRow({ memberId, name, email, roleId, active, roles }: { memberId: string; name: string; email: string; roleId: string; active: boolean; roles: Role[] }) {
  const { t } = useI18n();
  const [rs, roleAction, rp] = useActionState(setMemberRoleAction, undefined);
  const [as, activeAction, ap] = useActionState(setMemberActiveAction, undefined);
  return (
    <li className={`flex flex-col gap-2 rounded-xl border p-3 text-sm ${active ? "border-slate-200 bg-surface" : "border-slate-200 bg-slate-50 opacity-80"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2"><span><strong>{name || "—"}</strong> <span className="text-slate-600">{email}</span></span>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${active ? "bg-accent-50 text-accent-700" : "bg-slate-200 text-slate-700"}`}>{active ? t("adm.ag.active") : t("adm.ag.inactive")}</span></div>
      <div className="flex flex-wrap items-center gap-2">
        <form action={roleAction} className="flex gap-2"><input type="hidden" name="memberId" value={memberId} />
          <select name="roleId" defaultValue={roleId} className={input + " !w-auto"} aria-label={t("adm.ag.role")}>{roles.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</select>
          <Button variant="secondary" disabled={rp} className="!min-h-11">{t("adm.ag.update")}</Button></form>
        <form action={activeAction}><input type="hidden" name="memberId" value={memberId} /><input type="hidden" name="active" value={String(!active)} />
          <Button variant="ghost" disabled={ap} className="!min-h-11">{active ? t("adm.ag.deactivate") : t("adm.ag.activate")}</Button></form>
      </div>
      <FormMessage state={rs} /><FormMessage state={as} />
    </li>
  );
}
