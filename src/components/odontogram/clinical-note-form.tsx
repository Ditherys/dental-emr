"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { recordVisitClinicalNoteAction } from "@/app/(emr)/patients/[patientId]/odontogram-actions";

/**
 * Authored note types only. `AMENDMENT` is deliberately absent: amending a
 * finalized note stays with the existing correction path, which this form
 * neither replaces nor relaxes.
 */
const NOTE_TYPES = [
  { value: "PROGRESS", label: "Progress" },
  { value: "CONSULTATION", label: "Consultation" },
  { value: "PROCEDURE", label: "Procedure" },
  { value: "POST_OP", label: "Post-operative" },
  { value: "REFERRAL", label: "Referral" },
  { value: "FREE_FORM", label: "Free form" },
] as const;

type NoteType = (typeof NOTE_TYPES)[number]["value"];
type WriteResult = Awaited<ReturnType<typeof recordVisitClinicalNoteAction>>;

function failureMessage(result: Extract<WriteResult, { ok: false }>): string {
  if (result.code === "NOT_AUTHORIZED") {
    return "Your clinical access or selected branch changed. The note was not recorded; refresh before retrying.";
  }
  if (result.code === "INVALID_INPUT") {
    return "The note could not be recorded because it is not valid. Review it and try again.";
  }
  return "The note could not be recorded. Nothing was saved; retry when you are ready.";
}

function newRequestKey(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return uuid;
  throw new Error("secure request key unavailable");
}

export type ClinicalNoteFormProps = {
  patientId: string;
  branchId: string;
  onRecorded: () => void | Promise<void>;
};

/**
 * A bounded visit note. The server obtains the managed visit, authors the note
 * as a DRAFT under it, and derives every attribution field; this form supplies
 * route context, a note type, and the authored text.
 */
export function ClinicalNoteForm({
  patientId,
  branchId,
  onRecorded,
}: ClinicalNoteFormProps): React.ReactElement {
  const router = useRouter();
  const [noteType, setNoteType] = React.useState<NoteType>("PROGRESS");
  const [content, setContent] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const typeId = React.useId();
  const contentId = React.useId();
  // Held across a failed submission so an unmodified retry replays the same
  // request key, and cleared on success so the next note is a genuinely new one.
  const requestKeyRef = React.useRef<string | null>(null);

  /**
   * Editing the note type or the authored text makes this a different clinical
   * record, so it must not inherit the previous submission's request key: an
   * ambiguous failure followed by an edit would otherwise replay the stored
   * server result and report the edited note as recorded when only the original
   * one exists.
   */
  function changeAuthoredNote() {
    requestKeyRef.current = null;
    setError(null);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;

    const authored = content.trim();
    if (authored === "") {
      setError("A note is required before it can be recorded.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      requestKeyRef.current ??= newRequestKey();
      const result = await recordVisitClinicalNoteAction({
        patientId,
        branchId,
        noteType,
        content: authored,
        idempotencyKey: requestKeyRef.current,
      });
      if (!result.ok) {
        setError(failureMessage(result));
        return;
      }
      requestKeyRef.current = null;
      setContent("");
      await onRecorded();
      router.refresh();
    } catch {
      setError("The note could not be recorded. Nothing was saved; retry when you are ready.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="grid gap-3" onSubmit={submit} aria-label="Record clinical note">
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

      <label htmlFor={typeId} className="grid gap-1 text-xs font-medium">
        Note type
        <Select
          id={typeId}
          value={noteType}
          onChange={(event) => {
            changeAuthoredNote();
            setNoteType(event.target.value as NoteType);
          }}
          className="min-h-11"
        >
          {NOTE_TYPES.map((type) => (
            <option key={type.value} value={type.value}>
              {type.label}
            </option>
          ))}
        </Select>
      </label>

      <label htmlFor={contentId} className="grid gap-1 text-xs font-medium">
        Note
        <Textarea
          id={contentId}
          required
          maxLength={4000}
          value={content}
          onChange={(event) => {
            changeAuthoredNote();
            setContent(event.target.value);
          }}
          className="min-h-28"
        />
      </label>

      <Button type="submit" size="sm" className="min-h-11 justify-center" disabled={saving}>
        {saving ? "Recording…" : "Record note"}
      </Button>
    </form>
  );
}
