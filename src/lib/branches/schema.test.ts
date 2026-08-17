import { describe, expect, it } from "vitest";

import {
  branchFormSchema,
  branchSlugFromName,
  branchUpdateFormSchema,
} from "./schema";

describe("branchFormSchema", () => {
  it("normalizes branch identifiers and keeps website visibility explicit", () => {
    const result = branchFormSchema.parse({
      name: "  Demo Third  ",
      code: "a3",
      slug: "demo-third",
      phone: "",
      email: "",
      addressLine1: " 300 Synthetic Avenue ",
      addressLine2: "",
      city: "Quezon City",
      province: "Metro Manila",
      postalCode: "1100",
      timezone: "Asia/Manila",
      websiteVisible: false,
    });

    expect(result).toMatchObject({
      name: "Demo Third",
      code: "A3",
      addressLine1: "300 Synthetic Avenue",
      websiteVisible: false,
    });
  });

  it("rejects unsupported identifier and timezone formats", () => {
    const result = branchFormSchema.safeParse({
      name: "Demo Third",
      code: "A 3",
      slug: "Demo Third",
      phone: "",
      email: "not-an-email",
      addressLine1: "300 Synthetic Avenue",
      addressLine2: "",
      city: "Quezon City",
      province: "Metro Manila",
      postalCode: "",
      timezone: "UTC",
      websiteVisible: false,
    });

    expect(result.success).toBe(false);
  });
});

describe("branchUpdateFormSchema", () => {
  it("accepts a full valid payload without code or slug", () => {
    const result = branchUpdateFormSchema.parse({
      name: "Demo Third",
      phone: "",
      email: "",
      addressLine1: "300 Synthetic Avenue",
      addressLine2: "",
      city: "Quezon City",
      province: "Metro Manila",
      postalCode: "1100",
      timezone: "Asia/Manila",
      websiteVisible: false,
    });

    expect(result).toMatchObject({
      name: "Demo Third",
      addressLine1: "300 Synthetic Avenue",
      websiteVisible: false,
    });
    expect(result).not.toHaveProperty("code");
    expect(result).not.toHaveProperty("slug");
  });
});

describe("branchSlugFromName", () => {
  it("creates a database-compatible slug", () => {
    expect(branchSlugFromName("  Demo – Third Branch!  ")).toBe(
      "demo-third-branch",
    );
  });
});
