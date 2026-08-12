import "server-only";

import { z } from "zod";

import { validateEnvironmentSeparation } from "@/lib/environment/environment-separation";

const serverConfigSchema = z.object({
  APP_ENVIRONMENT: z.enum(["development", "test", "production"]),
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  SUPABASE_PROJECT_ID: z.string().min(1),
  SUPABASE_SECRET_KEY: z.string().min(1),
  APP_URL: z.url(),
});

export function getSupabaseServerConfig() {
  const result = serverConfigSchema.safeParse({
    APP_ENVIRONMENT: process.env.APP_ENVIRONMENT,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_PROJECT_ID: process.env.SUPABASE_PROJECT_ID,
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
    APP_URL: process.env.APP_URL,
  });

  if (!result.success) {
    const missingNames = result.error.issues
      .map((issue) => issue.path[0])
      .filter((name): name is string => typeof name === "string")
      .join(", ");

    throw new Error(
      `Missing or invalid required server environment variable(s): ${missingNames}.`,
    );
  }

  const environmentConfig = validateEnvironmentSeparation(process.env);

  return {
    url: environmentConfig.supabaseUrl,
    secretKey: result.data.SUPABASE_SECRET_KEY,
    appOrigin: new URL(result.data.APP_URL).origin,
  };
}
