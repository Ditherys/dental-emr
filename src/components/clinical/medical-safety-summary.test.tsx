// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { MedicalRecord } from "@/lib/clinical/types";

import { MedicalSafetySummary } from "./medical-safety-summary";

const condition: MedicalRecord = { recordType: "CONDITION", recordId: "c5000000-0000-0000-0000-000000000001", conditionName: "Hypertension", status: "active", onsetDate: "2024-01-01", resolvedDate: null, notes: null, recordedAt: "2026-08-27T08:00:00+00:00", voidedAt: null, version: 1 };
const allergy: MedicalRecord = { recordType: "ALLERGY", recordId: "c5000000-0000-0000-0000-000000000002", allergen: "Penicillin", reaction: null, severity: "SEVERE", status: "active", recordedAt: "2026-08-27T08:00:00+00:00", voidedAt: null, version: 1 };
const medication: MedicalRecord = { recordType: "MEDICATION", recordId: "c5000000-0000-0000-0000-000000000003", medicationName: "Amlodipine", dose: "5mg", frequency: "daily", status: "active", startDate: null, endDate: null, notes: null, recordedAt: "2026-08-27T08:00:00+00:00", voidedAt: null, version: 1 };
const voidedCondition: MedicalRecord = { ...condition, recordId: "c5000000-0000-0000-0000-000000000004", conditionName: "Withdrawn entry", status: "voided", voidedAt: "2026-08-28T08:00:00+00:00" };

function group(label: string) {
  return within(screen.getByRole("region", { name: "Medical safety summary" })).getByTestId(`medical-safety-${label}`);
}

afterEach(cleanup);

describe("MedicalSafetySummary", () => {
  it("summarises conditions, allergies, and medications in one safety strip", () => {
    render(<MedicalSafetySummary records={[condition, allergy, medication]} />);

    expect(screen.getByRole("region", { name: "Medical safety summary" })).toBeVisible();
    expect(group("conditions")).toHaveTextContent("Hypertension");
    expect(group("allergies")).toHaveTextContent("Penicillin");
    expect(group("allergies")).toHaveTextContent("SEVERE");
    expect(group("medications")).toHaveTextContent("Amlodipine");
  });

  it("says None recorded for an empty medical group and excludes voided records", () => {
    render(<MedicalSafetySummary records={[voidedCondition]} />);

    expect(group("conditions")).toHaveTextContent("None recorded");
    expect(group("allergies")).toHaveTextContent("None recorded");
    expect(group("medications")).toHaveTextContent("None recorded");
    expect(screen.queryByText(/Withdrawn entry/)).not.toBeInTheDocument();
  });

  it("wraps long clinical values instead of truncating them", () => {
    const longAllergen = "Amoxicillin-clavulanate and every related beta-lactam antibiotic recorded during the 2026 intake review";
    render(<MedicalSafetySummary records={[{ ...allergy, allergen: longAllergen }]} />);

    const value = within(group("allergies")).getByText(new RegExp(longAllergen), { selector: "span" });
    expect(value.className).toContain("break-words");
    expect(value.className).not.toContain("truncate");
    expect(value.className).not.toContain("whitespace-nowrap");
  });
});

// Conservative safe-direction defaults pending clinical-owner confirmation:
// a stopped medication or a resolved condition must never read as current, and
// an allergy is never silently dropped.
describe("MedicalSafetySummary resolved records", () => {
  it("never presents a stopped medication as current", () => {
    render(<MedicalSafetySummary records={[{ ...medication, status: "resolved" }]} />);

    expect(group("medications")).toHaveTextContent("None recorded");
    expect(within(group("medications")).queryByText(/Amlodipine/)).not.toBeInTheDocument();
  });

  it("never presents a resolved condition as current", () => {
    render(<MedicalSafetySummary records={[{ ...condition, status: "resolved" }]} />);

    expect(group("conditions")).toHaveTextContent("None recorded");
    expect(within(group("conditions")).queryByText(/Hypertension/)).not.toBeInTheDocument();
  });

  it("keeps a resolved allergy visible, qualified, and de-emphasised", () => {
    render(<MedicalSafetySummary records={[{ ...allergy, status: "resolved" }]} />);

    const value = within(group("allergies")).getByText(/Penicillin/, { selector: "span" });
    expect(value).toHaveTextContent("resolved");
    expect(value.className).toContain("text-muted-foreground");
    expect(group("allergies")).not.toHaveTextContent("None recorded");
  });

  it("keeps an active allergy emphasised alongside a resolved one", () => {
    render(<MedicalSafetySummary records={[allergy, { ...allergy, recordId: "c5000000-0000-0000-0000-000000000009", allergen: "Latex", severity: null, status: "resolved" }]} />);

    const active = within(group("allergies")).getByText(/Penicillin/, { selector: "span" });
    const resolved = within(group("allergies")).getByText(/Latex/, { selector: "span" });
    expect(active).not.toHaveTextContent("resolved");
    expect(active.className).not.toContain("text-muted-foreground");
    expect(resolved.className).toContain("text-muted-foreground");
  });
});
