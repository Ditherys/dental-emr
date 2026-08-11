import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "@/types/database.generated";
import { getSupabaseConfig } from "@/lib/supabase/config";

export function createClient() {
  const { url, publishableKey } = getSupabaseConfig();

  return createBrowserClient<Database>(url, publishableKey);
}
