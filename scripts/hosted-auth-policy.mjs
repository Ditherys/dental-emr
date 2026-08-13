/**
 * The intended hosted Supabase Auth posture for this project, as data.
 *
 * Every rule states the setting, the expectation, and why the expectation
 * exists. Changing the posture means editing this file, which is a
 * review-visible diff — the same gate `scripts/approved-final-grants.mjs`
 * provides for database privileges.
 *
 * This module is pure. It performs no I/O and holds no credential.
 *
 * FAIL-CLOSED: a setting the API does not report is a VIOLATION, not a pass.
 * Supabase renames and adds configuration keys; a checker that quietly skips an
 * absent key would report a clean posture it never actually inspected.
 */

/** Origins permitted in the hosted redirect allow list, by environment. */
export const APPROVED_REDIRECT_ORIGINS = Object.freeze({
  development: Object.freeze(["http://localhost:3000", "http://127.0.0.1:3000"]),
  test: Object.freeze(["http://localhost:3000", "http://127.0.0.1:3000"]),
});

const BOOLEAN = "boolean";
const NUMBER = "number";

/**
 * @typedef {{
 *   key: string,
 *   type: 'boolean' | 'number' | 'list',
 *   expectation: string,
 *   reason: string,
 *   satisfied: (value: unknown, context: { environment: string }) => boolean,
 * }} AuthPolicyRule
 */

/** @type {readonly AuthPolicyRule[]} */
export const HOSTED_AUTH_POLICY = Object.freeze([
  {
    key: "disable_signup",
    type: BOOLEAN,
    expectation: "true",
    reason:
      "Workforce onboarding is invitation-only. Open signup would let anyone create an identity against a project that holds health information.",
    satisfied: (value) => value === true,
  },
  {
    key: "external_anonymous_users_enabled",
    type: BOOLEAN,
    expectation: "false",
    reason:
      "Anonymous identities have no workforce membership and no accountable actor for audit events.",
    satisfied: (value) => value === false,
  },
  {
    key: "mailer_autoconfirm",
    type: BOOLEAN,
    expectation: "false",
    reason:
      "Auto-confirming email would let an unverified address hold a session, breaking the invitation binding the application relies on.",
    satisfied: (value) => value === false,
  },
  {
    key: "mfa_totp_enroll_enabled",
    type: BOOLEAN,
    expectation: "true",
    reason:
      "Authenticator-app enrollment is the approved workforce second factor; the AAL2 administrative RPCs are unreachable without it.",
    satisfied: (value) => value === true,
  },
  {
    key: "mfa_totp_verify_enabled",
    type: BOOLEAN,
    expectation: "true",
    reason:
      "Enrollment without verification cannot produce an AAL2 session, so every step-up-gated action would fail.",
    satisfied: (value) => value === true,
  },
  {
    key: "mfa_phone_enroll_enabled",
    type: BOOLEAN,
    expectation: "false",
    reason:
      "SMS is not the approved workforce factor. Enabling it would offer a weaker second factor beside the intended one.",
    satisfied: (value) => value === false,
  },
  {
    key: "mfa_phone_verify_enabled",
    type: BOOLEAN,
    expectation: "false",
    reason: "Same rationale as phone enrollment.",
    satisfied: (value) => value === false,
  },
  {
    key: "password_min_length",
    type: NUMBER,
    expectation: ">= 12",
    reason:
      "Workforce accounts reach health information. Supabase's default of 6 is below the project's approved floor.",
    satisfied: (value) => typeof value === "number" && value >= 12,
  },
  {
    key: "password_required_characters",
    type: "list",
    expectation: "a non-empty character-class requirement",
    reason:
      "Length alone permits trivially guessable secrets for accounts that carry clinical authority.",
    satisfied: (value) => typeof value === "string" && value.trim() !== "",
  },
  {
    // Added after the Supabase security advisor flagged this as disabled on the
    // first real TEST project (R6-E). The R4 policy had missed it entirely.
    //
    // Supabase gates this feature on Pro plan and above, so a disposable
    // Free-tier TEST project cannot enable it. Requiring it everywhere would
    // make this check permanently red on the only project it currently runs
    // against, and a check that can never pass teaches people to ignore it.
    // It is therefore a REQUIREMENT where real credentials exist and an
    // ADVISORY elsewhere — never silently dropped.
    key: "password_hibp_enabled",
    type: BOOLEAN,
    expectation: "true (required in staging/production; plan-gated elsewhere)",
    requiredIn: ["staging", "production"],
    reason:
      "Leaked-password protection checks new passwords against HaveIBeenPwned. Credential stuffing is the most common way a workforce account holding health information is taken over, and a length-and-character policy does nothing against a password that is already public. Provisioning the production project on a plan that supports it is a Phase 1 production gate.",
    satisfied: (value) => value === true,
  },
  {
    key: "security_update_password_require_reauthentication",
    type: BOOLEAN,
    expectation: "true",
    reason:
      "Without reauthentication, a hijacked session can lock out the legitimate owner by changing the password.",
    satisfied: (value) => value === true,
  },
  {
    key: "refresh_token_rotation_enabled",
    type: BOOLEAN,
    expectation: "true",
    reason:
      "Rotation is what makes a stolen refresh token detectable rather than indefinitely usable.",
    satisfied: (value) => value === true,
  },
  {
    key: "security_refresh_token_reuse_interval",
    type: NUMBER,
    expectation: "<= 10 seconds",
    reason:
      "The reuse window exists for races between concurrent requests. A long window is a replay window.",
    satisfied: (value) => typeof value === "number" && value >= 0 && value <= 10,
  },
  {
    key: "jwt_exp",
    type: NUMBER,
    expectation: "<= 3600 seconds",
    reason:
      "Access-token lifetime bounds how long a revoked authorization can still be presented before the next refresh.",
    satisfied: (value) => typeof value === "number" && value > 0 && value <= 3600,
  },
  {
    key: "uri_allow_list",
    type: "list",
    expectation: "only approved origins for this environment, no wildcard",
    reason:
      "The redirect allow list is what stops an invitation or recovery link from delivering a session to an attacker-controlled origin. A wildcard defeats it entirely.",
    satisfied: (value, context) => {
      if (typeof value !== "string" || value.trim() === "") {
        return false;
      }

      const approved = APPROVED_REDIRECT_ORIGINS[context.environment];

      if (!approved) {
        return false;
      }

      const entries = value
        .split(",")
        .map((entry) => entry.trim())
        .filter((entry) => entry !== "");

      if (entries.length === 0) {
        return false;
      }

      return entries.every((entry) => {
        if (entry.includes("*")) {
          return false;
        }

        let parsed;

        try {
          parsed = new URL(entry);
        } catch {
          return false;
        }

        return approved.includes(parsed.origin);
      });
    },
  },
]);

