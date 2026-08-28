"use client";

import Link from "next/link";

import { SectionHeader } from "@/components/layout/section-header";
import {
  DescriptionItem,
  DescriptionList,
} from "@/components/ui/description-list";
import type { PatientDetail } from "@/lib/patients/types";

import { ageFromBirthDate, formatBirthDate, patientSectionHref } from "./patient-sections";

type Props = {
  patient: PatientDetail;
  actingBranchId: string;
  canEdit: boolean;
};

function contactSummary(patient: PatientDetail) {
  const primary = patient.contacts.find((contact) => contact.isPrimary);
  if (primary) return `${primary.value} (${primary.contactType.replaceAll("_", " ")})`;
  const first = patient.contacts[0];
  return first ? first.value : null;
}

export function PatientOverview({
  patient,
  actingBranchId,
  canEdit,
}: Props) {
  const age = ageFromBirthDate(patient.birthDate);
  const primaryContact = contactSummary(patient);
  const guardians = patient.relationships.filter(
    (relationship) => relationship.isLegalGuardian,
  );

  return (
    <section aria-labelledby="overview-title" className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="min-w-0 space-y-8">
        <div>
          <SectionHeader
            id="overview-title"
            title="Patient summary"
            description="Key identity and contact details at a glance."
          />
          <DescriptionList className="mt-3">
            <DescriptionItem label="Birth date">
              {formatBirthDate(patient.birthDate)}
              {age !== null ? ` (${age} years old)` : ""}
            </DescriptionItem>
            <DescriptionItem label="Sex">
              {patient.sexAtRegistration
                ? patient.sexAtRegistration.replaceAll("_", " ")
                : "Not recorded"}
            </DescriptionItem>
            <DescriptionItem label="Preferred name">
              {patient.preferredName ?? "—"}
            </DescriptionItem>
            <DescriptionItem label="Preferred branch">
              {patient.preferredBranch?.name ?? "Not set"}
            </DescriptionItem>
          </DescriptionList>
        </div>

        <div className="border-t pt-6">
          <SectionHeader title="Contact" />
          {primaryContact ? (
            <DescriptionList className="mt-3">
              <DescriptionItem label="Primary contact">{primaryContact}</DescriptionItem>
              <DescriptionItem label="Other contacts">
                {patient.contacts.length > 1
                  ? `${patient.contacts.length - 1} more`
                  : "None"}
              </DescriptionItem>
            </DescriptionList>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              No contacts recorded.{" "}
              {canEdit && (
                <Link
                  href={patientSectionHref(patient.patientId, "contacts", actingBranchId)}
                  className="text-primary hover:underline"
                >
                  Add a contact
                </Link>
              )}
            </p>
          )}
        </div>

        <div className="border-t pt-6">
          <SectionHeader title="Relationships" />
          {patient.relationships.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              No relationships recorded.
            </p>
          ) : (
            <DescriptionList className="mt-3">
              <DescriptionItem label="Legal guardians">
                {guardians.length > 0
                  ? guardians
                      .map(
                        (guardian) =>
                          guardian.relatedPatientDisplayName ??
                          guardian.externalContactName,
                      )
                      .join(", ")
                  : "None"}
              </DescriptionItem>
              <DescriptionItem label="Other relationships">
                {patient.relationships.length - guardians.length > 0
                  ? `${patient.relationships.length - guardians.length} recorded`
                  : "None"}
              </DescriptionItem>
            </DescriptionList>
          )}
        </div>
      </div>

      <aside className="lg:border-l lg:pl-8">
        <SectionHeader title="Record" />
        <DescriptionList className="mt-3 lg:grid-cols-1">
          <DescriptionItem label="Patient number">
            <span className="font-mono text-sm">{patient.patientNumber}</span>
          </DescriptionItem>
          <DescriptionItem label="Status" className="capitalize">
            {patient.status}
          </DescriptionItem>
          <DescriptionItem label="Discovery source">
            {patient.attribution.acquisitionSource?.name ?? "Not recorded"}
          </DescriptionItem>
          <DescriptionItem label="Initial booking channel">
            {patient.attribution.initialBookingChannel?.name ?? "Not recorded"}
          </DescriptionItem>
          <DescriptionItem label="Referrer">
            {patient.attribution.referrerPatient?.displayName ??
              patient.attribution.externalReferrer.name ??
              "Not recorded"}
          </DescriptionItem>
        </DescriptionList>
      </aside>
    </section>
  );
}