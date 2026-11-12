"use client";
import { useState, useTransition } from "react";
import { useI18n } from "@/i18n/client";
import type { MessageKey } from "@/i18n/messages";
import { setRolePermissionAction } from "@/server/admin/actions";

interface Props { roles: { id: string; code: string; label: string }[]; permissions: { code: string; description: string }[]; granted: string[]; mine: string[] }

export function RoleMatrix({ roles, permissions, granted, mine }: Props) {
  const { t } = useI18n();
  const [set, setSet] = useState(new Set(granted));
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const key = (r: string, p: string) => `${r}|${p}`;
  function toggle(roleId: string, perm: string, on: boolean) {
    setError(""); const k = key(roleId, perm);
    setSet((s) => { const n = new Set(s); if (on) n.add(k); else n.delete(k); return n; });
    start(async () => {
      const r = await setRolePermissionAction(roleId, perm, on);
      if (r?.error) { setError(r.error); setSet((s) => { const n = new Set(s); if (on) n.delete(k); else n.add(k); return n; }); }  // annule si refusé
    });
  }
  return (
    <div className="flex flex-col gap-3">
      {error && <p role="alert" className="text-sm font-medium text-red-700">{t(error as MessageKey)}</p>}
      <div className="overflow-x-auto rounded-2xl bg-surface shadow-sm">
        <table className="w-full text-left text-sm">
          <thead><tr className="border-b border-slate-200"><th className="p-3">&nbsp;</th>{roles.map((r) => <th key={r.id} className="p-3 font-semibold">{r.label}</th>)}</tr></thead>
          <tbody>{permissions.map((p) => (
            <tr key={p.code} className="border-b border-slate-100"><th scope="row" className="p-3 font-normal"><span className="block font-medium">{p.description}</span><span className="font-mono text-xs text-slate-500">{p.code}</span></th>
              {roles.map((r) => {
                const locked = r.code === "admin_commune" || !mine.includes(p.code);
                return <td key={r.id} className="p-3"><input type="checkbox" className="h-5 w-5 accent-brand-700" checked={set.has(key(r.id, p.code))} disabled={locked || pending}
                  title={r.code === "admin_commune" ? t("adm.rl.locked") : !mine.includes(p.code) ? t("adm.rl.cannotGrant") : undefined}
                  aria-label={`${r.label} — ${p.description}`} onChange={(e) => toggle(r.id, p.code, e.target.checked)} /></td>; })}</tr>))}</tbody>
        </table>
      </div>
    </div>
  );
}
