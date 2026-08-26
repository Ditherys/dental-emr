"use server";

import { revalidatePath } from "next/cache";

import { AuthorizationError, requirePermission } from "@/lib/authorization";
import { updatePublicSiteSettingsInputSchema } from "@/lib/site/schema";
import { SiteServiceError, updatePublicSiteSettings } from "@/lib/site/service";

const sitePath = "/settings/site";

export type SiteSettingsActionState = {
  ok?: boolean;
  message?: string;
  version?: number;
  fieldErrors?: Record<string, string[]>;
};

function text(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function trimmedText(formData: FormData, name: string) {
  return text(formData, name).trim();
}

function recordPairs(formData: FormData, prefix: string) {
  const result: Record<string, string> = {};
  let index = 0;
  while (true) {
    const key = trimmedText(formData, `${prefix}-key-${index}`);
    const value = trimmedText(formData, `${prefix}-value-${index}`);
    if (!key && !value) break;
    if (key) result[key] = value;
    index += 1;
  }
  return result;
}

function settingsFromForm(formData: FormData) {
  return {
    heroHeading: trimmedText(formData, "heroHeading"),
    heroSubtext: trimmedText(formData, "heroSubtext"),
    aboutText: trimmedText(formData, "aboutText"),
    contactPhone: trimmedText(formData, "contactPhone"),
    contactEmail: trimmedText(formData, "contactEmail"),
    addressOverride: trimmedText(formData, "addressOverride"),
    operatingHours: recordPairs(formData, "operatingHours"),
    privacyNotice: trimmedText(formData, "privacyNotice"),
    messengerLink: trimmedText(formData, "messengerLink"),
    bookingLink: trimmedText(formData, "bookingLink"),
    socialLinks: recordPairs(formData, "socialLinks"),
  };
}

export async function updatePublicSiteSettingsAction(_previous: SiteSettingsActionState, formData: FormData): Promise<SiteSettingsActionState> {
  const parsed = updatePublicSiteSettingsInputSchema.safeParse({
    actingBranchId: text(formData, "actingBranchId"),
    expectedVersion: Number(text(formData, "expectedVersion")),
    settings: settingsFromForm(formData),
  });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };

  try {
    await requirePermission({ permission: "site.manage", branchId: parsed.data.actingBranchId });
    const result = await updatePublicSiteSettings(parsed.data);
    revalidatePath(sitePath);
    return { ok: true, message: "Website settings saved.", version: result.version };
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return { ok: false, message: "Your current organization access does not allow this action." };
    }
    if (error instanceof SiteServiceError) {
      switch (error.code) {
        case "STALE_VERSION":
          return { ok: false, message: "These website settings changed elsewhere. Reload and try again." };
        case "NOT_AUTHORIZED":
          return { ok: false, message: "Your current organization access does not allow this action." };
        case "INVALID_INPUT":
          return { ok: false, message: "Some website settings could not be saved. Check the values and try again." };
        default:
          return { ok: false, message: "The website settings could not be saved. Try again." };
      }
    }
    return { ok: false, message: "The website settings could not be saved. Try again." };
  }
}