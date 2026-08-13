/**
 * Reads the hosted Supabase Auth configuration and asserts the approved posture.
 *
 * READ-ONLY BY CONSTRUCTION. This script issues exactly one HTTP GET. It never
 * PATCHes, never runs `supabase config push`, and therefore can never silently
 * overwrite a hosted setting — a real risk with `config push`, whose generated
 * file also carries unrelated local defaults.
 *
 * When it reports a violation, the fix is a deliberate human change in the
 * Supabase Dashboard, recorded in docs/security/HOSTED_AUTH_BASELINE.md.
 *
 * Credentials: `SUPABASE_ACCESS_TOKEN` is read from the process environment and
 * is never printed. The raw configuration payload is never printed either — it
 * can contain SMTP credentials and provider secrets. Only the specific keys the
 * policy names are reported, and only their scalar values.
 */

import {
  evaluateHostedAuthPolicy,
  summarizeHostedAuthFindings,
} from "./hosted-auth-policy.mjs";

const MANAGEMENT_API = "https://api.supabase.com";
const PROJECT_ID_PATTERN = /^[a-z0-9]{8,40}$/;

function fail(message) {
  console.error(`Hosted Auth verification refused to continue: ${message}`);
  process.exit(1);
}

function required(name) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required.`);
  }

  return value;
}

function resolveTarget() {
  const environment = required("APP_ENVIRONMENT");
  const projectId = required("SUPABASE_PROJECT_ID");

  if (!PROJECT_ID_PATTERN.test(projectId)) {
    throw new Error("SUPABASE_PROJECT_ID is not a valid project reference.");
  }

  const productionProjectId = process.env.SUPABASE_PRODUCTION_PROJECT_ID?.trim();

  if (
    productionProjectId &&
    productionProjectId === projectId &&
    !process.argv.includes("--read-production")
  ) {
    throw new Error(
      "The target is the production project. Re-run with --read-production to " +
        "confirm you intend to read production configuration. This script never writes.",
    );
  }

  if (environment === "test") {
    const testProjectId = required("SUPABASE_TEST_PROJECT_ID");
    const devProjectId = required("SUPABASE_DEV_PROJECT_ID");

    if (projectId !== testProjectId) {
      throw new Error(
        "SUPABASE_PROJECT_ID must match the designated SUPABASE_TEST_PROJECT_ID.",
      );
    }

    if (testProjectId === devProjectId) {
      throw new Error("The designated TEST project must differ from DEV.");
    }
  }

  return { environment, projectId };
}

async function readHostedAuthConfiguration(projectId, accessToken) {
  const response = await fetch(
    `${MANAGEMENT_API}/v1/projects/${projectId}/config/auth`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    },
  );

  if (!response.ok) {
    // The status is safe to surface; the body may not be.
    throw new Error(
      `The Management API returned ${response.status} for the Auth configuration.`,
    );
  }

  return response.json();
}

function renderObserved(observed) {
  if (observed === null || observed === undefined) {
    return "(not reported)";
  }

  if (typeof observed === "string") {
    // Only reached for the redirect allow list and the password character
    // classes, neither of which is a credential.
    return observed.length > 120 ? `${observed.slice(0, 117)}...` : observed;
  }

  return String(observed);
}

try {
  const { environment, projectId } = resolveTarget();
  const accessToken = required("SUPABASE_ACCESS_TOKEN");

  const configuration = await readHostedAuthConfiguration(
    projectId,
    accessToken,
  );
  const { findings } = evaluateHostedAuthPolicy(configuration, { environment });
  const summary = summarizeHostedAuthFindings(findings);

  console.log(`Hosted Auth posture — environment: ${environment}`);
  console.log("");

  for (const finding of findings) {
    const marker =
      finding.status === "ok"
        ? "PASS"
        : finding.status === "violation"
          ? "FAIL"
          : finding.status === "advisory"
            ? "ADVISORY"
            : "UNVERIFIED";

    console.log(`${marker.padEnd(11)} ${finding.key}`);
    console.log(`            expected : ${finding.expectation}`);
    console.log(`            observed : ${renderObserved(finding.observed)}`);

    if (finding.status !== "ok") {
      console.log(`            why      : ${finding.reason}`);
    }
  }

  console.log("");
  console.log(
    `${summary.ok} passed, ${summary.violations} violations, ` +
      `${summary.unverified} unverified, ${summary.advisories} advisory ` +
      `(not required in "${environment}", still required before production).`,
  );

  if (summary.violations > 0 || summary.unverified > 0) {
    console.error("");
    console.error(
      "An unverified setting is treated as a failure: it was not inspected, " +
        "which is not the same as being correct. Fix violations in the Supabase " +
        "Dashboard and record the change in docs/security/HOSTED_AUTH_BASELINE.md.",
    );
    process.exit(1);
  }
} catch (error) {
  fail(error instanceof Error ? error.message : "Unknown failure.");
}
