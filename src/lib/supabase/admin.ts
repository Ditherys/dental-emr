import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { getSupabaseServerConfig } from "@/lib/supabase/server-config";
import type { Database } from "@/types/database.generated";

export function createAdminClient() {
  const { url, secretKey } = getSupabaseServerConfig();

  return createSupabaseClient<Database>(url, secretKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}
