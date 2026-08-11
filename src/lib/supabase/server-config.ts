import "server-only";

import { z } from "zod";

const serverConfigSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  SUPABASE_SECRET_KEY: z.string().min(1),
  APP_URL: z.url(),
});

export function getSupabaseServerConfig() {
  const result = serverConfigSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
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

  return {
    url: result.data.NEXT_PUBLIC_SUPABASE_URL,
    secretKey: result.data.SUPABASE_SECRET_KEY,
    appOrigin: new URL(result.data.APP_URL).origin,
  };
}
