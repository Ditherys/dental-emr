// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { loadPublicSite } = vi.hoisted(() => ({ loadPublicSite: vi.fn() }));

vi.mock("@/lib/site/public-resolver", () => ({ loadPublicSite }));

import type { PublicSite } from "@/lib/site/types";

import PrivacyPage from "./page";

const site: PublicSite = {
  organizationName: "SmileLab Demo Dental",
  address: "100 Example Avenue, Synthetic City, Demo Province",
  heroHeading: null,
  heroSubtext: null,
  aboutText: null,
  contactPhone: null,
  contactEmail: null,
  addressOverride: null,
  operatingHours: {},
  privacyNotice: "We collect only the information needed to run the clinic website and never sell your data.",
  messengerLink: "https://m.me/exampleclinic",
  bookingLink: null,
  socialLinks: {},
  providers: [],
  procedures: [],
};

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("public privacy route", () => {
  it("renders the clinic privacy notice from the resolved public site", async () => {
    loadPublicSite.mockResolvedValueOnce(site);

    const element = await PrivacyPage();
    render(element);

    expect(screen.getByRole("heading", { name: "Privacy notice" })).toBeInTheDocument();
    expect(screen.getByText(/We collect only the information needed/i)).toBeInTheDocument();
    expect(screen.getByText("SmileLab Demo Dental")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Message us on Messenger" })).toHaveAttribute("href", "https://m.me/exampleclinic");
  });

  it("renders an empty-state message when no privacy notice is published", async () => {
    loadPublicSite.mockResolvedValueOnce(null);

    const element = await PrivacyPage();
    render(element);

    expect(screen.getByRole("heading", { name: "Privacy notice" })).toBeInTheDocument();
    expect(screen.getByText("No privacy notice has been published yet.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Message us on Messenger" })).not.toBeInTheDocument();
  });
});