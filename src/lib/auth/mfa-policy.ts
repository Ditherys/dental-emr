export type AuthenticatorAssurance = {
  currentLevel: string | null;
  nextLevel: string | null;
};

export function hasCurrentAal2(assurance: AuthenticatorAssurance) {
  return (
    assurance.currentLevel === "aal2" && assurance.nextLevel === "aal2"
  );
}

export function needsMfaChallenge(assurance: AuthenticatorAssurance) {
  return (
    assurance.currentLevel !== "aal2" && assurance.nextLevel === "aal2"
  );
}

export function isValidTotpCode(value: string) {
  return /^\d{6}$/.test(value);
}
