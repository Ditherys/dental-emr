"use client";

import { LoaderCircle, Upload } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { proposeDisplayFilename } from "@/lib/clinical-media/filename";
import { PHOTO_CATEGORIES, type ClinicalPhotoCategory } from "@/lib/clinical-media/types";

export type PhotoProcedureCaseChoice = { procedureCaseId: string; display: string };

export type PhotoUploadDraft = {
  file: File;
  originalClientFilename: string;
  displayFilename: string;
  category: ClinicalPhotoCategory;
  captureAt: string;
  toothCodes: string[];
  surfaces: string[];
  note: string | null;
  procedureCaseId: string | null;
};

export type PhotoUploadSubmitResult = { ok: true } | { ok: false; message?: string };

export type PhotoUploadDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canWriteClinical: boolean;
  onSubmit: (draft: PhotoUploadDraft) => Promise<PhotoUploadSubmitResult> | PhotoUploadSubmitResult;
  defaultCaptureAt?: string;
  defaultCategory?: ClinicalPhotoCategory;
  defaultToothCodes?: readonly string[];
  defaultSurfaces?: readonly string[];
  defaultProcedureCaseId?: string | null;
  procedureCases?: readonly PhotoProcedureCaseChoice[];
  sequence?: number;
};

const ACCEPTED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MIME_EXTENSION: Record<(typeof ACCEPTED_MIME_TYPES)[number], "jpg" | "png" | "webp"> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const CATEGORY_LABELS: Record<ClinicalPhotoCategory, string> = { BEFORE: "Before", PROGRESS: "Progress", AFTER: "After", DIAGNOSTIC: "Diagnostic", RADIOGRAPH: "Radiograph", INTRAORAL: "Intraoral", EXTRAORAL: "Extraoral", OTHER: "Other" };

function dateTimeLocal(value: string | undefined) {
  if (!value) return "";
  return value.slice(0, 16);
}

function parseList(value: string) {
  return Array.from(new Set(value.split(",").map((item) => item.trim()).filter(Boolean))).slice(0, 32);
}

function humanFileType(file: File) {
  return file.type === "image/jpeg" ? "JPEG" : file.type === "image/png" ? "PNG" : "WebP";
}

function suggestedName(category: ClinicalPhotoCategory, captureAt: string, toothCodes: readonly string[], sequence: number, file: File | null) {
  if (!file || !ACCEPTED_MIME_TYPES.includes(file.type as (typeof ACCEPTED_MIME_TYPES)[number])) return "";
  try {
    return proposeDisplayFilename({ captureDate: captureAt.slice(0, 10), category, toothCodes: [...toothCodes], sequence: Math.max(1, Math.trunc(sequence)), extension: MIME_EXTENSION[file.type as (typeof ACCEPTED_MIME_TYPES)[number]] });
  } catch {
    return "";
  }
}

