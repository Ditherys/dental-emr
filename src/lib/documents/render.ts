import "server-only";

import { formatPhpCentavos } from "@/lib/billing/money";

import type {
  AppointmentSnapshot,
  DocumentRenderInput,
  PatientDemographicsSnapshot,
  PatientReferralSnapshot,
  TreatmentPlanAlternativeSnapshot,
  TreatmentPlanDrawingSnapshot,
  TreatmentPlanDiscussionSnapshot,
  TreatmentPlanItemSnapshot,
  TreatmentPlanSnapshot,
} from "./types";

const ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ESCAPE_MAP[char]!);
}

const DOCUMENT_TITLES = {
  PATIENT_RECORD_SUMMARY: "Patient Record Summary",
  APPOINTMENT_SLIP: "Appointment Slip",
  REFERRAL_LETTER: "Referral Letter",
  TREATMENT_PLAN: "Treatment Plan",
} as const;

// Deterministic across environments: renders the stored ISO date/time segment
// verbatim rather than depending on the server or viewer locale/timezone.
function formatIsoDateTime(value: unknown): string {
  const text = String(value ?? "");
  const match = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/.exec(text);
  return match ? `${match[1]} ${match[2]}` : text;
}

function kvRow(label: string, value: unknown): string {
  const text = String(value ?? "");
  return `<tr><th scope="row">${escapeHtml(label)}</th><td>${text ? escapeHtml(text) : "<span class=\"print-empty\">—</span>"}</td></tr>`;
}

function renderDemographics(demographics: PatientDemographicsSnapshot): string {
  const fullName = [
    demographics.firstName,
    demographics.middleName,
    demographics.lastName,
    demographics.suffix,
  ].filter(Boolean).join(" ");
  const address = [
    demographics.addressLine1,
    demographics.addressLine2,
    demographics.city,
    demographics.province,
    demographics.postalCode,
  ].filter(Boolean).join(", ");
  const contactLines = demographics.contacts.map((contact) => {
    const prefix = contact.contactType;
    const label = contact.label ? ` (${contact.label})` : "";
    const suffix = contact.isPrimary ? " (primary)" : "";
    return `${prefix}${label}: ${contact.value}${suffix}`;
  });

  return [
    '<section class="print-section">',
    "<h2>Demographics</h2>",
    '<table class="print-kv">',
    kvRow("Patient number", demographics.patientNumber),
    kvRow("Full name", fullName),
    kvRow("Preferred name", demographics.preferredName),
    kvRow("Birth date", demographics.birthDate),
    kvRow("Sex at registration", demographics.sexAtRegistration),
    kvRow("Address", address),
    kvRow("Record status", demographics.status),
    contactLines.length > 0
      ? kvRow("Contacts", contactLines.map((line) => escapeHtml(line)).join("<br />"))
      : "",
    "</table>",
    "</section>",
  ].join("");
}

function renderReferrals(referrals: PatientReferralSnapshot[]): string {
  const rows = referrals
    .map((referral) => {
      const externalParty = [
        referral.externalPartyName,
        referral.externalPartyOrganization,
        referral.externalPartyContact,
      ].filter(Boolean).join(", ");
      return [
        "<tr>",
        `<td>${escapeHtml(referral.direction)}</td>`,
        `<td>${escapeHtml(referral.status)}</td>`,
        `<td>${escapeHtml(referral.requiredSpecialtyName)}</td>`,
        `<td>${escapeHtml(externalParty)}</td>`,
        `<td>${escapeHtml(referral.notes)}</td>`,
        `<td>${escapeHtml(formatIsoDateTime(referral.createdAt))}</td>`,
        "</tr>",
      ].join("");
    })
    .join("");

  return [
    '<section class="print-section">',
    "<h2>Referrals</h2>",
    '<table class="print-grid">',
    "<thead><tr><th scope=\"col\">Direction</th><th scope=\"col\">Status</th><th scope=\"col\">Specialty</th><th scope=\"col\">External party</th><th scope=\"col\">Notes</th><th scope=\"col\">Date</th></tr></thead>",
    `<tbody>${rows}</tbody>`,
    "</table>",
    "</section>",
  ].join("");
}

