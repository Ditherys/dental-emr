// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { PublicSite } from "@/lib/site/types";

import { PublicHome } from "./public-home";

const site: PublicSite = {
  organizationName: "SmileLab Demo Dental",
  address: "100 Example Avenue, Synthetic City, Demo Province",
  heroHeading: "Smiles for the whole family",
  heroSubtext: "Gentle, honest dental care in one place.",
  aboutText: "A modern clinic with a friendly team and modern equipment.",
  contactPhone: "+63281234567",
  contactEmail: "hello@example.test",
  addressOverride: null,
  operatingHours: {
    Monday: "8:00 AM - 5:00 PM",
    Saturday: "9:00 AM - 12:00 PM",
  },
  privacyNotice: "We respect your privacy.",
  messengerLink: "https://m.me/exampleclinic",
  bookingLink: "https://booking.example.test",
  socialLinks: { facebook: "https://facebook.com/exampleclinic" },
  providers: [
    {
      displayName: "Dr. Juan Dela Cruz",
      bio: "General dentist focused on preventive care.",
      primarySpecialtyLabel: "General Dentistry",
    },
  ],
  procedures: [
    { name: "Teeth cleaning", description: "Professional cleaning to keep gums healthy." },
    { name: "Tooth filling", description: "Restoring teeth damaged by decay." },
  ],
};

const forbiddenTokens = [
  "patient",
  "diagnosis",
  "clinical",
  "medical",
  "billing",
  "insurance",
  "prescription",
  "chart",
  "PhilHealth",
];

afterEach(cleanup);

describe("public home page", () => {
  it("renders the hero, about, services, providers, contact, and footer sections", () => {
    render(<PublicHome site={site} />);

    expect(screen.getByText("SmileLab Demo Dental")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Smiles for the whole family" })).toBeInTheDocument();
    expect(screen.getByText("Gentle, honest dental care in one place.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "About us" })).toBeInTheDocument();
    expect(screen.getByText("A modern clinic with a friendly team and modern equipment.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Services" })).toBeInTheDocument();
    expect(screen.getByText("Teeth cleaning")).toBeInTheDocument();
    expect(screen.getByText("Professional cleaning to keep gums healthy.")).toBeInTheDocument();
    expect(screen.getByText("Tooth filling")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Our dentists" })).toBeInTheDocument();
    expect(screen.getByText("Dr. Juan Dela Cruz")).toBeInTheDocument();
    expect(screen.getByText("General Dentistry")).toBeInTheDocument();
    expect(screen.getByText("General dentist focused on preventive care.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Contact" })).toBeInTheDocument();
  });

  it("renders location, contact links, operating hours, and social links", () => {
    const { container } = render(<PublicHome site={site} />);

    expect(container.querySelector("address")?.textContent).toContain("100 Example Avenue");
    expect(screen.getByRole("link", { name: "+63281234567" })).toHaveAttribute("href", "tel:+63281234567");
    expect(screen.getByRole("link", { name: "hello@example.test" })).toHaveAttribute("href", "mailto:hello@example.test");
    expect(screen.getByText("Monday")).toBeInTheDocument();
    expect(screen.getByText("8:00 AM - 5:00 PM")).toBeInTheDocument();
    expect(screen.getByText("Saturday")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "facebook" })).toHaveAttribute("href", "https://facebook.com/exampleclinic");
    expect(screen.getByRole("link", { name: "Privacy notice" })).toHaveAttribute("href", "/privacy");
  });

  it("renders the Book Appointment and Messenger CTAs as safe external links", () => {
    render(<PublicHome site={site} />);

    const booking = screen.getByRole("link", { name: "Book an appointment" });
    expect(booking).toHaveAttribute("href", "https://booking.example.test");
    expect(booking).toHaveAttribute("target", "_blank");
    expect(booking).toHaveAttribute("rel", "noopener noreferrer");

    const messengerLinks = screen.getAllByRole("link", { name: "Message us on Messenger" });
    expect(messengerLinks.length).toBeGreaterThanOrEqual(2);
    for (const link of messengerLinks) {
      expect(link).toHaveAttribute("href", "https://m.me/exampleclinic");
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    }
  });

  it("renders semantic page structure for mobile composition", () => {
    const { container } = render(<PublicHome site={site} />);

    expect(container.querySelector("header")).toBeInTheDocument();
    expect(container.querySelector("main")).toBeInTheDocument();
    expect(container.querySelector("footer")).toBeInTheDocument();
    for (const heading of ["About us", "Services", "Our dentists", "Contact"]) {
      expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
    }
  });

  it("exposes no patient or clinical content in the rendered DOM", () => {
    const { container } = render(<PublicHome site={site} />);
    const text = container.textContent ?? "";

    for (const token of forbiddenTokens) {
      expect(text.toLowerCase()).not.toContain(token);
    }
  });

  it("renders a graceful placeholder when no public org resolves", () => {
    render(<PublicHome site={null} />);

    expect(screen.getByText("Welcome")).toBeInTheDocument();
    expect(screen.getByText(/website is being set up/i)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "About us" })).not.toBeInTheDocument();
    expect(screen.queryByText("SmileLab Demo Dental")).not.toBeInTheDocument();
  });

  it("omits empty sections and hidden CTAs when there is no content", () => {
    const sparse: PublicSite = {
      ...site,
      heroSubtext: null,
      aboutText: null,
      contactPhone: null,
      contactEmail: null,
      addressOverride: null,
      address: null,
      operatingHours: {},
      socialLinks: {},
      messengerLink: null,
      bookingLink: null,
      providers: [],
      procedures: [],
    };

    render(<PublicHome site={sparse} />);

    expect(screen.queryByRole("heading", { name: "About us" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Services" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Our dentists" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Contact" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Book an appointment" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Message us on Messenger" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Smiles for the whole family" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Privacy notice" })).toBeInTheDocument();
  });
});