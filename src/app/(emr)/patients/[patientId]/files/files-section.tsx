"use client";

import { useState } from "react";
import { Archive, Download, Plus } from "lucide-react";
import { useRouter } from "next/navigation";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { FileListItem, FileStatus } from "@/lib/files/types";

import { archiveFileAction, downloadUrlAction, type FileActionFailure } from "./actions";
import { UploadFileDialog } from "./upload-file-dialog";

type Props = { patientId: string; actingBranchId: string; canManage: boolean; initialFiles?: FileListItem[]; loadFailed?: boolean };

function formatFileSize(sizeBytes: number | null) {
  if (sizeBytes === null) return "Not verified";
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = sizeBytes;
  let unit = -1;
  do { value /= 1024; unit += 1; } while (value >= 1024 && unit < units.length - 1);
  return `${value.toFixed(1)} ${units[unit]}`;
}
function statusLabel(status: FileStatus) { return status.charAt(0).toUpperCase() + status.slice(1); }
function uploadedLabel(createdAt: string) { return createdAt.slice(0, 10); }
function failureMessage(failure: FileActionFailure) {
  if (failure.code === "NOT_AUTHORIZED") return "Your access or selected branch changed. Refresh the page and try again.";
  if (failure.code === "INVALID_STATE") return "This file is no longer in a state that allows that action. Refresh to see the latest list.";
  if (failure.code === "STALE_VERSION") return "This file changed while you were working. Refresh the page and try again.";
  return "The file storage is temporarily unavailable. Try again.";
}
function openStoredFile(url: string) {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.target = "_blank";
  anchor.rel = "noopener noreferrer";
  anchor.click();
}

export function FilesSection({ patientId, actingBranchId, canManage, initialFiles = [], loadFailed = false }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [busyFileId, setBusyFileId] = useState<string | null>(null);

  async function download(file: FileListItem) {
    setError(null); setBusyFileId(file.fileId);
    const result = await downloadUrlAction({ actingBranchId, fileId: file.fileId });
    if (result.ok) openStoredFile(result.downloadUrl); else setError(failureMessage(result));
    setBusyFileId(null);
  }

  return <section id="files" className="border-t py-6" aria-labelledby="files-title">
    <div className="flex items-center justify-between gap-3">
      <div><h2 id="files-title" className="text-base font-semibold">Files</h2><p className="mt-1 text-sm text-muted-foreground">Attachments stored for this patient record.</p></div>
      {canManage && <Button type="button" variant="outline" className="min-h-11" onClick={() => setAddOpen(true)}><Plus aria-hidden="true" /> Add file</Button>}
    </div>
    {loadFailed && <p role="alert" className="mt-4 border-y py-3 text-sm text-destructive">Files could not be loaded. Refresh to try again.</p>}
    {error && <p role="alert" className="mt-4 border-y py-3 text-sm text-destructive">{error}</p>}
    {!loadFailed && initialFiles.length === 0 && <p className="mt-4 border-y bg-subtle-surface/60 px-4 py-6 text-sm text-muted-foreground">No files have been added to this record.</p>}
    {!loadFailed && initialFiles.length > 0 && <>
      <div className="mt-4 hidden overflow-x-auto border-y md:block">
        <table className="w-full min-w-2xl text-left text-sm">
          <thead className="bg-subtle-surface text-xs uppercase tracking-wide text-muted-foreground"><tr><th scope="col" className="px-3 py-2.5 font-medium">Type</th><th scope="col" className="px-3 py-2.5 font-medium">Size</th><th scope="col" className="px-3 py-2.5 font-medium">Uploaded</th><th scope="col" className="px-3 py-2.5 font-medium">Status</th><th scope="col" className="px-3 py-2.5 font-medium"><span className="sr-only">Actions</span></th></tr></thead>
          <tbody className="divide-y">
            {initialFiles.map((file) => <tr key={file.fileId}>
              <th scope="row" className="px-3 py-3 font-mono text-xs font-medium">{file.mimeType}</th>
              <td className="px-3 py-3 text-muted-foreground">{formatFileSize(file.sizeBytes)}</td>
              <td className="px-3 py-3 text-muted-foreground">{uploadedLabel(file.createdAt)}</td>
              <td className="px-3 py-3">{statusLabel(file.status)}</td>
              <td className="px-3 py-3"><div className="flex justify-end gap-2"><RowActions file={file} actingBranchId={actingBranchId} busy={busyFileId === file.fileId} onDownload={download} /></div></td>
            </tr>)}
          </tbody>
        </table>
      </div>
      <div className="mt-4 divide-y border-y md:hidden">
        {initialFiles.map((file) => <article key={file.fileId} className="py-4">
          <div className="flex items-start justify-between gap-3"><h3 className="break-all font-mono text-xs font-medium">{file.mimeType}</h3><span className="text-xs font-medium">{statusLabel(file.status)}</span></div>
          <dl className="mt-3 grid gap-2 text-sm">
            <div className="grid grid-cols-[5.5rem_1fr] gap-2"><dt className="text-muted-foreground">Size</dt><dd>{formatFileSize(file.sizeBytes)}</dd></div>
            <div className="grid grid-cols-[5.5rem_1fr] gap-2"><dt className="text-muted-foreground">Uploaded</dt><dd>{uploadedLabel(file.createdAt)}</dd></div>
          </dl>
          <div className="mt-3 flex gap-2"><RowActions file={file} actingBranchId={actingBranchId} busy={busyFileId === file.fileId} onDownload={download} /></div>
        </article>)}
      </div>
    </>}
    <UploadFileDialog patientId={patientId} actingBranchId={actingBranchId} open={addOpen} onOpenChange={setAddOpen} onUploaded={() => router.refresh()} />
  </section>;
}

function RowActions({ file, actingBranchId, busy, onDownload }: { file: FileListItem; actingBranchId: string; busy: boolean; onDownload(file: FileListItem): Promise<void> }) {
  return <>
    {file.status === "available" && <Button type="button" size="sm" variant="outline" className="min-h-11" disabled={busy} onClick={() => void onDownload(file)}><Download aria-hidden="true" /> Download</Button>}
    {(file.status === "available" || file.status === "pending") && <ArchiveFileButton file={file} actingBranchId={actingBranchId} busy={busy} />}
  </>;
}

function ArchiveFileButton({ file, actingBranchId, busy }: { file: FileListItem; actingBranchId: string; busy: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [archiving, setArchiving] = useState(false);

  async function confirmArchive() {
    setError(null); setArchiving(true);
    const result = await archiveFileAction({ actingBranchId, fileId: file.fileId, expectedVersion: file.version });
    setArchiving(false);
    if (result.ok) { setOpen(false); router.refresh(); } else setError(failureMessage(result));
  }

  return <AlertDialog open={open} onOpenChange={(next) => { if (!archiving) { setOpen(next); if (!next) setError(null); } }}>
    <AlertDialogTrigger asChild>
      <Button type="button" size="sm" variant="outline" className="min-h-11" disabled={busy}><Archive aria-hidden="true" /> Archive</Button>
    </AlertDialogTrigger>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Archive this file?</AlertDialogTitle>
        <AlertDialogDescription>The file is removed from this record and its stored object is deleted. This requires a fresh security verification and cannot be undone from this screen.</AlertDialogDescription>
      </AlertDialogHeader>
      {error && <p role="alert" className="border-y border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p>}
      <AlertDialogFooter>
        <AlertDialogCancel disabled={archiving}>Cancel</AlertDialogCancel>
        <AlertDialogAction disabled={archiving || busy} onClick={(event) => { event.preventDefault(); void confirmArchive(); }}>Archive file</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
}
