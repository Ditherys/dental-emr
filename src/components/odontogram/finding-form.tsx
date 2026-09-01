"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  CLINICAL_FINDING_CODES,
  allowedSurfacesForToothCodes,
  isWholeToothFindingCode,
  type ClinicalFindingCode,
  type ToothSurfaceCode,
} from "@/lib/odontogram/clinical-codes";
import { recordVisitToothFindingsAction } from "@/app/(emr)/patients/[patientId]/odontogram-actions";

const FINDING_LABELS: Readonly<Record<ClinicalFindingCode, string>> = {
  CARIES: "Caries",
  RESTORATION: "Restoration",
  CROWN: "Crown",
  MISSING: "Missing",
  SEALANT: "Sealant",
  FRACTURE: "Fracture",
  OTHER: "Other",
};

const SURFACE_LABELS: Readonly<Record<ToothSurfaceCode, string>> = {
  O: "Occlusal",
  I: "Incisal",
  B: "Buccal",
  L: "Lingual",
  M: "Mesial",
  D: "Distal",
  F: "Facial",
};

type WriteResult = Awaited<ReturnType<typeof recordVisitToothFindingsAction>>;

function failureMessage(result: Extract<WriteResult, { ok: false }>): string {
  if (result.code === "NOT_AUTHORIZED") {
    return "Your clinical access or selected branch changed. The finding could not be recorded; refresh before retrying.";
  }
  if (result.code === "INVALID_INPUT") {
    return "The finding could not be recorded because it is not valid for the selected teeth. Review the surfaces and try again.";
  }
  if (result.code === "CONFLICT" || result.code === "STALE_VERSION") {
    return "This chart changed while you were working, so the finding could not be recorded. Retry to record it once.";
  }
  return "The finding could not be recorded. Nothing was saved; retry when you are ready.";
}

function newRequestKey(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return uuid;
  // A request key must be a UUID the server can serialize on. Without the Web
  // Crypto API there is no safe key, so the submission is refused rather than
  // sent with a guessable one.
  throw new Error("secure request key unavailable");
}

export type FindingFormProps = {
  patientId: string;
  branchId: string;
  /** FDI codes of the teeth the composer is recording against. */
  toothCodes: readonly string[];
  /** The explicit clinical date the composer owns and preserves across kinds. */
  clinicalDate: string;
  onClinicalDateChange: (next: string) => void;
  onRecorded: () => void | Promise<void>;
};

/**
 * The canonical tooth-finding form.
 *
 * It submits route context and clinical facts only: the server starts or
 * resumes the managed visit, derives the treating provider, and revalidates
 * every relationship. Nothing here is rendered as recorded before the server
 * confirms it, and a failed write keeps the draft with the same request key so
 * a retry can never double-record.
 */
