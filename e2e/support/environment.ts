const TEST_CONFIRMATION = "I_UNDERSTAND_THIS_IS_SYNTHETIC_CLOUD_TEST_DATA";
const PROJECT_ID_PATTERN = /^[a-z0-9]{8,40}$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function required(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required for hosted foundation E2E tests.`);
  }

  return value;
}

function requiredUuid(name: string) {
  const value = required(name);

  if (!UUID_PATTERN.test(value)) {
    throw new Error(`${name} must be a UUID.`);
  }

  return value;
}

export function loadE2EEnvironment() {
  if (required("APP_ENVIRONMENT") !== "test") {
    throw new Error("Foundation E2E tests require APP_ENVIRONMENT=test.");
  }

  const projectId = required("SUPABASE_PROJECT_ID");
  const testProjectId = required("SUPABASE_TEST_PROJECT_ID");

  if (!PROJECT_ID_PATTERN.test(projectId) || projectId !== testProjectId) {
    throw new Error(
      "SUPABASE_PROJECT_ID must match the explicitly designated SUPABASE_TEST_PROJECT_ID.",
    );
  }

  for (const protectedVariable of [
    "SUPABASE_DEV_PROJECT_ID",
    "SUPABASE_PRODUCTION_PROJECT_ID",
  ]) {
    if (process.env[protectedVariable]?.trim() === testProjectId) {
      throw new Error(
        `The E2E TEST project must differ from ${protectedVariable}.`,
      );
    }
  }

  const supabaseUrl = new URL(required("NEXT_PUBLIC_SUPABASE_URL"));

  if (
    supabaseUrl.origin !== `https://${testProjectId}.supabase.co` ||
    supabaseUrl.pathname !== "/" ||
    supabaseUrl.search ||
    supabaseUrl.hash ||
    supabaseUrl.username ||
    supabaseUrl.password
  ) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL must be the exact Cloud TEST project origin.",
    );
  }

  if (required("E2E_TARGET_CONFIRMATION") !== TEST_CONFIRMATION) {
    throw new Error("E2E_TARGET_CONFIRMATION does not authorize this target.");
  }

  const baseUrl = new URL(
    process.env.E2E_BASE_URL?.trim() || required("APP_URL"),
  );
  const permitsHttp = ["127.0.0.1", "localhost"].includes(baseUrl.hostname);

  if (
    (baseUrl.protocol !== "https:" && !permitsHttp) ||
    !["http:", "https:"].includes(baseUrl.protocol) ||
    baseUrl.pathname !== "/" ||
    baseUrl.search ||
    baseUrl.hash ||
    baseUrl.username ||
    baseUrl.password
  ) {
    throw new Error(
      "E2E_BASE_URL/APP_URL must be a root HTTPS origin (HTTP is local-only).",
    );
  }

  if (
    !process.env.E2E_BASE_URL &&
    baseUrl.origin !== "http://127.0.0.1:3000"
  ) {
    throw new Error(
      "APP_URL must be http://127.0.0.1:3000 when Playwright starts Next.js locally.",
    );
  }

  const runId = required("E2E_RUN_ID").toLowerCase();

  if (!/^[a-z0-9]{4,12}$/.test(runId)) {
    throw new Error("E2E_RUN_ID must be 4-12 lowercase letters or numbers.");
  }

  const organizationAId = requiredUuid("E2E_ORG_A_ID");
  const organizationBId = requiredUuid("E2E_ORG_B_ID");

  if (organizationAId === organizationBId) {
    throw new Error("The E2E organizations must be distinct tenants.");
  }

  return {
    runId,
    organizationAId,
    organizationAName: required("E2E_ORG_A_NAME"),
    organizationBId,
    organizationBName: required("E2E_ORG_B_NAME"),
    branchA1Id: requiredUuid("E2E_BRANCH_A1_ID"),
    branchA1Name: required("E2E_BRANCH_A1_NAME"),
    branchA2Id: requiredUuid("E2E_BRANCH_A2_ID"),
    branchA2Name: required("E2E_BRANCH_A2_NAME"),
    branchB1Id: requiredUuid("E2E_BRANCH_B1_ID"),
    owner: {
      email: required("E2E_OWNER_EMAIL"),
      password: required("E2E_OWNER_PASSWORD"),
      totpSecret: required("E2E_OWNER_TOTP_SECRET"),
    },
    // Dedicated to session-boundaries.spec.ts's mid-session suspension-then-
    // mutation test. Organization-wide ADMIN (holds branch.manage, same as
    // OWNER), MFA-enrolled. Suspending this identity mid-test must never
    // suspend the shared `owner` fixture every other spec file signs in as.
    adminUser: {
      email: required("E2E_ADMIN_EMAIL"),
      password: required("E2E_ADMIN_PASSWORD"),
      totpSecret: required("E2E_ADMIN_TOTP_SECRET"),
    },
    branchUser: {
      email: required("E2E_BRANCH_USER_EMAIL"),
      password: required("E2E_BRANCH_USER_PASSWORD"),
    },
    suspendedUser: {
      email: required("E2E_SUSPENDED_EMAIL"),
      password: required("E2E_SUSPENDED_PASSWORD"),
    },
  } as const;
}
