import "server-only";

import { z } from "zod";

import { databaseUuid } from "@/lib/validation/database-uuid";

import type { BranchFormValues } from "./schema";
import { createClient } from "@/lib/supabase/server";

const branchSummarySchema = z.object({
  id: databaseUuid,
  name: z.string(),
  code: z.string(),
  slug: z.string(),
  status: z.enum(["active", "inactive", "archived"]),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  address_line1: z.string(),
  address_line2: z.string().nullable(),
  city: z.string(),
  province: z.string(),
  postal_code: z.string().nullable(),
  timezone: z.string(),
  website_visible: z.boolean(),
});

export type BranchSummary = z.infer<typeof branchSummarySchema>;

export class BranchManagementError extends Error {
  constructor(
    public readonly code: "DUPLICATE" | "NOT_AUTHORIZED" | "FAILED",
  ) {
    super(code);
    this.name = "BranchManagementError";
  }
}

export async function listManagedBranches(organizationId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("branches")
    .select(
      "id, name, code, slug, status, phone, email, address_line1, address_line2, city, province, postal_code, timezone, website_visible",
    )
    .eq("organization_id", organizationId)
    .order("name");

  if (error) {
    throw new BranchManagementError("FAILED");
  }

  return z.array(branchSummarySchema).parse(data);
}

type CreateBranchInput = BranchFormValues & {
  organizationId: string;
};

export async function createBranch({
  organizationId,
  name,
  code,
  slug,
  phone,
  email,
  addressLine1,
  addressLine2,
  city,
  province,
  postalCode,
  timezone,
  websiteVisible,
}: CreateBranchInput) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_branch", {
    target_organization_id: organizationId,
    branch_name: name,
    branch_code: code,
    branch_slug: slug,
    branch_address_line1: addressLine1,
    branch_city: city,
    branch_province: province,
    branch_country_code: "PH",
    branch_timezone: timezone,
    branch_website_visible: websiteVisible,
    ...(phone ? { branch_phone: phone } : {}),
    ...(email ? { branch_email: email } : {}),
    ...(addressLine2 ? { branch_address_line2: addressLine2 } : {}),
    ...(postalCode ? { branch_postal_code: postalCode } : {}),
  });

  if (error) {
    if (error.code === "23505") {
      throw new BranchManagementError("DUPLICATE");
    }

    if (error.code === "42501") {
      throw new BranchManagementError("NOT_AUTHORIZED");
    }

    throw new BranchManagementError("FAILED");
  }

  return databaseUuid.parse(data);
}
