import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { getSupabaseServerConfig } from "@/lib/supabase/server-config";

// The generated database types predate the Phase 3 provider/procedure tables,
// so the service-role client is created without the Database generic here and
// every row is validated with Zod. This read mirrors the reference data
// get_public_site exposes but adds the three fields the anonymous booking
// boundary needs and cannot derive from get_public_site: the procedure code,
// the provider id, and the instant vs request-only booking mode. It touches
// only website-visible reference tables, never patient, clinical, workforce,
// or audit data.
const optionsProcedureRowSchema = z
  .object({
    code: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    online_booking_enabled: z.boolean(),
    booking_mode: z.enum(["REQUIRES_REVIEW", "REQUEST_ONLY"]),
  })
  .strict();

const optionsProviderRowSchema = z
  .object({
    id: z.guid(),
    first_name: z.string(),
    middle_name: z.string().nullable(),
    last_name: z.string(),
    suffix: z.string().nullable(),
  })
  .strict();

const optionsBranchRowSchema = z.object({ id: z.guid() }).strict();

export type BookingProcedureOption = {
  code: string;
  name: string;
  description: string | null;
  isInstant: boolean;
};

export type BookingProviderOption = {
  providerId: string;
  displayName: string;
};

export type BookingOptions = {
  procedures: BookingProcedureOption[];
  providers: BookingProviderOption[];
};

function providerDisplayName(provider: z.infer<typeof optionsProviderRowSchema>) {
  return [provider.first_name, provider.middle_name, provider.last_name, provider.suffix]
    .filter((value): value is string => Boolean(value))
    .join(" ");
}

export async function loadBookingOptions(orgSlug: string): Promise<BookingOptions | null> {
  try {
    const { url, secretKey } = getSupabaseServerConfig();
    const admin = createSupabaseClient(url, secretKey, {
      auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
    });

    const organization = await admin
      .from("organizations")
      .select("id")
      .eq("status", "active")
      .eq("slug", orgSlug)
      .maybeSingle();

    if (organization.error || organization.data == null) return null;

    const organizationId = organization.data.id;

    const branch = await admin
      .from("branches")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("status", "active")
      .eq("website_visible", true)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(1)
      .maybeSingle();

    const branchRow = optionsBranchRowSchema.safeParse(branch.data);
    if (branch.error || !branchRow.success) {
      return { procedures: [], providers: [] };
    }

    const [procedureResult, providerResult, assignmentResult] = await Promise.all([
      admin
        .from("procedures")
        .select("code,name,description,online_booking_enabled,booking_mode")
        .eq("organization_id", organizationId)
        .eq("status", "active")
        .eq("website_visible", true)
        .order("name", { ascending: true })
        .order("id", { ascending: true })
        .limit(100),
      admin
        .from("providers")
        .select("id,first_name,middle_name,last_name,suffix")
        .eq("organization_id", organizationId)
        .eq("status", "active")
        .order("last_name", { ascending: true })
        .order("first_name", { ascending: true })
        .order("id", { ascending: true })
        .limit(100),
      admin
        .from("provider_branches")
        .select("provider_id")
        .eq("organization_id", organizationId)
        .eq("branch_id", branchRow.data.id)
        .eq("is_active", true)
        .limit(200),
    ]);

    if (procedureResult.error || providerResult.error || assignmentResult.error) {
      return { procedures: [], providers: [] };
    }

    const procedures = z
      .array(optionsProcedureRowSchema)
      .parse(procedureResult.data)
      .map((row) => ({
        code: row.code,
        name: row.name,
        description: row.description,
        isInstant: row.online_booking_enabled && row.booking_mode !== "REQUEST_ONLY",
      }));

    const assignedProviderIds = new Set(
      (assignmentResult.data ?? [])
        .map((row) => (row as { provider_id?: string }).provider_id)
        .filter((value): value is string => Boolean(value)),
    );

    const providers = z
      .array(optionsProviderRowSchema)
      .parse(providerResult.data)
      .filter((row) => assignedProviderIds.has(row.id))
      .map((row) => ({ providerId: row.id, displayName: providerDisplayName(row) }));

    return { procedures, providers };
  } catch {
    return null;
  }
}