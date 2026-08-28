"use client";

import { LoaderCircle, Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";

import { SectionHeader } from "@/components/layout/section-header";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type {
  PatientContactDetail,
  PatientDetail,
  PatientRelationshipDetail,
} from "@/lib/patients/types";

import {
  archiveContactAction,
  archiveRelationshipAction,
  createContactAction,
  createRelationshipAction,
  updateContactAction,
  updateRelationshipAction,
} from "./actions";
import {
  patientCandidateInput,
  patientMutationMessage,
  type DuplicateRequest,
} from "./patient-sections";

type SharedProps = {
  patient: PatientDetail;
  actingBranchId: string;
  canEdit: boolean;
  saving: boolean;
  setSaving: (value: boolean) => void;
  onDuplicateRequired: (request: DuplicateRequest) => Promise<void>;
};

function nullable(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text || null;
}

export function ContactsSection({
  patient,
  actingBranchId,
  canEdit,
  saving,
  setSaving,
  onDuplicateRequired,
}: SharedProps) {
  const router = useRouter();
  const [contact, setContact] = useState<PatientContactDetail | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<PatientContactDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save(data: FormData, item: PatientContactDetail | null, confirmed = false) {
    const contactType = String(data.get("contactType") ?? "MOBILE") as PatientContactDetail["contactType"];
    const value = String(data.get("value") ?? "");
    const input = {
      patientId: patient.patientId,
      actingBranchId,
      contactType,
      label: nullable(data.get("label")),
      value,
      isPrimary: data.get("isPrimary") === "on",
      duplicateConfirmed: confirmed,
      ...(item ? { contactId: item.contactId, expectedVersion: item.version } : {}),
    };

    setSaving(true);
    const result = item
      ? await updateContactAction(input)
      : await createContactAction(input);
    setSaving(false);

    if (!result.ok && result.code === "DUPLICATE_REVIEW_REQUIRED" && !confirmed) {
      return void onDuplicateRequired({
        kind: "contact",
        reviewInput: patientCandidateInput(
          patient,
          actingBranchId,
          contactType === "MOBILE" ? value : undefined,
          contactType === "EMAIL" ? value : undefined,
        ),
        submit: (confirmedValue) => save(data, item, confirmedValue),
      });
    }

    if (!result.ok) return setError(patientMutationMessage(result.code));

    setError(null);
    setContact(null);
    router.refresh();
  }

  async function archive(item: PatientContactDetail) {
    setSaving(true);
    const result = await archiveContactAction(item.contactId, {
      patientId: patient.patientId,
      actingBranchId,
      expectedVersion: item.version,
    });
    setSaving(false);
    if (!result.ok) return setError(patientMutationMessage(result.code));
    setError(null);
    setArchiveTarget(null);
    router.refresh();
  }

  return (
    <section aria-labelledby="contacts-title">
      <SectionHeader
        id="contacts-title"
        title="Contacts"
        description="Mobile and email changes are checked for possible duplicates."
        action={
          canEdit ? (
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                setContact({
                  contactId: "",
                  contactType: "MOBILE",
                  label: null,
                  value: "",
                  isPrimary: false,
                  version: 0,
                })
              }
            >
              <Plus aria-hidden="true" />
              Add contact
            </Button>
          ) : undefined
        }
      />

      {error && (
        <p role="alert" className="mt-3 border-y py-2.5 text-sm text-destructive">
          {error}
        </p>
      )}

      {patient.contacts.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          No contacts recorded.
        </p>
      ) : (
        <ul className="mt-4 divide-y border-y">
          {patient.contacts.map((item) => (
            <li key={item.contactId} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{item.value}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {item.contactType.replaceAll("_", " ")}
                  {item.label ? ` · ${item.label}` : ""}
                  {item.isPrimary ? " · Primary" : ""}
                </p>
              </div>
              {canEdit && (
                <div className="flex shrink-0 gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setError(null);
                      setContact(item);
                    }}
                  >
                    <Pencil aria-hidden="true" />
                    Edit
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setError(null);
                      setArchiveTarget(item);
                    }}
                  >
                    Archive
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <ContactDialog
        item={contact}
        close={() => setContact(null)}
        saving={saving}
        save={save}
      />

      <AlertDialog
        open={Boolean(archiveTarget)}
        onOpenChange={(open) => !open && setArchiveTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive this contact?</AlertDialogTitle>
            <AlertDialogDescription>
              The contact is removed from this patient record. This cannot be
              undone from this screen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={saving}
              onClick={(event) => {
                event.preventDefault();
                if (archiveTarget) void archive(archiveTarget);
              }}
            >
              Archive contact
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

export function RelationshipsSection({
  patient,
  actingBranchId,
  canEdit,
  saving,
  setSaving,
}: SharedProps) {
  const router = useRouter();
  const [relationship, setRelationship] = useState<PatientRelationshipDetail | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<PatientRelationshipDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save(data: FormData, item: PatientRelationshipDetail | null) {
    const input = {
      patientId: patient.patientId,
      actingBranchId,
      relatedPatientId: nullable(data.get("relatedPatientId")) ?? undefined,
      externalContactName: nullable(data.get("externalContactName")) ?? undefined,
      externalMobile: nullable(data.get("externalMobile")) ?? undefined,
      externalEmail: nullable(data.get("externalEmail")) ?? undefined,
      relationshipType: String(data.get("relationshipType") ?? "GUARDIAN"),
      isLegalGuardian: data.get("isLegalGuardian") === "on",
      canReceiveCommunications: data.get("canReceiveCommunications") === "on",
      canConsent: data.get("canConsent") === "on",
      ...(item ? { relationshipId: item.relationshipId, expectedVersion: item.version } : {}),
    };

    setSaving(true);
    const result = item
      ? await updateRelationshipAction(input)
      : await createRelationshipAction(input);
    setSaving(false);

    if (!result.ok) return setError(patientMutationMessage(result.code));

    setError(null);
    setRelationship(null);
    router.refresh();
  }

  async function archive(item: PatientRelationshipDetail) {
    setSaving(true);
    const result = await archiveRelationshipAction(item.relationshipId, {
      patientId: patient.patientId,
      actingBranchId,
      expectedVersion: item.version,
    });
    setSaving(false);
    if (!result.ok) return setError(patientMutationMessage(result.code));
    setError(null);
    setArchiveTarget(null);
    router.refresh();
  }

  return (
    <section aria-labelledby="relationships-title">
      <SectionHeader
        id="relationships-title"
        title="Relationships"
        description="Guardians, dependents, and related contacts for this patient."
        action={
          canEdit ? (
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                setRelationship({
                  relationshipId: "",
                  relatedPatientId: null,
                  relatedPatientDisplayName: null,
                  externalContactName: null,
                  externalMobile: null,
                  externalEmail: null,
                  relationshipType: "GUARDIAN",
                  isLegalGuardian: false,
                  canReceiveCommunications: false,
                  canConsent: false,
                  version: 0,
                })
              }
            >
              <Plus aria-hidden="true" />
              Add relationship
            </Button>
          ) : undefined
        }
      />

      {error && (
        <p role="alert" className="mt-3 border-y py-2.5 text-sm text-destructive">
          {error}
        </p>
      )}

      {patient.relationships.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          No relationships recorded.
        </p>
      ) : (
        <ul className="mt-4 divide-y border-y">
          {patient.relationships.map((item) => (
            <li key={item.relationshipId} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {item.relatedPatientDisplayName ?? item.externalContactName}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {item.relationshipType.replaceAll("_", " ")}
                  {item.isLegalGuardian ? " · Legal guardian" : ""}
                  {item.canConsent ? " · Can consent" : ""}
                  {item.canReceiveCommunications ? " · Contactable" : ""}
                </p>
              </div>
              {canEdit && (
                <div className="flex shrink-0 gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setError(null);
                      setRelationship(item);
                    }}
                  >
                    <Pencil aria-hidden="true" />
                    Edit
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setError(null);
                      setArchiveTarget(item);
                    }}
                  >
                    Archive
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <RelationshipDialog
        item={relationship}
        close={() => setRelationship(null)}
        saving={saving}
        save={save}
      />

      <AlertDialog
        open={Boolean(archiveTarget)}
        onOpenChange={(open) => !open && setArchiveTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive this relationship?</AlertDialogTitle>
            <AlertDialogDescription>
              The relationship is removed from this patient record. This cannot
              be undone from this screen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={saving}
              onClick={(event) => {
                event.preventDefault();
                if (archiveTarget) void archive(archiveTarget);
              }}
            >
              Archive relationship
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function ContactDialog({
  item,
  close,
  saving,
  save,
}: {
  item: PatientContactDetail | null;
  close(): void;
  saving: boolean;
  save(data: FormData, item: PatientContactDetail | null): Promise<void>;
}) {
  const isNew = item?.contactId === "";
  return (
    <Dialog open={Boolean(item)} onOpenChange={(open) => !open && close()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{isNew ? "Add contact" : "Edit contact"}</DialogTitle>
          <DialogDescription>
            Mobile and email changes are checked for possible duplicates before
            they are saved.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (item) void save(new FormData(event.currentTarget), isNew ? null : item);
          }}
          className="grid gap-4"
        >
          <FormField label="Type">
            <Select name="contactType" defaultValue={item?.contactType}>
              <option value="MOBILE">Mobile</option>
              <option value="EMAIL">Email</option>
              <option value="LANDLINE">Landline</option>
              <option value="OTHER">Other</option>
            </Select>
          </FormField>
          <FormField label="Value" required>
            <Input name="value" defaultValue={item?.value ?? ""} required />
          </FormField>
          <FormField label="Label">
            <Input name="label" defaultValue={item?.label ?? ""} />
          </FormField>
          <label className="flex min-h-10 items-center gap-2 text-sm">
            <input name="isPrimary" type="checkbox" defaultChecked={item?.isPrimary} />
            Primary contact
          </label>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={close}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <LoaderCircle className="animate-spin" aria-hidden="true" />}
              Save contact
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RelationshipDialog({
  item,
  close,
  saving,
  save,
}: {
  item: PatientRelationshipDetail | null;
  close(): void;
  saving: boolean;
  save(data: FormData, item: PatientRelationshipDetail | null): Promise<void>;
}) {
  const isNew = item?.relationshipId === "";
  const related = item?.relatedPatientId;
  return (
    <Dialog open={Boolean(item)} onOpenChange={(open) => !open && close()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{isNew ? "Add relationship" : "Edit relationship"}</DialogTitle>
          <DialogDescription>
            Record an external guardian or contact. Existing related-patient
            links retain their linked patient.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (item) void save(new FormData(event.currentTarget), isNew ? null : item);
          }}
          className="grid gap-4"
        >
          {related ? (
            <>
              <input type="hidden" name="relatedPatientId" value={related} />
              <p className="text-sm">
                Related patient: {item?.relatedPatientDisplayName}
              </p>
            </>
          ) : (
            <>
              <FormField label="External contact name" required>
                <Input
                  name="externalContactName"
                  defaultValue={item?.externalContactName ?? ""}
                  required
                />
              </FormField>
              <FormField label="Mobile">
                <Input name="externalMobile" defaultValue={item?.externalMobile ?? ""} />
              </FormField>
              <FormField label="Email">
                <Input name="externalEmail" defaultValue={item?.externalEmail ?? ""} />
              </FormField>
            </>
          )}
          <FormField label="Relationship">
            <Select name="relationshipType" defaultValue={item?.relationshipType ?? "GUARDIAN"}>
              {["PARENT", "GUARDIAN", "CHILD", "SPOUSE", "DEPENDENT", "EMERGENCY_CONTACT", "HOUSEHOLD_CONTACT", "OTHER"].map((type) => (
                <option key={type} value={type}>
                  {type.replaceAll("_", " ")}
                </option>
              ))}
            </Select>
          </FormField>
          <label className="flex min-h-10 items-center gap-2 text-sm">
            <input name="isLegalGuardian" type="checkbox" defaultChecked={item?.isLegalGuardian} />
            Legal guardian
          </label>
          <label className="flex min-h-10 items-center gap-2 text-sm">
            <input
              name="canReceiveCommunications"
              type="checkbox"
              defaultChecked={item?.canReceiveCommunications}
            />
            Can receive communications
          </label>
          <label className="flex min-h-10 items-center gap-2 text-sm">
            <input name="canConsent" type="checkbox" defaultChecked={item?.canConsent} />
            Can consent
          </label>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <LoaderCircle className="animate-spin" aria-hidden="true" />}
              Save relationship
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}