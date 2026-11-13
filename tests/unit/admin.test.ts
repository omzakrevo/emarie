import { describe, expect, it } from "vitest";
import { STATUS_GROUPS, summarize } from "@/features/admin/status";
import { dbErrorKey } from "@/features/admin/errors";
import { fr } from "@/i18n/messages";

describe("tableau de bord", () => {
  it("agrège les statuts en indicateurs et ignore les brouillons", () => {
    const s = summarize({ SUBMITTED: 2, PAYMENT_PENDING: 1, PAID: 3, UNDER_REVIEW: 4, VALIDATED: 5, PRINTED: 1, PENDING_SIGNATURE: 2, READY_FOR_PICKUP: 6, WITHDRAWN: 7, REJECTED: 1, DRAFT: 99 });
    expect(s).toMatchObject({ total: 32, pending: 3, toReview: 7, validated: 5, toSign: 3, ready: 6, withdrawn: 7, rejected: 1 });
  });
  it("chaque statut non-brouillon appartient à exactement un groupe", () => {
    const all = ["SUBMITTED","PAYMENT_PENDING","PAID","UNDER_REVIEW","ADDITIONAL_INFO_REQUIRED","REJECTED","VALIDATED","DOCUMENT_GENERATED","PRINTED","PENDING_SIGNATURE","SIGNED","READY_FOR_PICKUP","WITHDRAWN"];
    const flat = Object.values(STATUS_GROUPS).flat() as string[];
    expect([...flat].sort()).toEqual([...all].sort());
  });
  it("tous les statuts ont un libellé", () => { for (const s of Object.values(STATUS_GROUPS).flat()) expect(`status.${s}` in fr).toBe(true); });
});
describe("erreurs de la base", () => {
  it("codes connus -> clés existantes", () => {
    for (const c of ["transition_not_allowed","note_required","payment_required","registry_check_required","forbidden","not_found","role_escalation","last_admin","invalid_input","in_use","template_missing","document_locked","specimen_not_releasable","verification_required","self_approval","price_unknown","payment_in_progress","provider_disabled"]) {
      expect(dbErrorKey(c)).toBe(`adm.err.${c}`); expect(dbErrorKey(c) in fr).toBe(true);
    }
  });
  it("erreur inconnue -> générique, sans fuite du message brut", () => {
    expect(dbErrorKey("duplicate key value violates ...")).toBe("adm.err.generic");
    expect(dbErrorKey(undefined)).toBe("adm.err.generic");
  });
});

import { mfaRequired } from "@/features/admin/mfa";
describe("double authentification des agents", () => {
  it("désactivée par défaut : jamais exigée", () => { expect(mfaRequired(undefined, "aal1")).toBe(false); expect(mfaRequired("0", "aal1")).toBe(false); });
  it("activée : exigée tant que la session n'est pas aal2", () => {
    expect(mfaRequired("1", "aal1")).toBe(true); expect(mfaRequired("1", null)).toBe(true); expect(mfaRequired("1", undefined)).toBe(true); expect(mfaRequired("1", "aal2")).toBe(false);
  });
});
describe("politique de confidentialité et connexion", () => {
  it("toutes les sections de la politique et les messages de connexion existent", () => {
    for (let i = 1; i <= 7; i++) { expect(`privacy.s${i}.t` in fr).toBe(true); expect(`privacy.s${i}.b` in fr).toBe(true); }
    for (const k of ["adm.login.invalid", "adm.login.title", "adm.mfa.title", "privacy.draftNotice", "wizard.privacyNote"]) expect(k in fr, k).toBe(true);
  });
  it("le texte type signale qu'il doit être validé et laisse les points légaux à compléter (rien d'inventé)", () => {
    expect(fr["privacy.draftNotice"]).toMatch(/validé/); expect(fr["privacy.s5.b"]).toContain("[à compléter]"); expect(fr["privacy.s7.b"]).toContain("[Autorité");
  });
});
