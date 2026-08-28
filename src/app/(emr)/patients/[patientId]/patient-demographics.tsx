"use client";

import { LoaderCircle, Pencil } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";

import { SectionHeader } from "@/components/layout/section-header";
import { Button } from "@/components/ui/button";
import {
  DescriptionItem,
  DescriptionList,
} from "@/components/ui/description-list";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { PatientDetail } from "@/lib/patients/types";

import { updatePatientAction } from "./actions";
import {
  ageFromBirthDate,
  formatBirthDate,
  patientCandidateInput,
  patientMutationMessage,
  type DuplicateRequest,
} from "./patient-sections";

type Props = {
  patient: PatientDetail;
  actingBranchId: string;
  canEdit: boolean;
  initialEditing?: boolean;
  saving: boolean;
  setSaving: (value: boolean) => void;
  setHasUnsavedChanges: (value: boolean) => void;
  onDuplicateRequired: (request: DuplicateRequest) => Promise<void>;
};

function nullable(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text || null;
}

const sexOptions = [
  { value: "", label: "Not recorded" },
  { value: "female", label: "Female" },
  { value: "male", label: "Male" },
  { value: "intersex", label: "Intersex" },
  { value: "unknown", label: "Unknown" },
  { value: "not_recorded", label: "Not recorded" },
];