function renderAppointments(appointments: AppointmentSnapshot[]): string {
  const rows = appointments
    .map((appointment) => {
      return [
        "<tr>",
        `<td>${escapeHtml(formatIsoDateTime(appointment.startsAt))}</td>`,
        `<td>${escapeHtml(appointment.title)}</td>`,
        `<td>${escapeHtml(appointment.schedulingStatus)}</td>`,
        `<td>${escapeHtml(appointment.confirmationStatus)}</td>`,
        `<td>${escapeHtml(appointment.encounterStatus)}</td>`,
        "</tr>",
      ].join("");
    })
    .join("");

  return [
    '<section class="print-section">',
    "<h2>Appointments</h2>",
    '<table class="print-grid">',
    "<thead><tr><th scope=\"col\">Starts</th><th scope=\"col\">Title</th><th scope=\"col\">Scheduling</th><th scope=\"col\">Confirmation</th><th scope=\"col\">Encounter</th></tr></thead>",
    `<tbody>${rows}</tbody>`,
    "</table>",
    "</section>",
  ].join("");
}

function formatFeeCentavos(value: string | null): string {
  if (value === null) return "";
  return formatPhpCentavos(BigInt(value));
}

function renderTreatmentPlanHeader(plan: TreatmentPlanSnapshot): string {
  return [
    '<section class="print-section">',
    "<h2>Plan</h2>",
    '<table class="print-kv">',
    kvRow("Title", plan.title),
    kvRow("Status", plan.status),
    kvRow("Version", plan.version),
    kvRow("Created", formatIsoDateTime(plan.createdAt)),
    kvRow("Last updated", formatIsoDateTime(plan.updatedAt)),
    "</table>",
    "</section>",
  ].join("");
}

function renderTreatmentPlanItems(items: TreatmentPlanItemSnapshot[]): string {
  const rows = items
    .map((item) => {
      return [
        "<tr>",
        `<td>${escapeHtml(item.lineNo)}</td>`,
        `<td>${escapeHtml(item.toothCode)}</td>`,
        `<td>${escapeHtml(item.description)}</td>`,
        `<td>${escapeHtml(formatFeeCentavos(item.estimatedFeeCentavos))}</td>`,
        "</tr>",
      ].join("");
    })
    .join("");

  return [
    '<section class="print-section">',
    "<h2>Proposed items</h2>",
    '<table class="print-grid">',
    "<thead><tr><th scope=\"col\">Line</th><th scope=\"col\">Tooth</th><th scope=\"col\">Description</th><th scope=\"col\">Estimated fee</th></tr></thead>",
    `<tbody>${rows}</tbody>`,
    "</table>",
    "</section>",
  ].join("");
}

function renderTreatmentPlanAlternatives(alternatives: TreatmentPlanAlternativeSnapshot[]): string {
  const rows = alternatives
    .map((alternative) => {
      return [
        "<tr>",
        `<td>${escapeHtml(alternative.alternativeNo)}</td>`,
        `<td>${escapeHtml(alternative.summary)}</td>`,
        "</tr>",
      ].join("");
    })
    .join("");

  return [
    '<section class="print-section">',
    "<h2>Alternatives</h2>",
    '<table class="print-grid">',
    "<thead><tr><th scope=\"col\">#</th><th scope=\"col\">Summary</th></tr></thead>",
    `<tbody>${rows}</tbody>`,
    "</table>",
    "</section>",
  ].join("");
}

function renderTreatmentPlanDiscussions(discussions: TreatmentPlanDiscussionSnapshot[]): string {
  const rows = discussions
    .map((discussion) => {
      return [
        "<tr>",
        `<td>${escapeHtml(formatIsoDateTime(discussion.discussedAt))}</td>`,
        `<td>${escapeHtml(discussion.context)}</td>`,
        `<td>${escapeHtml(discussion.treatingProviderId ?? "—")}</td>`,
        "</tr>",
      ].join("");
    })
    .join("");

  return [
    '<section class="print-section">',
    "<h2>Discussions</h2>",
    '<table class="print-grid">',
    "<thead><tr><th scope=\"col\">When</th><th scope=\"col\">Context</th><th scope=\"col\">Treating provider</th></tr></thead>",
    `<tbody>${rows}</tbody>`,
    "</table>",
    "</section>",
  ].join("");
}

// The drawing is the plan's renderer-independent canvas: strokes of points.
// Only the bounded stroke geometry is emitted into a safe SVG so the printed
// plan reproduces the acknowledged drawing without any client-side rendering.
function renderTreatmentPlanDrawing(drawing: NonNullable<TreatmentPlanDrawingSnapshot>): string {
  const canvas = drawing.drawing ?? {};
  const rawStrokes = Array.isArray(canvas.strokes) ? canvas.strokes : [];
  const width = Number(canvas.width) || 320;
  const height = Number(canvas.height) || 200;
  const paths = rawStrokes
    .map((stroke) => {
      const points = Array.isArray(stroke && typeof stroke === "object" ? stroke.points : undefined)
        ? (stroke as { points: { x?: unknown; y?: unknown }[] }).points
        : [];
      const segments = points
        .map((point) => {
          const x = Number(point.x);
          const y = Number(point.y);
          if (!Number.isFinite(x) || !Number.isFinite(y)) return "";
          return `${x.toFixed(1)},${y.toFixed(1)} `;
        })
        .join("");
      return segments.trim()
        ? `<polyline fill="none" stroke="#111827" stroke-width="1.5" points="${escapeHtml(segments.trim())}"/>`
        : "";
    })
    .filter(Boolean)
    .join("");

  return [
    '<section class="print-section">',
    "<h2>Plan drawing</h2>",
    `<svg viewBox="0 0 ${escapeHtml(width)} ${escapeHtml(height)}" role="img" aria-label="Acknowledged treatment plan drawing" xmlns="http://www.w3.org/2000/svg" class="print-drawing">${paths}</svg>`,
    "</section>",
  ].join("");
}

