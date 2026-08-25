export function validateBootstrapTarget({ appEnvironment, projectId, url }) {
  let parsedSupabaseUrl;

  try {
    parsedSupabaseUrl = new URL(url);
  } catch {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL must be a valid absolute URL.");
  }

  if (projectId === "local") {
    if (appEnvironment !== "development") {
      throw new Error("local Supabase is allowed only for development.");
    }

    const expectedOrigin = "http://127.0.0.1:54321";

    if (
      parsedSupabaseUrl.origin !== expectedOrigin ||
      parsedSupabaseUrl.username ||
      parsedSupabaseUrl.password ||
      parsedSupabaseUrl.pathname !== "/" ||
      parsedSupabaseUrl.search ||
      parsedSupabaseUrl.hash
    ) {
      throw new Error(
        "First-owner bootstrap refused: NEXT_PUBLIC_SUPABASE_URL must exactly match the local Supabase API origin.",
      );
    }

    return expectedOrigin;
  }

  const expectedSupabaseOrigin = `https://${projectId}.supabase.co`;

  if (
    parsedSupabaseUrl.origin !== expectedSupabaseOrigin ||
    parsedSupabaseUrl.username ||
    parsedSupabaseUrl.password ||
    parsedSupabaseUrl.pathname !== "/" ||
    parsedSupabaseUrl.search ||
    parsedSupabaseUrl.hash
  ) {
    throw new Error(
      "First-owner bootstrap refused: NEXT_PUBLIC_SUPABASE_URL does not match SUPABASE_PROJECT_ID.",
    );
  }

  return expectedSupabaseOrigin;
}
