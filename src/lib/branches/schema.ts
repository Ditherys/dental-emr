import { z } from "zod";

const requiredText = (label: string, maximum: number) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required.`)
    .max(maximum, `${label} must be ${maximum} characters or fewer.`);

const optionalText = (label: string, maximum: number) =>
  z
    .string()
    .trim()
    .max(maximum, `${label} must be ${maximum} characters or fewer.`);

export const branchFormSchema = z.object({
  name: requiredText("Branch name", 120),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .min(1, "Branch code is required.")
    .max(24, "Branch code must be 24 characters or fewer.")
    .regex(
      /^[A-Z0-9][A-Z0-9_-]*$/,
      "Use uppercase letters, numbers, underscores, or hyphens.",
    ),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, "Branch slug is required.")
    .max(80, "Branch slug must be 80 characters or fewer.")
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "Use lowercase letters, numbers, and single hyphens.",
    ),
  phone: optionalText("Phone", 50),
  email: z
    .string()
    .trim()
    .max(320, "Email must be 320 characters or fewer.")
    .refine(
      (value) => value === "" || z.email().safeParse(value).success,
      "Enter a valid email address.",
    ),
  addressLine1: requiredText("Address line 1", 160),
  addressLine2: optionalText("Address line 2", 160),
  city: requiredText("City or municipality", 100),
  province: requiredText("Province", 100),
  postalCode: optionalText("Postal code", 20),
  timezone: z.literal("Asia/Manila", {
    error: "Choose a supported timezone.",
  }),
  websiteVisible: z.boolean(),
});

export type BranchFormValues = z.infer<typeof branchFormSchema>;

export function branchSlugFromName(name: string) {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}