export function renderDocumentHtml({
  documentType,
  templateVersion,
  dataSnapshot,
  orgName,
  branchName,
}: DocumentRenderInput): string {
  const title = DOCUMENT_TITLES[documentType];

  const sections: string[] = [];
  if (dataSnapshot.demographics) {
    sections.push(renderDemographics(dataSnapshot.demographics));
  }
  if (dataSnapshot.referrals && dataSnapshot.referrals.length > 0) {
    sections.push(renderReferrals(dataSnapshot.referrals));
  }
  if (dataSnapshot.appointments && dataSnapshot.appointments.length > 0) {
    sections.push(renderAppointments(dataSnapshot.appointments));
  }
  if (dataSnapshot.plan) {
    sections.push(renderTreatmentPlanHeader(dataSnapshot.plan));
  }
  if (dataSnapshot.items && dataSnapshot.items.length > 0) {
    sections.push(renderTreatmentPlanItems(dataSnapshot.items));
  }
  if (dataSnapshot.alternatives && dataSnapshot.alternatives.length > 0) {
    sections.push(renderTreatmentPlanAlternatives(dataSnapshot.alternatives));
  }
  if (dataSnapshot.discussions && dataSnapshot.discussions.length > 0) {
    sections.push(renderTreatmentPlanDiscussions(dataSnapshot.discussions));
  }
  if (dataSnapshot.drawing) {
    sections.push(renderTreatmentPlanDrawing(dataSnapshot.drawing));
  }

  const content =
    sections.length > 0
      ? sections.join("")
      : '<p class="print-empty">No sections were selected for this document.</p>';

  return [
    "<style>",
    "@page { size: A4; margin: 18mm; }",
    ".print-document { max-width: 174mm; margin: 0 auto; background: #ffffff; color: #111827; font-family: Arial, Helvetica, sans-serif; font-size: 12px; line-height: 1.45; }",
    ".print-document header { border-bottom: 2px solid #1e3a5f; padding-bottom: 12px; }",
    ".print-document .print-org { font-size: 16px; font-weight: 700; color: #1e3a5f; }",
    ".print-document .print-branch { margin-top: 2px; font-size: 12px; color: #4b5563; }",
    ".print-document .print-title { margin-top: 8px; font-size: 14px; font-weight: 700; }",
    ".print-document .print-section { margin-top: 16px; }",
    ".print-document h2 { margin: 0 0 8px; padding-bottom: 4px; border-bottom: 1px solid #e5e7eb; font-size: 13px; font-weight: 700; }",
    ".print-document table { width: 100%; border-collapse: collapse; }",
    ".print-document th, .print-document td { border: 1px solid #d1d5db; padding: 5px 8px; text-align: left; vertical-align: top; }",
    ".print-document .print-kv th { width: 34%; background: #f9fafb; font-weight: 600; }",
    ".print-document .print-drawing { width: 100%; max-height: 160mm; border: 1px solid #e5e7eb; background: #ffffff; }",
    ".print-document footer { margin-top: 24px; border-top: 1px solid #e5e7eb; padding-top: 8px; font-size: 10px; color: #6b7280; }",
    ".print-document .print-empty { color: #6b7280; }",
    "@media print { body { margin: 0; } .print-document { max-width: 100%; margin: 0; box-shadow: none; } .print-document a { color: inherit; text-decoration: none; } }",
    "</style>",
    '<article class="print-document" data-document-type="' + escapeHtml(documentType) + '">',
    "<header>",
    `<p class="print-org">${escapeHtml(orgName)}</p>`,
    `<p class="print-branch">${escapeHtml(branchName)}</p>`,
    `<p class="print-title">${escapeHtml(title)}</p>`,
    "</header>",
    `<main>${content}</main>`,
    "<footer>",
    `Prepared from the structured EMR record · Template ${escapeHtml(templateVersion)}`,
    " · Reproducible snapshot",
    "</footer>",
    "</article>",
  ].join("\n");
}
