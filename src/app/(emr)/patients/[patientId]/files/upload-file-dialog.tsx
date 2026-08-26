"use client";

import { useEffect, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MAX_FILE_SIZE_BYTES } from "@/lib/files/schema";

import { confirmFileUploadAction, createFileUploadAction, type FileActionFailure } from "./actions";

type UploadPhase = "idle" | "creating" | "transferring" | "confirming";
const inputClass = "flex min-h-11 w-full items-center rounded-md border bg-background px-3 py-2.5 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-subtle-surface file:px-3 file:text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30";

function message(failure: FileActionFailure) {
  if (failure.code === "NOT_AUTHORIZED") return "Your access or selected branch changed. Close this dialog and try again.";
  if (failure.code === "INVALID_STATE") return "The upload could not be verified against the stored object. Try again.";
  if (failure.code === "STORAGE_PAYLOAD_TOO_LARGE") return `This file is larger than the ${Math.round(MAX_FILE_SIZE_BYTES / (1024 * 1024))} MB limit.`;
  if (failure.code === "INVALID_INPUT") return "This file could not be accepted. Check the file and try again.";
  return "The file storage is temporarily unavailable. Try again.";
}

export function UploadFileDialog({ patientId, actingBranchId, open, onOpenChange, onUploaded }: { patientId: string; actingBranchId: string; open: boolean; onOpenChange(open: boolean): void; onUploaded(): void }) {
  const [phase, setPhase] = useState<UploadPhase>("idle");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const transferRef = useRef<AbortController | null>(null);
  const generationRef = useRef(0);
  const busy = phase !== "idle";
  useEffect(() => { generationRef.current += 1; }, [open]);
  function close() {
    generationRef.current += 1;
    transferRef.current?.abort();
    transferRef.current = null; setPhase("idle"); setFile(null); setError(null);
    onOpenChange(false);
  }

  async function submit() {
    if (!file) return;
    const generation = generationRef.current;
    setError(null);
    const mimeType = file.type || "application/octet-stream";
    setPhase("creating");
    const created = await createFileUploadAction({ patientId, actingBranchId, mimeType, ...(file.size > 0 ? { sizeBytes: file.size } : {}) });
    if (generation !== generationRef.current) return;
    if (!created.ok) { setPhase("idle"); setError(message(created)); return; }
    setPhase("transferring");
    const transfer = new AbortController();
    transferRef.current = transfer;
    let transferred = false;
    try {
      transferred = (await fetch(created.uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": mimeType }, signal: transfer.signal })).ok;
    } catch { transferred = false; }
    if (transferRef.current === transfer) transferRef.current = null;
    if (generation !== generationRef.current) return;
    if (!transferred) { setPhase("idle"); setError("The file could not be transferred to storage. Check your connection and try again."); return; }
    setPhase("confirming");
    const confirmed = await confirmFileUploadAction({ actingBranchId, fileId: created.fileId, expectedVersion: created.version });
    if (generation !== generationRef.current) return;
    if (!confirmed.ok) { setPhase("idle"); setError(message(confirmed)); return; }
    setPhase("idle"); setFile(null); close(); onUploaded();
  }

  return <Dialog open={open} onOpenChange={(next) => { if (!next) close(); }}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Add file</DialogTitle>
        <DialogDescription>The file is transferred directly to clinic storage and becomes available after the server verifies it.</DialogDescription>
      </DialogHeader>
      <form onSubmit={(event) => { event.preventDefault(); void submit(); }} className="grid gap-4">
        <label className="grid gap-1.5 text-sm font-medium">File<input type="file" disabled={busy} onChange={(event) => { setError(null); setFile(event.target.files?.[0] ?? null); }} className={inputClass} /></label>
        {file && <p className="text-xs text-muted-foreground">Type: {file.type || "application/octet-stream"}</p>}
        {!error && file && file.size > MAX_FILE_SIZE_BYTES && <p role="alert" className="border-y border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive">This file is larger than the {Math.round(MAX_FILE_SIZE_BYTES / (1024 * 1024))} MB limit.</p>}
        {error && <p role="alert" className="border-y border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button type="button" variant="outline" className="min-h-11" disabled={busy} onClick={() => close()}>Cancel</Button>
          <Button type="submit" className="min-h-11" disabled={busy || !file || Boolean(file && file.size > MAX_FILE_SIZE_BYTES)}>{busy && <LoaderCircle className="animate-spin" />}Upload file</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
