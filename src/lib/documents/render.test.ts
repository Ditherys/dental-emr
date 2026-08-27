import { describe, expect, it } from "vitest";

import type { DocumentDataSnapshot } from "./types";
import { escapeHtml, renderDocumentHtml } from "./render";

const branchId = "c1000000-0000-0000-0000-000000000001";
const patientId = "c2000000-0000-0000-0000-000000000002";
const appointmentId = "c5000000-0000-0000-0000-000000000005";
const planId = "c4000000-0000-0000-0000-000000000004";

function demographics(overrides: Record<string, unknown> = {}) {
  return {
    patientId,
    patientNumber: "P-0001",
    firstName: "Juana",
    middleName: "Santos",
    lastName: "Dela Cruz",
    suffix: null,
    preferredName: null,
    birthDate: "1990-01-01",
    sexAtRegistration: "female",
    addressLine1: "123 Rizal St",
    addressLine2: null,
    city: "Manila",
    province: null,
    postalCode: "1000",
    status: "active",
    contacts: [{ contactType: "MOBILE", label: null, value: "+639181234567", isPrimary: true }],
    ...overrides,
  };
}

function snapshot(overrides: Partial<DocumentDataSnapshot> = {}): DocumentDataSnapshot {
  return {
    demographics: demographics(),
    ...overrides,
  };
}

