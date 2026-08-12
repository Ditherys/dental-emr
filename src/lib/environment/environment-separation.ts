export const APP_ENVIRONMENTS = [
  "development",
  "test",
  "production",
] as const;

export type AppEnvironment = (typeof APP_ENVIRONMENTS)[number];

type EnvironmentSource = Readonly<
  Record<string, string | undefined>
>;

export type EnvironmentSeparationConfig = Readonly<{
  appEnvironment: AppEnvironment;
  supabaseProjectId: string;
  supabaseUrl: string;
}>;

function requireEnvironmentValue(
  environment: EnvironmentSource,
  name: string,
) {
  const value = environment[name]?.trim();

  if (!value) {
    throw new Error(
      `${name} is required to verify deployment environment separation.`,
    );
  }

  return value;
}

function parseAppEnvironment(value: string): AppEnvironment {
  if (APP_ENVIRONMENTS.includes(value as AppEnvironment)) {
    return value as AppEnvironment;
  }

  throw new Error(
    "APP_ENVIRONMENT must be development, test, or production.",
  );
}

function expectedAppEnvironmentForVercelTarget(target: string) {
  if (target === "production") {
    return "production" as const;
  }

  if (target === "development") {
    return "development" as const;
  }

  return "test" as const;
}

function getExpectedVercelAppEnvironment(
  environment: EnvironmentSource,
) {
  const vercelEnvironment = environment.VERCEL_ENV?.trim();
  const vercelTargetEnvironment = environment.VERCEL_TARGET_ENV?.trim();

  if (
    environment.VERCEL === "1" &&
    !vercelEnvironment &&
    !vercelTargetEnvironment
  ) {
    throw new Error(
      "Vercel system environment variables must expose VERCEL_ENV or VERCEL_TARGET_ENV.",
    );
  }

  const expectedFromEnvironment = vercelEnvironment
    ? expectedAppEnvironmentForVercelTarget(vercelEnvironment)
    : undefined;
  const expectedFromTarget = vercelTargetEnvironment
    ? expectedAppEnvironmentForVercelTarget(vercelTargetEnvironment)
    : undefined;

  if (
    expectedFromEnvironment &&
    expectedFromTarget &&
    expectedFromEnvironment !== expectedFromTarget
  ) {
    throw new Error(
      "VERCEL_ENV and VERCEL_TARGET_ENV resolve to conflicting application environments.",
    );
  }

  return expectedFromTarget ?? expectedFromEnvironment;
}

function validateSupabaseCloudProject(
  rawUrl: string,
  supabaseProjectId: string,
) {
  if (!/^[a-z0-9]+$/.test(supabaseProjectId)) {
    throw new Error(
      "SUPABASE_PROJECT_ID must be the lowercase alphanumeric Supabase project reference.",
    );
  }

  let url: URL;

  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL must be a valid Supabase Cloud project URL.",
    );
  }

  const expectedOrigin = `https://${supabaseProjectId}.supabase.co`;

  if (
    url.origin !== expectedOrigin ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL must exactly match the HTTPS Supabase Cloud origin identified by SUPABASE_PROJECT_ID.",
    );
  }

  return expectedOrigin;
}

export function validateEnvironmentSeparation(
  environment: EnvironmentSource,
): EnvironmentSeparationConfig {
  const appEnvironment = parseAppEnvironment(
    requireEnvironmentValue(environment, "APP_ENVIRONMENT"),
  );
  const supabaseProjectId = requireEnvironmentValue(
    environment,
    "SUPABASE_PROJECT_ID",
  );
  const supabaseUrl = validateSupabaseCloudProject(
    requireEnvironmentValue(environment, "NEXT_PUBLIC_SUPABASE_URL"),
    supabaseProjectId,
  );
  const expectedVercelAppEnvironment =
    getExpectedVercelAppEnvironment(environment);

  if (
    expectedVercelAppEnvironment &&
    appEnvironment !== expectedVercelAppEnvironment
  ) {
    throw new Error(
      `APP_ENVIRONMENT=${appEnvironment} is not allowed for this Vercel deployment target; expected ${expectedVercelAppEnvironment}.`,
    );
  }

  if (
    appEnvironment === "production" &&
    expectedVercelAppEnvironment !== "production"
  ) {
    throw new Error(
      "Production Supabase configuration is allowed only in a verified Vercel production deployment.",
    );
  }

  return Object.freeze({
    appEnvironment,
    supabaseProjectId,
    supabaseUrl,
  });
}
