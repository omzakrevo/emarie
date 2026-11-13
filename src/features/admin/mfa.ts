/** Double authentification des agents : exigée si REQUIRE_AGENT_MFA=1 et que la session n'est pas au niveau « aal2 ». */
export function mfaRequired(flag: string | undefined, currentLevel: string | null | undefined): boolean {
  return flag === "1" && currentLevel !== "aal2";
}
