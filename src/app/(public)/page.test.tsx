// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { loadPublicSite } = vi.hoisted(() => ({ loadPublicSite: vi.fn() }));

vi.mock("@/lib/site/public-resolver", () => ({ loadPublicSite }));

import type { PublicSite } from "@/lib/site/types";

import PublicHomePage, { generateMetadata } from "./page";

const site: PublicSite = {
  organizationName: "SmileLab Demo Dental",
  address: "100 Example Avenue, Synthetic City, Demo Province",
  heroHeading: "Smiles for the whole family",
  heroSubtext: "Gentle, honest dental care in one place.",
  aboutText: null,
  contactPhone: null,
  contactEmail: null,
  addressOverride: null,
  operatingHours: {},
  privacyNotice: null,
  messengerLink: null,
  bookingLink: null,
  socialLinks: {},
  providers: [],
  procedures: [],
};

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("public home route", () => {
  it("renders the clinic website from the resolved public site", async () => {
    loadPublicSite.mockResolvedValueOnce(site);

    const element = await PublicHomePage();
    render(element);

    expect(screen.getByText("SmileLab Demo Dental")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Smiles for the whole family" })).toBeInTheDocument();
  });

  it("renders the placeholder when no public org resolves", async () => {
    loadPublicSite.mockResolvedValueOnce(null);

    const element = await PublicHomePage();
    render(element);

    expect(screen.getByText(/website is being set up/i)).toBeInTheDocument();
    expect(screen.queryByText("SmileLab Demo Dental")).not.toBeInTheDocument();
  });

  it("builds SEO metadata from the resolved public site", async () => {
    loadPublicSite.mockResolvedValueOnce(site);

    await expect(generateMetadata()).resolves.toEqual({
      title: { absolute: "SmileLab Demo Dental" },
      description: "Gentle, honest dental care in one place.",
    });
  });

  it("falls back to generic metadata when no public org resolves", async () => {
    loadPublicSite.mockResolvedValueOnce(null);

    await expect(generateMetadata()).resolves.toEqual({
      title: { absolute: "Dental Clinic" },
      description: undefined,
    });
  });
});