export function PhotoUploadDialog({
  open,
  onOpenChange,
  canWriteClinical,
  onSubmit,
  defaultCaptureAt = "",
  defaultCategory = "PROGRESS",
  defaultToothCodes = [],
  defaultSurfaces = [],
  defaultProcedureCaseId = null,
  procedureCases = [],
  sequence = 1,
}: PhotoUploadDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [category, setCategory] = useState<ClinicalPhotoCategory>(defaultCategory);
  const [captureAt, setCaptureAt] = useState(dateTimeLocal(defaultCaptureAt));
  const [toothCodesValue, setToothCodesValue] = useState(defaultToothCodes.join(", "));
  const [surfacesValue, setSurfacesValue] = useState(defaultSurfaces.join(", "));
  const [displayFilename, setDisplayFilename] = useState("");
  const [filenameWasEdited, setFilenameWasEdited] = useState(false);
  const [note, setNote] = useState("");
  const [procedureCaseId, setProcedureCaseId] = useState(defaultProcedureCaseId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // The dialog stays mounted between uploads, so its initial state is only the
  // first context it ever saw. Each time it is opened it must adopt the context
  // the clinician opened it from — otherwise a photograph attached from tooth
  // 36 would silently carry tooth 11 from an earlier visit into the record.
  // The adjustment runs during render rather than in an effect so no frame can
  // paint the previous selection against the new one.
  //
  // The key deliberately uses only the clinical DATE of the prefilled capture
  // instant, never its time of day. A caller that recomputes the time — from a
  // clock, or on any re-render — must not be able to reset a form the clinician
  // is still filling in. Time of day is a starting value, not the identity of
  // the clinical context.
  const [openedWith, setOpenedWith] = useState<string | null>(null);
  const contextKey = open
    ? [defaultCaptureAt.slice(0, 10), defaultCategory, defaultToothCodes.join(","), defaultSurfaces.join(","), defaultProcedureCaseId ?? ""].join("|")
    : null;
  if (contextKey !== openedWith) {
    setOpenedWith(contextKey);
    if (contextKey !== null) {
      setFile(null);
      setCategory(defaultCategory);
      setCaptureAt(dateTimeLocal(defaultCaptureAt));
      setToothCodesValue(defaultToothCodes.join(", "));
      setSurfacesValue(defaultSurfaces.join(", "));
      setDisplayFilename("");
      setFilenameWasEdited(false);
      setNote("");
      setProcedureCaseId(defaultProcedureCaseId ?? "");
      setError(null);
    }
  }

  const toothCodes = useMemo(() => parseList(toothCodesValue), [toothCodesValue]);
  const suggested = useMemo(() => suggestedName(category, captureAt, toothCodes, sequence, file), [category, captureAt, file, sequence, toothCodes]);

  function chooseFile(nextFile: File | undefined) {
    setError(null);
    if (!nextFile) {
      setFile(null);
      return;
    }
    setFile(nextFile);
    setFilenameWasEdited(false);
    if (nextFile.size <= 0) {
      setError("The image must not be empty.");
    } else if (!ACCEPTED_MIME_TYPES.includes(nextFile.type as (typeof ACCEPTED_MIME_TYPES)[number])) {
      setError("Use a JPEG, PNG, or WebP image.");
    } else if (nextFile.size > MAX_FILE_BYTES) {
      setError("The image must be 25 MB or smaller.");
    }
  }

  const effectiveDisplayFilename = filenameWasEdited ? displayFilename : suggested;
  const valid = Boolean(canWriteClinical && file && file.size > 0 && ACCEPTED_MIME_TYPES.includes(file.type as (typeof ACCEPTED_MIME_TYPES)[number]) && file.size <= MAX_FILE_BYTES && effectiveDisplayFilename.trim() && captureAt && !error);

  async function submit() {
    if (!valid || !file) return;
    setSubmitting(true);
    setError(null);
    const result = await onSubmit({
      file,
      originalClientFilename: file.name,
      displayFilename: effectiveDisplayFilename.trim(),
      category,
      captureAt: new Date(captureAt).toISOString(),
      toothCodes,
      surfaces: parseList(surfacesValue),
      note: note.trim() || null,
      procedureCaseId: procedureCaseId || null,
    });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.message || "The photograph could not be added. Review the fields and try again.");
      return;
    }
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>Add clinical photograph</DialogTitle><DialogDescription>Attach a dated image to the patient record. The original camera filename stays restricted provenance and is not displayed here.</DialogDescription></DialogHeader>
        {!canWriteClinical ? <p className="border-y py-4 text-sm text-muted-foreground">Read-only access. Clinical photographs can only be added by an authorized clinical user.</p> : <form onSubmit={(event) => { event.preventDefault(); void submit(); }} className="grid gap-4">
          <div className="grid gap-2"><label htmlFor="clinical-photo-file" className="text-sm font-medium">Photo file</label><Input id="clinical-photo-file" type="file" accept={ACCEPTED_MIME_TYPES.join(",")} onChange={(event) => chooseFile(event.target.files?.[0])} className="h-auto min-h-11 py-2" />{file && !error && <p className="text-xs text-muted-foreground">{humanFileType(file)} image selected · {(file.size / 1024 / 1024).toFixed(2)} MB</p>}</div>
          <div className="grid gap-4 sm:grid-cols-2"><label className="grid gap-2 text-sm font-medium" htmlFor="clinical-photo-category">Photo category<select id="clinical-photo-category" aria-label="Photo category" value={category} onChange={(event) => setCategory(event.target.value as ClinicalPhotoCategory)} className="h-10 rounded-md border border-input bg-background px-3 text-sm font-normal text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25">{PHOTO_CATEGORIES.map((option) => <option key={option} value={option}>{CATEGORY_LABELS[option]}</option>)}</select></label><label className="grid gap-2 text-sm font-medium" htmlFor="clinical-photo-capture-at">Capture date and time<input id="clinical-photo-capture-at" aria-label="Capture date and time" type="datetime-local" value={captureAt} onChange={(event) => setCaptureAt(event.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm font-normal text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25" /></label></div>
          <div className="grid gap-2"><label htmlFor="clinical-photo-display-filename" className="text-sm font-medium">Display filename</label><Input id="clinical-photo-display-filename" aria-label="Display filename" value={effectiveDisplayFilename} onChange={(event) => { setDisplayFilename(event.target.value); setFilenameWasEdited(true); }} maxLength={255} /><p className="text-xs text-muted-foreground">Metadata only; this name never becomes the private storage path.</p></div>
          <div className="grid gap-4 sm:grid-cols-2"><label className="grid gap-2 text-sm font-medium" htmlFor="clinical-photo-teeth">Tooth codes <Input id="clinical-photo-teeth" aria-label="Tooth codes" value={toothCodesValue} onChange={(event) => setToothCodesValue(event.target.value)} placeholder="e.g. 11, 21" /></label><label className="grid gap-2 text-sm font-medium" htmlFor="clinical-photo-surfaces">Surfaces <Input id="clinical-photo-surfaces" aria-label="Surfaces" value={surfacesValue} onChange={(event) => setSurfacesValue(event.target.value)} placeholder="e.g. O, M" /></label></div>
          {procedureCases.length > 0 && <label className="grid gap-2 text-sm font-medium" htmlFor="clinical-photo-procedure-case">Procedure case<select id="clinical-photo-procedure-case" aria-label="Procedure case" value={procedureCaseId} onChange={(event) => setProcedureCaseId(event.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm font-normal text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25"><option value="">No linked procedure</option>{procedureCases.map((item) => <option key={item.procedureCaseId} value={item.procedureCaseId}>{item.display}</option>)}</select></label>}
          <label className="grid gap-2 text-sm font-medium" htmlFor="clinical-photo-note">Clinical note <Textarea id="clinical-photo-note" aria-label="Clinical note" value={note} onChange={(event) => setNote(event.target.value)} maxLength={2000} placeholder="Optional context for the treatment record" /></label>
          {error && <p role="alert" className="border-y py-2 text-sm text-destructive">{error}</p>}
          <DialogFooter><Button type="button" variant="outline" className="min-h-11" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button><Button type="submit" className="min-h-11" disabled={!valid || submitting}>{submitting ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Upload aria-hidden="true" />}Confirm and add to record</Button></DialogFooter>
        </form>}
      </DialogContent>
    </Dialog>
  );
}
