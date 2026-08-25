import { describe, expect, it } from "vitest";

import { validateEnvironmentSeparation } from "./environment-separation";

const developmentEnvironment = {
  APP_ENVIRONMENT: "development",
  NEXT_PUBLIC_SUPABASE_URL: "https://devproject123.supabase.co",
  SUPABASE_PROJECT_ID: "devproject123",
};

describe("environment separation", () => {
  it("accepts a local Supabase runtime only for a developer workstation", () => {
    expect(
      validateEnvironmentSeparation({
        APP_ENVIRONMENT: "development",
        NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
        SUPABASE_PROJECT_ID: "local",
      }),
    ).toEqual({
      appEnvironment: "development",
      supabaseProjectId: "local",
      supabaseUrl: "http://127.0.0.1:54321",
    });
  });

  it("rejects a local Supabase runtime outside a developer workstation", () => {
    expect(() =>
      validateEnvironmentSeparation({
        APP_ENVIRONMENT: "test",
        NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
        SUPABASE_PROJECT_ID: "local",
      }),
    ).toThrow("local Supabase is allowed only for a non-Vercel development workstation");
  });

  it("rejects a local Supabase runtime in Vercel", () => {
    expect(() =>
      validateEnvironmentSeparation({
        APP_ENVIRONMENT: "development",
        NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
        SUPABASE_PROJECT_ID: "local",
        VERCEL: "1",
        VERCEL_ENV: "development",
      }),
    ).toThrow("local Supabase is allowed only for a non-Vercel development workstation");
  });

  it("accepts a developer workstation connected to its Cloud DEV project", () => {
    expect(validateEnvironmentSeparation(developmentEnvironment)).toEqual({
      appEnvironment: "development",
      supabaseProjectId: "devproject123",
      supabaseUrl: "https://devproject123.supabase.co",
    });
  });

  it("accepts a Vercel preview connected to Cloud TEST", () => {
    expect(
      validateEnvironmentSeparation({
        APP_ENVIRONMENT: "test",
        NEXT_PUBLIC_SUPABASE_URL: "https://testproject456.supabase.co",
        SUPABASE_PROJECT_ID: "testproject456",
        VERCEL: "1",
        VERCEL_ENV: "preview",
        VERCEL_TARGET_ENV: "preview",
      }),
    ).toMatchObject({ appEnvironment: "test" });
  });

  it("accepts production configuration only in Vercel production", () => {
    expect(
      validateEnvironmentSeparation({
        APP_ENVIRONMENT: "production",
        NEXT_PUBLIC_SUPABASE_URL: "https://prodproject789.supabase.co",
        SUPABASE_PROJECT_ID: "prodproject789",
        VERCEL: "1",
        VERCEL_ENV: "production",
        VERCEL_TARGET_ENV: "production",
      }),
    ).toMatchObject({ appEnvironment: "production" });
  });

  it("rejects production configuration in a preview deployment", () => {
    expect(() =>
      validateEnvironmentSeparation({
        APP_ENVIRONMENT: "production",
        NEXT_PUBLIC_SUPABASE_URL: "https://prodproject789.supabase.co",
        SUPABASE_PROJECT_ID: "prodproject789",
        VERCEL: "1",
        VERCEL_ENV: "preview",
        VERCEL_TARGET_ENV: "preview",
      }),
    ).toThrow("expected test");
  });

  it("rejects non-production configuration in a production deployment", () => {
    expect(() =>
      validateEnvironmentSeparation({
        APP_ENVIRONMENT: "test",
        NEXT_PUBLIC_SUPABASE_URL: "https://testproject456.supabase.co",
        SUPABASE_PROJECT_ID: "testproject456",
        VERCEL: "1",
        VERCEL_ENV: "production",
        VERCEL_TARGET_ENV: "production",
      }),
    ).toThrow("expected production");
  });

  it("treats custom Vercel targets as non-production test environments", () => {
    expect(
      validateEnvironmentSeparation({
        APP_ENVIRONMENT: "test",
        NEXT_PUBLIC_SUPABASE_URL: "https://testproject456.supabase.co",
        SUPABASE_PROJECT_ID: "testproject456",
        VERCEL: "1",
        VERCEL_ENV: "preview",
        VERCEL_TARGET_ENV: "staging",
      }),
    ).toMatchObject({ appEnvironment: "test" });
  });

  it("rejects a Supabase URL that does not match its explicit project reference", () => {
    expect(() =>
      validateEnvironmentSeparation({
        ...developmentEnvironment,
        NEXT_PUBLIC_SUPABASE_URL: "https://anotherproject.supabase.co",
      }),
    ).toThrow("must exactly match");
  });

  it("rejects production configuration outside verified Vercel production", () => {
    expect(() =>
      validateEnvironmentSeparation({
        APP_ENVIRONMENT: "production",
        NEXT_PUBLIC_SUPABASE_URL: "https://prodproject789.supabase.co",
        SUPABASE_PROJECT_ID: "prodproject789",
      }),
    ).toThrow("only in a verified Vercel production deployment");
  });

  it("fails closed when a Vercel deployment omits its target variables", () => {
    expect(() =>
      validateEnvironmentSeparation({
        ...developmentEnvironment,
        VERCEL: "1",
      }),
    ).toThrow("must expose VERCEL_ENV or VERCEL_TARGET_ENV");
  });
});
