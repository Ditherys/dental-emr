import { describe, expect, it } from "vitest";

import {
  APPROVED_REDIRECT_ORIGINS,
  evaluateHostedAuthPolicy,
  HOSTED_AUTH_POLICY,
  summarizeHostedAuthFindings,
} from "./hosted-auth-policy.mjs";

/** A configuration that satisfies every rule. */
const compliantConfiguration = {
  disable_signup: true,
  external_anonymous_users_enabled: false,
  mailer_autoconfirm: false,
  mfa_totp_enroll_enabled: true,
  mfa_totp_verify_enabled: true,
  mfa_phone_enroll_enabled: false,
  mfa_phone_verify_enabled: false,
  password_min_length: 12,
  password_hibp_enabled: true,
  password_required_characters:
    "abcdefghijklmnopqrstuvwxyz:ABCDEFGHIJKLMNOPQRSTUVWXYZ:0123456789",
  security_update_password_require_reauthentication: true,
  refresh_token_rotation_enabled: true,
  security_refresh_token_reuse_interval: 10,
  jwt_exp: 3600,
  uri_allow_list: "http://127.0.0.1:3000,http://localhost:3000",
};

const context = { environment: "test" };

function findingFor(result, key) {
  return result.findings.find((finding) => finding.key === key);
}

describe("hosted Auth policy", () => {
  it("documents an expectation and a reason for every rule", () => {
    for (const rule of HOSTED_AUTH_POLICY) {
      expect(rule.expectation ?? "").not.toBe("");
      expect(rule.reason ?? "").not.toBe("");
    }
  });

  it("accepts a compliant hosted configuration", () => {
    const result = evaluateHostedAuthPolicy(compliantConfiguration, context);

    expect(summarizeHostedAuthFindings(result.findings)).toEqual({
      ok: HOSTED_AUTH_POLICY.length,
      violations: 0,
      unverified: 0,
    });
  });

  // The whole point of the checker.
  it.each([
    ["disable_signup", false],
    ["external_anonymous_users_enabled", true],
    ["mailer_autoconfirm", true],
    ["mfa_totp_enroll_enabled", false],
    ["mfa_totp_verify_enabled", false],
    ["mfa_phone_enroll_enabled", true],
    ["mfa_phone_verify_enabled", true],
    ["password_min_length", 8],
    ["password_required_characters", ""],
    ["password_hibp_enabled", false],
    ["security_update_password_require_reauthentication", false],
    ["refresh_token_rotation_enabled", false],
    ["security_refresh_token_reuse_interval", 600],
    ["jwt_exp", 86400],
  ])("reports %s as a violation when it is weakened", (key, weakened) => {
    const result = evaluateHostedAuthPolicy(
      { ...compliantConfiguration, [key]: weakened },
      context,
    );

    expect(findingFor(result, key)?.status).toBe("violation");
  });

  it("treats an unreported setting as unverified, never as compliant", () => {
    const withoutSignupSetting = { ...compliantConfiguration };
    delete withoutSignupSetting.disable_signup;

    const result = evaluateHostedAuthPolicy(withoutSignupSetting, context);

    expect(findingFor(result, "disable_signup")?.status).toBe("not-reported");
    expect(summarizeHostedAuthFindings(result.findings).unverified).toBe(1);
  });

  it("treats an unreadable payload as entirely unverified", () => {
    for (const payload of [null, undefined, "not-json"]) {
      const result = evaluateHostedAuthPolicy(payload, context);

      expect(result.inspected).toBe(0);
      expect(summarizeHostedAuthFindings(result.findings).unverified).toBe(
        HOSTED_AUTH_POLICY.length,
      );
    }
  });
});

describe("redirect allow list", () => {
  it.each([
    ["a wildcard entry", "http://localhost:3000,https://*.example.test"],
    ["a bare wildcard", "*"],
    ["an unapproved origin", "https://attacker.example.test"],
    ["an approved origin beside an unapproved one", "http://localhost:3000,https://attacker.example.test"],
    ["an unparseable entry", "localhost:3000"],
    ["an empty list", ""],
  ])("refuses %s", (_label, uriAllowList) => {
    const result = evaluateHostedAuthPolicy(
      { ...compliantConfiguration, uri_allow_list: uriAllowList },
      context,
    );

    expect(findingFor(result, "uri_allow_list")?.status).toBe("violation");
  });

  it("refuses an environment with no approved origin list", () => {
    const result = evaluateHostedAuthPolicy(compliantConfiguration, {
      environment: "production",
    });

    expect(findingFor(result, "uri_allow_list")?.status).toBe("violation");
  });

  it("accepts every origin it approves for an environment", () => {
    for (const [environment, origins] of Object.entries(
      APPROVED_REDIRECT_ORIGINS,
    )) {
      const result = evaluateHostedAuthPolicy(
        { ...compliantConfiguration, uri_allow_list: origins.join(",") },
        { environment },
      );

      expect(findingFor(result, "uri_allow_list")?.status).toBe("ok");
    }
  });

  it("accepts an approved origin carrying the application callback path", () => {
    const result = evaluateHostedAuthPolicy(
      {
        ...compliantConfiguration,
        uri_allow_list: "http://127.0.0.1:3000/auth/confirm",
      },
      context,
    );

    expect(findingFor(result, "uri_allow_list")?.status).toBe("ok");
  });
});