describe("renderDocumentHtml", () => {
  it("brands the document with the org and branch names", () => {
    const html = renderDocumentHtml({
      documentType: "PATIENT_RECORD_SUMMARY",
      templateVersion: "v1",
      dataSnapshot: snapshot(),
      orgName: "SmileCare Dental Clinic",
      branchName: "Makati Branch",
    });

    expect(html).toContain("SmileCare Dental Clinic");
    expect(html).toContain("Makati Branch");
    expect(html).toContain("Patient Record Summary");
  });

  it("carries the A4 page and print CSS", () => {
    const html = renderDocumentHtml({
      documentType: "APPOINTMENT_SLIP",
      templateVersion: "v1",
      dataSnapshot: snapshot(),
      orgName: "SmileCare Dental Clinic",
      branchName: "Makati Branch",
    });

    expect(html).toContain("@page { size: A4; margin: 18mm; }");
    expect(html).toContain("@media print");
    expect(html).toContain('class="print-document"');
  });

  it("escapes all snapshot text so markup cannot inject HTML", () => {
    const html = renderDocumentHtml({
      documentType: "PATIENT_RECORD_SUMMARY",
      templateVersion: "v1",
      dataSnapshot: snapshot({
        demographics: demographics({
          firstName: "<script>alert(1)</script>",
          lastName: "&quot;Dela Cruz&quot;",
          city: "Manila & Co.",
        }),
      }),
      orgName: "SmileCare & Co.",
      branchName: "Makati <b>Branch</b>",
    });

    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("SmileCare &amp; Co.");
    expect(html).toContain("Makati &lt;b&gt;Branch&lt;/b&gt;");
    expect(html).toContain("&amp;quot;Dela Cruz&amp;quot;");
  });

  it("renders only the sections present in the snapshot and never clinical history", () => {
    const html = renderDocumentHtml({
      documentType: "PATIENT_RECORD_SUMMARY",
      templateVersion: "v1",
      dataSnapshot: snapshot({
        referrals: [
          {
            direction: "IN",
            status: "ACTIVE",
            requiredSpecialtyName: "Oral Surgery",
            externalPartyName: "Dr. Reyes",
            externalPartyOrganization: null,
            externalPartyContact: null,
            notes: "Requesting an extraction assessment.",
            createdAt: "2026-08-27T09:00:00+00:00",
          },
        ],
        appointments: [
          {
            appointmentId,
            branchId,
            startsAt: "2026-09-01T09:00:00+00:00",
            endsAt: "2026-09-01T10:00:00+00:00",
            schedulingStatus: "SCHEDULED",
            confirmationStatus: "CONFIRMED",
            encounterStatus: "PENDING",
            title: "Check-up",
            createdAt: "2026-08-27T09:00:00+00:00",
          },
        ],
      }),
      orgName: "SmileCare Dental Clinic",
      branchName: "Makati Branch",
    });

    expect(html).toContain("Demographics");
    expect(html).toContain("Referrals");
    expect(html).toContain("Appointments");
    expect(html).toContain("Oral Surgery");
    expect(html).toContain("2026-09-01 09:00");
    expect(html).not.toContain("Clinical history");
    expect(html).not.toContain("billing");
    expect(html).not.toContain("internal");
  });

  it("renders per-document-type sections from the bounded projection", () => {
    const referralHtml = renderDocumentHtml({
      documentType: "REFERRAL_LETTER",
      templateVersion: "v1",
      dataSnapshot: snapshot(),
      orgName: "SmileCare Dental Clinic",
      branchName: "Makati Branch",
    });
    expect(referralHtml).toContain("Demographics");
    expect(referralHtml).not.toContain(">Appointments</h2>");

    const slipHtml = renderDocumentHtml({
      documentType: "APPOINTMENT_SLIP",
      templateVersion: "v1",
      dataSnapshot: snapshot(),
      orgName: "SmileCare Dental Clinic",
      branchName: "Makati Branch",
    });
    expect(slipHtml).toContain("Demographics");
    expect(slipHtml).not.toContain(">Referrals</h2>");
  });

  it("falls back to a safe empty message when no sections were selected", () => {
    const html = renderDocumentHtml({
      documentType: "APPOINTMENT_SLIP",
      templateVersion: "v1",
      dataSnapshot: {},
      orgName: "SmileCare Dental Clinic",
      branchName: "Makati Branch",
    });

    expect(html).toContain("No sections were selected for this document.");
  });

  it("renders deterministically for reproducible re-render", () => {
    const input = {
      documentType: "PATIENT_RECORD_SUMMARY" as const,
      templateVersion: "v1",
      dataSnapshot: snapshot(),
      orgName: "SmileCare Dental Clinic",
      branchName: "Makati Branch",
    };

    expect(renderDocumentHtml(input)).toBe(renderDocumentHtml(input));
  });

  it("renders the acknowledged treatment-plan snapshot including the drawing canvas", () => {
    const html = renderDocumentHtml({
      documentType: "TREATMENT_PLAN",
      templateVersion: "v1",
      dataSnapshot: {
        plan: {
          planId,
          patientId,
          title: "Full mouth restoration",
          status: "ACKNOWLEDGED",
          version: 3,
          createdAt: "2026-08-27T09:00:00+00:00",
          updatedAt: "2026-08-27T10:00:00+00:00",
          createdBy: "c3000000-0000-0000-0000-000000000003",
        },
        items: [
          { itemId: "c6000000-0000-0000-0000-000000000006", lineNo: 1, procedureId: null, toothCode: "26", description: "Composite filling on 26.", estimatedFee: 2500, createdAt: "2026-08-27T09:00:00+00:00" },
          { itemId: "c6000000-0000-0000-0000-000000000007", lineNo: 2, procedureId: null, toothCode: "27", description: "Crown on 27.", estimatedFee: null, createdAt: "2026-08-27T09:00:00+00:00" },
        ],
        alternatives: [
          { alternativeId: "c6000000-0000-0000-0000-000000000008", alternativeNo: 1, summary: "Extraction and implant alternative.", createdAt: "2026-08-27T09:00:00+00:00" },
        ],
        discussions: [
          { discussionId: "c6000000-0000-0000-0000-000000000009", discussedBy: "c3000000-0000-0000-0000-000000000003", treatingProviderId: "c7000000-0000-0000-0000-000000000007", discussedAt: "2026-08-27T09:30:00+00:00", context: "Case discussion", createdAt: "2026-08-27T09:30:00+00:00" },
        ],
        drawing: {
          drawingId: "c6000000-0000-0000-0000-00000000000a",
          drawing: { strokes: [{ points: [{ x: 1, y: 2 }, { x: 10, y: 20 }] }], width: 320, height: 200 },
          updatedBy: "c3000000-0000-0000-0000-000000000003",
          updatedAt: "2026-08-27T09:45:00+00:00",
          version: 1,
        },
      },
      orgName: "SmileCare Dental Clinic",
      branchName: "Makati Branch",
    });

    expect(html).toContain("Treatment Plan");
    expect(html).toContain("Full mouth restoration");
    expect(html).toContain("ACKNOWLEDGED");
    expect(html).toContain("Composite filling on 26.");
    expect(html).toContain("Crown on 27.");
    expect(html).toContain("Extraction and implant alternative.");
    expect(html).toContain("Case discussion");
    expect(html).toContain('role="img"');
    expect(html).toContain("1.0,2.0 10.0,20.0");
    expect(html).toContain("2,500.00");
  });

  it("escapes treatment-plan snapshot text and emits no discussion notes bodies", () => {
    const html = renderDocumentHtml({
      documentType: "TREATMENT_PLAN",
      templateVersion: "v1",
      dataSnapshot: {
        plan: { planId, patientId, title: "<script>plan</script>", status: "DRAFT", version: 1, createdAt: "2026-08-27T09:00:00+00:00", updatedAt: "2026-08-27T09:00:00+00:00", createdBy: "c3000000-0000-0000-0000-000000000003" },
        discussions: [
          { discussionId: "c6000000-0000-0000-0000-000000000009", discussedBy: "c3000000-0000-0000-0000-000000000003", treatingProviderId: null, discussedAt: "2026-08-27T09:30:00+00:00", context: "Consent discussion", createdAt: "2026-08-27T09:30:00+00:00" },
        ],
      },
      orgName: "SmileCare Dental Clinic",
      branchName: "Makati Branch",
    });

    expect(html).not.toContain("<script>plan</script>");
    expect(html).toContain("&lt;script&gt;plan&lt;/script&gt;");
  });
});

describe("escapeHtml", () => {
  it("escapes every HTML metacharacter and nulls", () => {
    expect(escapeHtml(`<b>&"'"</b>`)).toBe("&lt;b&gt;&amp;&quot;&#39;&quot;&lt;/b&gt;");
    expect(escapeHtml(null)).toBe("");
    expect(escapeHtml(undefined)).toBe("");
    expect(escapeHtml(42)).toBe("42");
  });
});