export function FindingForm({
  patientId,
  branchId,
  toothCodes,
  clinicalDate,
  onClinicalDateChange,
  onRecorded,
}: FindingFormProps): React.ReactElement {
  const router = useRouter();
  const [findingCode, setFindingCode] = React.useState<ClinicalFindingCode>("CARIES");
  const [surfaces, setSurfaces] = React.useState<readonly ToothSurfaceCode[]>([]);
  const [note, setNote] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const findingId = React.useId();
  const dateId = React.useId();
  const noteId = React.useId();
  // Held across a failed submission so an unmodified retry replays the same
  // request key, and cleared on success so the next finding is a genuinely new
  // record.
  const requestKeyRef = React.useRef<string | null>(null);

  /**
   * Any change to the submitted clinical facts makes this a different clinical
   * record, so it must not inherit the previous submission's request key.
   *
   * Without this, an ambiguous failure (the request committed but its response
   * was lost) followed by an edit would replay the stored server result, and the
   * form would report the edited finding as recorded when only the original one
   * exists. The canonical chart would show the truth; the success signal would
   * not.
   */
  function changeClinicalFacts() {
    requestKeyRef.current = null;
    setError(null);
  }

  const wholeTooth = isWholeToothFindingCode(findingCode);
  const availableSurfaces = React.useMemo(
    () => allowedSurfacesForToothCodes(toothCodes),
    [toothCodes],
  );
  const selectedSurfaces = React.useMemo(
    () => availableSurfaces.filter((surface) => surfaces.includes(surface)),
    [availableSurfaces, surfaces],
  );

  function toggleSurface(surface: ToothSurfaceCode) {
    changeClinicalFacts();
    setSurfaces((current) =>
      current.includes(surface) ? current.filter((item) => item !== surface) : [...current, surface],
    );
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;

    const submittedSurfaces = wholeTooth ? [] : selectedSurfaces;
    if (!wholeTooth && submittedSurfaces.length === 0) {
      setError("Select at least one surface for this finding.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      requestKeyRef.current ??= newRequestKey();
      const result = await recordVisitToothFindingsAction({
        patientId,
        branchId,
        toothCodes: [...toothCodes],
        findingCode,
        surfaces: submittedSurfaces,
        status: "ACTIVE",
        clinicalDate,
        ...(note.trim() ? { note: note.trim() } : {}),
        idempotencyKey: requestKeyRef.current,
      });
      if (!result.ok) {
        setError(failureMessage(result));
        return;
      }
      requestKeyRef.current = null;
      setSurfaces([]);
      setNote("");
      await onRecorded();
      router.refresh();
    } catch {
      setError("The finding could not be recorded. Nothing was saved; retry when you are ready.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="grid gap-3" onSubmit={submit} aria-label="Record clinical finding">
      {error && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-destructive/40 px-3 py-2 text-xs text-destructive"
        >
          <span className="min-w-0 break-words">{error}</span>
          <Button type="submit" variant="outline" size="sm" className="min-h-11 shrink-0" disabled={saving}>
            Retry
          </Button>
        </div>
      )}

      <label htmlFor={findingId} className="grid gap-1 text-xs font-medium">
        Finding
        <Select
          id={findingId}
          value={findingCode}
          onChange={(event) => {
            setFindingCode(event.target.value as ClinicalFindingCode);
            changeClinicalFacts();
          }}
          className="min-h-11"
        >
          {CLINICAL_FINDING_CODES.map((code) => (
            <option key={code} value={code}>
              {FINDING_LABELS[code]}
            </option>
          ))}
        </Select>
      </label>

      {!wholeTooth && (
        <fieldset className="grid gap-1.5">
          <legend className="text-xs font-medium">Surfaces</legend>
          <div role="group" aria-label="Surfaces" className="flex flex-wrap gap-1.5">
            {availableSurfaces.map((surface) => (
              <label
                key={surface}
                className="flex min-h-11 cursor-pointer items-center gap-1.5 rounded-md border px-2.5 text-xs has-checked:border-primary has-checked:bg-primary/10"
              >
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={surfaces.includes(surface)}
                  onChange={() => toggleSurface(surface)}
                />
                {SURFACE_LABELS[surface]} ({surface})
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <label htmlFor={dateId} className="grid gap-1 text-xs font-medium">
        Clinical date
        <Input
          id={dateId}
          type="date"
          required
          value={clinicalDate}
          onChange={(event) => {
            changeClinicalFacts();
            onClinicalDateChange(event.target.value);
          }}
          className="min-h-11"
        />
      </label>

      <label htmlFor={noteId} className="grid gap-1 text-xs font-medium">
        Note (optional)
        <Textarea
          id={noteId}
          maxLength={2000}
          value={note}
          onChange={(event) => {
            changeClinicalFacts();
            setNote(event.target.value);
          }}
          className="min-h-20"
        />
      </label>

      <Button type="submit" size="sm" className="min-h-11 justify-center" disabled={saving}>
        {saving ? "Recording…" : "Record finding"}
      </Button>
    </form>
  );
}
