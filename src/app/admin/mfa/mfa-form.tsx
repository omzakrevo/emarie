"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/client";
import { createBrowserSupabase } from "@/lib/supabase/browser";

/** Double authentification TOTP (application d'authentification). Inscription au premier passage, puis simple vérification. */
export function MfaForm() {
  const { t } = useI18n();
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const sb = createBrowserSupabase();
      const { data } = await sb.auth.mfa.listFactors();
      const verified = data?.totp?.[0];
      if (verified) { setFactorId(verified.id); return; }
      const en = await sb.auth.mfa.enroll({ factorType: "totp" });
      if (en.error || !en.data) { setError(t("adm.mfa.error")); return; }
      setFactorId(en.data.id); setQr(en.data.totp.qr_code); setSecret(en.data.totp.secret);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function verify() {
    if (!factorId || !/^\d{6}$/.test(code)) { setError(t("adm.mfa.badCode")); return; }
    setBusy(true); setError("");
    const sb = createBrowserSupabase();
    const ch = await sb.auth.mfa.challenge({ factorId });
    if (ch.error || !ch.data) { setBusy(false); setError(t("adm.mfa.error")); return; }
    const v = await sb.auth.mfa.verify({ factorId, challengeId: ch.data.id, code });
    setBusy(false);
    if (v.error) { setError(t("adm.mfa.badCode")); return; }
    // rechargement complet voulu : le serveur doit relire la session (niveau aal2)
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = "/admin";
  }

  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-2xl font-semibold text-brand-900">{t("adm.mfa.title")}</h1>
      {qr && (<><p className="text-sm">{t("adm.mfa.scan")}</p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qr} alt={t("adm.mfa.qrAlt")} className="h-44 w-44 rounded-lg border border-slate-200 bg-white p-2" />
        {secret && <p className="text-xs text-slate-600">{t("adm.mfa.manual")} <code className="break-all">{secret}</code></p>}</>)}
      <label className="flex flex-col gap-1 text-sm font-medium">{t("adm.mfa.code")}
        <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" className="min-h-12 rounded-xl border border-slate-300 p-3 tracking-widest" />
      </label>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <Button type="button" disabled={busy || !factorId} onClick={verify}>{t("adm.mfa.verify")}</Button>
    </div>
  );
}