/**
 * Evaluates a hosted Auth configuration object against the policy.
 *
 * @param {Record<string, unknown> | null | undefined} configuration
 * @param {{ environment: string }} context
 */
export function evaluateHostedAuthPolicy(configuration, context) {
  if (!configuration || typeof configuration !== "object") {
    return {
      inspected: 0,
      findings: HOSTED_AUTH_POLICY.map((rule) => ({
        key: rule.key,
        status: "unreadable",
        expectation: rule.expectation,
        reason: rule.reason,
        observed: null,
      })),
    };
  }

  const findings = HOSTED_AUTH_POLICY.map((rule) => {
    if (!Object.hasOwn(configuration, rule.key)) {
      return {
        key: rule.key,
        // Fail closed. An unreported setting was not verified, and "not
        // verified" must never render as "compliant".
        status: "not-reported",
        expectation: rule.expectation,
        reason: rule.reason,
        observed: null,
      };
    }

    const observed = configuration[rule.key];

    if (rule.satisfied(observed, context)) {
      return {
        key: rule.key,
        status: "ok",
        expectation: rule.expectation,
        reason: rule.reason,
        observed,
      };
    }

    // A rule scoped to specific environments still reports everywhere — it just
    // does not fail a run in an environment where it is not yet required. The
    // finding stays visible so it cannot be forgotten at the production gate.
    const required = rule.requiredIn
      ? rule.requiredIn.includes(context.environment)
      : true;

    return {
      key: rule.key,
      status: required ? "violation" : "advisory",
      expectation: rule.expectation,
      reason: rule.reason,
      observed,
    };
  });

  return {
    inspected: findings.filter((finding) => finding.status !== "unreadable")
      .length,
    findings,
  };
}

export function summarizeHostedAuthFindings(findings) {
  return {
    ok: findings.filter((finding) => finding.status === "ok").length,
    violations: findings.filter((finding) => finding.status === "violation")
      .length,
    unverified: findings.filter((finding) =>
      ["not-reported", "unreadable"].includes(finding.status),
    ).length,
    // Reported, deliberately non-failing in this environment, never dropped.
    advisories: findings.filter((finding) => finding.status === "advisory")
      .length,
  };
}