export function PatientDemographics({
  patient,
  actingBranchId,
  canEdit,
  initialEditing = false,
  saving,
  setSaving,
  setHasUnsavedChanges,
  onDuplicateRequired,
}: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(initialEditing);
  const [error, setError] = useState<string | null>(null);

  async function save(data: FormData, confirmed = false) {
    const updated = {
      ...patientCandidateInput(patient, actingBranchId),
      firstName: String(data.get("firstName") ?? ""),
      middleName: nullable(data.get("middleName")),
      lastName: String(data.get("lastName") ?? ""),
      suffix: nullable(data.get("suffix")),
      preferredName: nullable(data.get("preferredName")),
      birthDate: String(data.get("birthDate") ?? ""),
      sexAtRegistration: nullable(data.get("sexAtRegistration")),
      addressLine1: nullable(data.get("addressLine1")),
      addressLine2: nullable(data.get("addressLine2")),
      city: nullable(data.get("city")),
      province: nullable(data.get("province")),
      postalCode: nullable(data.get("postalCode")),
    };
    const input = {
      ...updated,
      patientId: patient.patientId,
      expectedVersion: patient.version,
      duplicateConfirmed: confirmed,
    };

    setSaving(true);
    const result = await updatePatientAction(input);
    setSaving(false);

    if (!result.ok && result.code === "DUPLICATE_REVIEW_REQUIRED" && !confirmed) {
      return void onDuplicateRequired({
        kind: "demographics",
        reviewInput: {
          ...updated,
          initialMobile: undefined,
          initialEmail: undefined,
        },
        submit: (confirmedValue) => save(data, confirmedValue),
      });
    }

    if (!result.ok) return setError(patientMutationMessage(result.code));

    setError(null);
    setHasUnsavedChanges(false);
    setEditing(false);
    router.refresh();
  }

  if (!editing) {
    const age = ageFromBirthDate(patient.birthDate);

    return (
      <section aria-labelledby="demographics-title">
        <SectionHeader
          id="demographics-title"
          title="Demographics"
          description="Identity and address information."
          action={
            canEdit ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setError(null);
                  setEditing(true);
                }}
              >
                <Pencil aria-hidden="true" />
                Edit
              </Button>
            ) : undefined
          }
        />

        {error && (
          <p role="alert" className="mt-3 border-y py-2.5 text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="mt-4 grid gap-x-10 gap-y-6 lg:grid-cols-2">
          <div>
            <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Personal information
            </h3>
            <DescriptionList className="mt-2 gap-y-3 sm:grid-cols-2 lg:grid-cols-2">
              <DescriptionItem label="First name">{patient.firstName}</DescriptionItem>
              <DescriptionItem label="Middle name">{patient.middleName ?? "—"}</DescriptionItem>
              <DescriptionItem label="Last name">{patient.lastName}</DescriptionItem>
              <DescriptionItem label="Suffix">{patient.suffix ?? "—"}</DescriptionItem>
              <DescriptionItem label="Preferred name">{patient.preferredName ?? "—"}</DescriptionItem>
              <DescriptionItem label="Birth date">
                {formatBirthDate(patient.birthDate)}
                {age !== null ? ` (${age} years old)` : ""}
              </DescriptionItem>
              <DescriptionItem label="Sex">
                {patient.sexAtRegistration
                  ? patient.sexAtRegistration.replaceAll("_", " ")
                  : "Not recorded"}
              </DescriptionItem>
            </DescriptionList>
          </div>

          <div>
            <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Address
            </h3>
            <DescriptionList className="mt-2 gap-y-3 sm:grid-cols-2 lg:grid-cols-2">
              <DescriptionItem label="Address">
                {[patient.addressLine1, patient.addressLine2].filter(Boolean).join(", ") || "—"}
              </DescriptionItem>
              <DescriptionItem label="City">{patient.city ?? "—"}</DescriptionItem>
              <DescriptionItem label="Province">{patient.province ?? "—"}</DescriptionItem>
              <DescriptionItem label="Postal code">{patient.postalCode ?? "—"}</DescriptionItem>
            </DescriptionList>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section aria-labelledby="demographics-title">
      <SectionHeader
        id="demographics-title"
        title="Demographics"
        description="Edit identity and address information."
      />

      {error && (
        <p role="alert" className="mt-3 border-y py-2.5 text-sm text-destructive">
          {error}
        </p>
      )}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void save(new FormData(event.currentTarget));
        }}
        onChange={() => setHasUnsavedChanges(true)}
        className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3"
      >
        <FormField label="First name" required>
          <Input name="firstName" defaultValue={patient.firstName} required autoFocus />
        </FormField>
        <FormField label="Middle name">
          <Input name="middleName" defaultValue={patient.middleName ?? ""} />
        </FormField>
        <FormField label="Last name" required>
          <Input name="lastName" defaultValue={patient.lastName} required />
        </FormField>
        <FormField label="Suffix">
          <Input name="suffix" defaultValue={patient.suffix ?? ""} />
        </FormField>
        <FormField label="Preferred name">
          <Input name="preferredName" defaultValue={patient.preferredName ?? ""} />
        </FormField>
        <FormField label="Birth date" required>
          <Input name="birthDate" type="date" defaultValue={patient.birthDate} required />
        </FormField>
        <FormField label="Sex at registration">
          <Select name="sexAtRegistration" defaultValue={patient.sexAtRegistration ?? ""}>
            {sexOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Address line 1">
          <Input name="addressLine1" defaultValue={patient.addressLine1 ?? ""} />
        </FormField>
        <FormField label="Address line 2">
          <Input name="addressLine2" defaultValue={patient.addressLine2 ?? ""} />
        </FormField>
        <FormField label="City">
          <Input name="city" defaultValue={patient.city ?? ""} />
        </FormField>
        <FormField label="Province">
          <Input name="province" defaultValue={patient.province ?? ""} />
        </FormField>
        <FormField label="Postal code">
          <Input name="postalCode" defaultValue={patient.postalCode ?? ""} />
        </FormField>

        <div className="flex flex-wrap items-center gap-2 md:col-span-2 xl:col-span-3">
          <Button type="submit" disabled={saving}>
            {saving && <LoaderCircle className="animate-spin" aria-hidden="true" />}
            Save demographics
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={saving}
            onClick={() => {
              setError(null);
              setHasUnsavedChanges(false);
              setEditing(false);
            }}
          >
            Cancel
          </Button>
          <p className="text-xs text-muted-foreground">
            Changes are checked for possible duplicates before they are saved.
          </p>
        </div>
      </form>
    </section>
  );
}