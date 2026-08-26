import "server-only";

import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

import { mapSiteRpcError, SiteServiceError } from "./errors";
import {
  getPublicSiteInputSchema,
  getPublicSiteSettingsInputSchema,
  publicSiteSchema,
  publicSiteSettingsSchema,
  updatePublicSiteSettingsInputSchema,
  updatePublicSiteSettingsRowSchema,
} from "./schema";
import type {
  PublicSite,
  PublicSiteSettings,
  UpdatePublicSiteSettingsResult,
} from "./types";

type Rpc = (name: string, args: Record<string, unknown>) => Promise<unknown>;
const rpcResponseSchema = z.object({ data: z.unknown(), error: z.unknown().nullable() });

async function callRpc(name: string, args: Record<string, unknown>) {
  const supabase = await createClient();
  const response = rpcResponseSchema.parse(await (supabase.rpc as unknown as Rpc)(name, args));
  if (response.error) throw mapSiteRpcError(response.error);
  return response.data;
}

function firstRow(data: unknown) {
  return Array.isArray(data) ? data[0] : undefined;
}

function normalizeRecord(value: Record<string, string> | null) {
  return value ?? {};
}

export async function getPublicSite(orgSlug: string): Promise<PublicSite | null> {
  const value = getPublicSiteInputSchema.parse({ orgSlug });
  const data = await callRpc("get_public_site", { p_org_slug: value.orgSlug });
  if (data == null) return null;
  const parsed = publicSiteSchema.parse(data);
  return {
    ...parsed,
    operatingHours: normalizeRecord(parsed.operatingHours),
    socialLinks: normalizeRecord(parsed.socialLinks),
  };
}

export async function getPublicSiteSettings(actingBranchId: string): Promise<PublicSiteSettings> {
  const value = getPublicSiteSettingsInputSchema.parse({ actingBranchId });
  const data = await callRpc("get_public_site_settings", { p_acting_branch_id: value.actingBranchId });
  if (data == null) {
    return {
      heroHeading: null,
      heroSubtext: null,
      aboutText: null,
      contactPhone: null,
      contactEmail: null,
      addressOverride: null,
      operatingHours: {},
      privacyNotice: null,
      messengerLink: null,
      bookingLink: null,
      socialLinks: {},
      version: 1,
    };
  }
  const parsed = publicSiteSettingsSchema.parse(data);
  return {
    ...parsed,
    operatingHours: normalizeRecord(parsed.operatingHours),
    socialLinks: normalizeRecord(parsed.socialLinks),
  };
}

export async function updatePublicSiteSettings(input: unknown): Promise<UpdatePublicSiteSettingsResult> {
  const value = updatePublicSiteSettingsInputSchema.parse(input);
  const row = updatePublicSiteSettingsRowSchema.parse(firstRow(await callRpc("update_public_site_settings", {
    p_acting_branch_id: value.actingBranchId,
    p_expected_version: value.expectedVersion,
    p_settings: value.settings,
  })));
  return { organizationId: row.organization_id, version: row.version };
}

export { SiteServiceError };