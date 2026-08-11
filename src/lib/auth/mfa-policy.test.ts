import { describe, expect, it } from "vitest";

import {
  hasCurrentAal2,
  isValidTotpCode,
  needsMfaChallenge,
} from "./mfa-policy";

describe("MFA assurance policy", () => {
  it.each([
    [{ currentLevel: "aal2", nextLevel: "aal2" }, true],
    [{ currentLevel: "aal1", nextLevel: "aal2" }, false],
    [{ currentLevel: "aal1", nextLevel: "aal1" }, false],
    [{ currentLevel: "aal2", nextLevel: "aal1" }, false],
    [{ currentLevel: null, nextLevel: null }, false],
    [{ currentLevel: "unexpected", nextLevel: "aal2" }, false],
  ])("grants AAL2 only for a current, still-enrolled factor: %j", (levels, expected) => {
    expect(hasCurrentAal2(levels)).toBe(expected);
  });

  it.each([
    [{ currentLevel: "aal1", nextLevel: "aal2" }, true],
    [{ currentLevel: null, nextLevel: "aal2" }, true],
    [{ currentLevel: "aal2", nextLevel: "aal2" }, false],
    [{ currentLevel: "aal1", nextLevel: "aal1" }, false],
    [{ currentLevel: "aal2", nextLevel: "aal1" }, false],
  ])("requires a challenge only when a verified factor can raise assurance: %j", (levels, expected) => {
    expect(needsMfaChallenge(levels)).toBe(expected);
  });

  it.each([
    ["123456", true],
    ["12345", false],
    ["1234567", false],
    ["123 456", false],
    ["abcdef", false],
    ["", false],
  ])("validates the six-digit TOTP shape for %j", (code, expected) => {
    expect(isValidTotpCode(code)).toBe(expected);
  });
});
