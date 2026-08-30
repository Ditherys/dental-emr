"use client";
/* eslint-disable react-hooks/set-state-in-effect -- clear transient clinical selection on patient/branch context changes. */
/* eslint-disable @next/next/no-img-element -- private derivative URLs come from the provider-neutral media adapter. */

import {
  Archive,
  CalendarDays,
  ChevronDown,
  Eye,
  GitCompareArrows,
  Image as ImageIcon,
  LoaderCircle,
  Pencil,
  Plus,
  RefreshCw,
  UserRound,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { sanitizeDisplayFilename } from "@/lib/clinical-media/filename";
import type { ClinicalPhotoDTO, ClinicalPhotoVariant } from "@/lib/clinical-media/types";

import { BeforeAfterCompare } from "./before-after-compare";

/**
 * A server-minted, permission-checked derivative URL may be attached at the
 * page boundary. It is intentionally separate from ClinicalPhotoDTO so the
 * canonical clinical record never depends on a delivery provider or URL.
 */
export type ClinicalPhotoDisplay = ClinicalPhotoDTO & {
  thumbnailUrl?: string | null;
  previewUrl?: string | null;
  displayUrl?: string | null;
  photographerDisplayName?: string | null;
  procedureDisplayName?: string | null;
};

export type ClinicalPhotoGalleryProps = {
  patientId: string;
  actingBranchId: string;
  canWriteClinical: boolean;
  initialPhotos: readonly ClinicalPhotoDisplay[];
  loadFailed?: boolean;
  onOpenUpload?: () => void;
  onRefresh?: () => void;
  /** Resolves a short-lived private derivative URL through the server action/media adapter. */
  resolveDerivativeUrl?: (photo: ClinicalPhotoDisplay, variant: ClinicalPhotoVariant) => Promise<string | null>;
  onRename?: (photo: ClinicalPhotoDisplay, displayFilename: string) => void | Promise<void>;
  onPair?: (source: ClinicalPhotoDisplay, matching: ClinicalPhotoDisplay) => void | Promise<void>;
  onArchive?: (photo: ClinicalPhotoDisplay) => void | Promise<void>;
};

type PhotoFilter = {
  category: ClinicalPhotoDTO["category"] | "ALL";
  date: string;
  procedure: string;
  tooth: string;
  photographer: string;
};

const CATEGORY_LABELS: Record<ClinicalPhotoDTO["category"], string> = {
  BEFORE: "Before",
  PROGRESS: "Progress",
  AFTER: "After",
  DIAGNOSTIC: "Diagnostic",
  INTRAORAL: "Intraoral",
  EXTRAORAL: "Extraoral",
  OTHER: "Other",
};

const STATUS_LABELS: Record<ClinicalPhotoDTO["processingStatus"], string> = {
  PENDING: "Pending",
  PROCESSING: "Processing",
  READY: "Ready",
  FAILED: "Needs attention",
};

const STATUS_CLASSES: Record<ClinicalPhotoDTO["processingStatus"], string> = {
  PENDING: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200",
  PROCESSING: "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900/50 dark:bg-sky-950/30 dark:text-sky-200",
  READY: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-200",
  FAILED: "border-destructive/30 bg-destructive/5 text-destructive",
};

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "Unknown date";
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function photoDate(value: string) {
  return value.slice(0, 10);
}

function imageUrl(photo: ClinicalPhotoDisplay) {
  return photo.previewUrl ?? photo.displayUrl ?? photo.thumbnailUrl ?? null;
}

function categoryLabel(category: ClinicalPhotoDTO["category"]) {
  return CATEGORY_LABELS[category];
}

function categoryOptions(photos: readonly ClinicalPhotoDisplay[]) {
  return Array.from(new Set(photos.map((photo) => photo.category))).sort();
}

function photographerOptions(photos: readonly ClinicalPhotoDisplay[]) {
  return Array.from(new Set(photos.map((photo) => photo.photographerDisplayName).filter((name): name is string => Boolean(name)))).sort();
}

function matchesFilter(photo: ClinicalPhotoDisplay, filter: PhotoFilter) {
  if (filter.category !== "ALL" && photo.category !== filter.category) return false;
  if (filter.date && photoDate(photo.captureAt) !== filter.date) return false;
  if (filter.procedure && !(photo.procedureDisplayName ?? "").toLocaleLowerCase().includes(filter.procedure.toLocaleLowerCase())) return false;
  if (filter.tooth && !photo.toothCodes.some((code) => code.toLocaleLowerCase().includes(filter.tooth.toLocaleLowerCase()))) return false;
  if (filter.photographer !== "ALL" && photo.photographerDisplayName !== filter.photographer) return false;
  return true;
}

function getPair(photo: ClinicalPhotoDisplay, photos: readonly ClinicalPhotoDisplay[]) {
  if (!photo.pairedPhotoId) return null;
  const matching = photos.find((candidate) => candidate.photoId === photo.pairedPhotoId);
  if (!matching || matching.patientId !== photo.patientId) return null;
  const before = photo.category === "BEFORE" ? photo : matching.category === "BEFORE" ? matching : null;
  const after = photo.category === "AFTER" ? photo : matching.category === "AFTER" ? matching : null;
  return before && after ? { before, after } : { before: before ?? photo, after: after ?? matching };
}

function PhotoImage({ photo, size = "preview" }: { photo: ClinicalPhotoDisplay; size?: "thumbnail" | "preview" | "display" }) {
  const src = size === "thumbnail" ? photo.thumbnailUrl ?? imageUrl(photo) : size === "display" ? photo.displayUrl ?? imageUrl(photo) : imageUrl(photo);
  if (!src || photo.processingStatus !== "READY") {
    return (
      <div className="flex aspect-[4/3] w-full items-center justify-center bg-muted/50 text-muted-foreground" role="img" aria-label={`${categoryLabel(photo.category)} photograph preview unavailable`}>
        {photo.processingStatus === "FAILED" ? <p className="px-4 text-center text-xs">Preview unavailable</p> : <LoaderCircle className="size-5 animate-spin" aria-label="Processing photograph" />}
      </div>
    );
  }
  return <img src={src} alt={`${categoryLabel(photo.category)} photograph: ${photo.displayFilename}`} loading="lazy" className="aspect-[4/3] w-full object-cover" />;
}

function PhotoCard({
  photo,
  canWriteClinical,
  pairingSource,
  onView,
  onPairStart,
  onPairSelect,
  pairingPending,
  pairingEnabled,
  onRename: onRenameRequest,
  onArchive,
}: {
  photo: ClinicalPhotoDisplay;
  canWriteClinical: boolean;
  pairingSource: ClinicalPhotoDisplay | null;
  onView: (photo: ClinicalPhotoDisplay) => void;
  onPairStart: (photo: ClinicalPhotoDisplay) => void;
  onPairSelect: (photo: ClinicalPhotoDisplay) => void;
  pairingPending: boolean;
  pairingEnabled: boolean;
  onRename?: (photo: ClinicalPhotoDisplay) => void;
  onArchive?: (photo: ClinicalPhotoDisplay) => void;
}) {
  const pairable = photo.category === "BEFORE" || photo.category === "AFTER";
  const selectingThis = pairingSource?.photoId === photo.photoId;
  const selectedAsMatch = Boolean(pairingSource && pairingSource.photoId !== photo.photoId && pairingSource.category !== photo.category);
  const pair = photo.pairedPhotoId ? "Paired" : null;

  return (
    <article className="flex min-w-0 flex-col border bg-background" data-testid={`clinical-photo-${photo.photoId}`}>
      <button type="button" className="group relative block min-h-11 w-full overflow-hidden text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50" onClick={() => onView(photo)} aria-label="View photo">
        <PhotoImage photo={photo} size="thumbnail" />
        <span className="absolute inset-x-2 bottom-2 inline-flex items-center justify-center gap-1 bg-black/65 px-2 py-1 text-xs font-medium text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"><Eye className="size-3.5" aria-hidden="true" />View photo</span>
      </button>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium" title={photo.displayFilename}>{photo.displayFilename}</p>
            <p className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground"><CalendarDays className="size-3.5" aria-hidden="true" /><time dateTime={photo.captureAt}>{formatDateTime(photo.captureAt)}</time></p>
          </div>
          <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[0.6875rem] font-medium ${STATUS_CLASSES[photo.processingStatus]}`}>{STATUS_LABELS[photo.processingStatus]}</span>
        </div>
        <div className="flex flex-wrap gap-1.5 text-[0.6875rem] text-muted-foreground">
          <span className="rounded border px-1.5 py-0.5">{categoryLabel(photo.category)}</span>
          {photo.toothCodes.map((code) => <span key={code} className="rounded border px-1.5 py-0.5">Tooth {code}</span>)}
          {pair && <span className="rounded border border-primary/30 bg-primary/5 px-1.5 py-0.5 text-primary">{pair}</span>}
        </div>
        {photo.procedureDisplayName && <p className="truncate text-xs text-muted-foreground">{photo.procedureDisplayName}</p>}
        {photo.photographerDisplayName && <p className="inline-flex items-center gap-1 truncate text-xs text-muted-foreground"><UserRound className="size-3.5" aria-hidden="true" />{photo.photographerDisplayName}</p>}
        {photo.note && <p className="line-clamp-2 text-xs text-muted-foreground">{photo.note}</p>}
        {pairingSource && pairingSource.photoId !== photo.photoId && selectedAsMatch && pairable && <Button type="button" variant="secondary" className="min-h-11 w-full" onClick={() => onPairSelect(photo)} disabled={pairingPending}>{pairingPending ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : null}Select as matching photo</Button>}
        {selectingThis && <p className="text-xs text-primary">Select the matching before/after photograph.</p>}
        {canWriteClinical && (
          <div className="mt-auto flex flex-wrap gap-1.5 border-t pt-2">
            {pairingEnabled && pairable && !photo.pairedPhotoId && <Button type="button" variant="outline" className="min-h-11 flex-1" onClick={() => onPairStart(photo)}><GitCompareArrows aria-hidden="true" />Pair with another photo</Button>}
            {onRenameRequest && <Button type="button" variant="ghost" className="min-h-11" onClick={() => onRenameRequest(photo)} aria-label="Rename photo"><Pencil aria-hidden="true" /><span className="sr-only">Rename photo</span></Button>}
            {onArchive && <Button type="button" variant="ghost" className="min-h-11 text-destructive hover:text-destructive" onClick={() => onArchive(photo)} aria-label="Archive photo"><Archive aria-hidden="true" /><span className="sr-only">Archive photo</span></Button>}
          </div>
        )}
      </div>
    </article>
  );
}

export function ClinicalPhotoGallery({
  patientId,
  actingBranchId,
  canWriteClinical,
  initialPhotos,
  loadFailed = false,
  onOpenUpload,
  onRefresh,
  resolveDerivativeUrl,
  onRename,
  onPair,
  onArchive,
}: ClinicalPhotoGalleryProps) {
  const [filter, setFilter] = useState<PhotoFilter>({ category: "ALL", date: "", procedure: "", tooth: "", photographer: "ALL" });
  const [preview, setPreview] = useState<ClinicalPhotoDisplay | null>(null);
  const [comparison, setComparison] = useState<{ before: ClinicalPhotoDisplay; after: ClinicalPhotoDisplay } | null>(null);
  const [pairingSource, setPairingSource] = useState<ClinicalPhotoDisplay | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<ClinicalPhotoDisplay | null>(null);
  const [archivePending, setArchivePending] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<ClinicalPhotoDisplay | null>(null);
  const [renameFilename, setRenameFilename] = useState("");
  const [renamePending, setRenamePending] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [pairingPending, setPairingPending] = useState(false);
  const [pairingError, setPairingError] = useState<string | null>(null);

  const photos = useMemo(() => initialPhotos.filter((photo) => photo.patientId === patientId).toSorted((a, b) => b.captureAt.localeCompare(a.captureAt)), [initialPhotos, patientId]);
  const [resolvedUrls, setResolvedUrls] = useState<Record<string, Partial<Record<ClinicalPhotoVariant, string>>>>({});
  const categoryChoices = useMemo(() => categoryOptions(photos), [photos]);
  const photographerChoices = useMemo(() => photographerOptions(photos), [photos]);
  const photosWithUrls = useMemo(() => photos.map((photo) => {
    const thumbnailUrl = photo.thumbnailUrl ?? resolvedUrls[photo.photoId]?.thumbnail;
    const previewUrl = photo.previewUrl ?? resolvedUrls[photo.photoId]?.preview;
    const displayUrl = photo.displayUrl ?? resolvedUrls[photo.photoId]?.display;
    return { ...photo, ...(thumbnailUrl ? { thumbnailUrl } : {}), ...(previewUrl ? { previewUrl } : {}), ...(displayUrl ? { displayUrl } : {}) };
  }), [photos, resolvedUrls]);
  const filteredPhotos = useMemo(() => photosWithUrls.filter((photo) => matchesFilter(photo, filter)), [filter, photosWithUrls]);

  useEffect(() => {
    if (!resolveDerivativeUrl) return;
    let cancelled = false;
    const pending = photosWithUrls.filter((photo) => photo.processingStatus === "READY" && !photo.thumbnailUrl);
    void Promise.all(pending.map(async (photo) => {
      try {
        const url = await resolveDerivativeUrl(photo, "thumbnail");
        if (!url || cancelled) return;
        setResolvedUrls((current) => ({ ...current, [photo.photoId]: { ...current[photo.photoId], thumbnail: url } }));
      } catch {
        // A missing/expired private URL is rendered as unavailable. The parent
        // may offer Refresh to mint a new authorized URL.
      }
    }));
    return () => { cancelled = true; };
  }, [photosWithUrls, resolveDerivativeUrl]);

  useEffect(() => {
    setPairingSource(null);
    setPreview(null);
    setComparison(null);
    setArchiveTarget(null);
    setRenameTarget(null);
    setPairingError(null);
    setArchiveError(null);
    setRenameError(null);
  }, [patientId, actingBranchId]);

  async function confirmArchive() {
    if (!archiveTarget || !onArchive) return;
    setArchivePending(true);
    setArchiveError(null);
    try {
      await onArchive(archiveTarget);
      setArchiveTarget(null);
    } catch {
      setArchiveError("The photograph could not be archived. Refresh and try again.");
    } finally {
      setArchivePending(false);
    }
  }

  function requestRename(photo: ClinicalPhotoDisplay) {
    setRenameError(null);
    setRenameFilename(photo.displayFilename);
    setRenameTarget(photo);
  }

  async function confirmRename() {
    if (!renameTarget || !onRename) return;
    const extension = renameTarget.displayFilename.split(".").pop()?.toLowerCase();
    const mimeType = extension === "jpg" || extension === "jpeg" ? "image/jpeg" : extension === "png" ? "image/png" : extension === "webp" ? "image/webp" : null;
    if (!mimeType) {
      setRenameError("This photograph has an unsupported display extension. Refresh the record and try again.");
      return;
    }
    let safeFilename: string;
    try {
      safeFilename = sanitizeDisplayFilename(renameFilename, mimeType);
    } catch {
      setRenameError("Use a safe filename with letters, numbers, spaces, hyphens, or underscores.");
      return;
    }
    setRenamePending(true);
    setRenameError(null);
    try {
      await onRename(renameTarget, safeFilename);
      setRenameTarget(null);
    } catch {
      setRenameError("The photograph could not be renamed. Refresh and try again.");
    } finally {
      setRenamePending(false);
    }
  }

  async function viewPhoto(photo: ClinicalPhotoDisplay) {
    setPreview(photo);
    if (!resolveDerivativeUrl || photo.processingStatus !== "READY" || photo.displayUrl || photo.previewUrl || photo.thumbnailUrl) return;
    try {
      const url = await resolveDerivativeUrl(photo, "display");
      if (url) {
        setResolvedUrls((current) => ({ ...current, [photo.photoId]: { ...current[photo.photoId], display: url } }));
        setPreview((current) => current?.photoId === photo.photoId ? { ...current, displayUrl: url } : current);
      }
    } catch {
      // Keep the preview open with a safe unavailable state.
    }
  }

  function comparePhoto(photo: ClinicalPhotoDisplay) {
    const pair = getPair(photo, photos);
    if (!pair) return;
    setPreview(null);
    setComparison(pair);
  }

  async function selectPair(photo: ClinicalPhotoDisplay) {
    if (!pairingSource || pairingSource.photoId === photo.photoId || !onPair) return;
    setPairingPending(true);
    setPairingError(null);
    try {
      await onPair(pairingSource, photo);
      setPairingSource(null);
    } catch {
      setPairingError("The photographs could not be paired. Refresh and try again.");
    } finally {
      setPairingPending(false);
    }
  }

  return (
    <section aria-labelledby="clinical-photos-heading" data-testid="clinical-photo-gallery" className="border-t py-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="clinical-photos-heading" className="text-base font-semibold">Clinical photographs</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Private before, progress, and diagnostic images attached to this patient record.</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {onRefresh && <Button type="button" variant="outline" className="min-h-11" onClick={onRefresh}><RefreshCw aria-hidden="true" />Refresh</Button>}
          {canWriteClinical && onOpenUpload && <Button type="button" className="min-h-11" onClick={onOpenUpload}><Plus aria-hidden="true" />Add clinical photograph</Button>}
        </div>
      </div>

      {!canWriteClinical && <p className="mt-3 text-xs text-muted-foreground">Read-only access</p>}
      {loadFailed ? <p className="mt-4 border-y py-3 text-sm text-destructive" role="alert">Clinical photographs could not be loaded. Refresh to try again.</p> : <>
        <div className="mt-4 grid gap-2 border-y py-3 sm:grid-cols-2 lg:grid-cols-5" aria-label="Clinical photograph filters">
          <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-muted-foreground">Category
            <span className="relative"><select aria-label="Filter by category" value={filter.category} onChange={(event) => setFilter((current) => ({ ...current, category: event.target.value as PhotoFilter["category"] }))} className="h-10 w-full appearance-none rounded-md border border-input bg-background px-3 pr-8 text-sm font-normal text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25"><option value="ALL">All categories</option>{categoryChoices.map((category) => <option key={category} value={category}>{categoryLabel(category)}</option>)}</select><ChevronDown className="pointer-events-none absolute right-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" /></span>
          </label>
          <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-muted-foreground">Date
            <Input aria-label="Filter by date" type="date" value={filter.date} onChange={(event) => setFilter((current) => ({ ...current, date: event.target.value }))} className="font-normal" />
          </label>
          <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-muted-foreground">Procedure
            <Input aria-label="Filter by procedure" placeholder="Any procedure" value={filter.procedure} onChange={(event) => setFilter((current) => ({ ...current, procedure: event.target.value }))} />
          </label>
          <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-muted-foreground">Tooth
            <Input aria-label="Filter by tooth" placeholder="FDI code" value={filter.tooth} onChange={(event) => setFilter((current) => ({ ...current, tooth: event.target.value }))} />
          </label>
          <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-muted-foreground">Photographer
            <span className="relative"><select aria-label="Filter by photographer" value={filter.photographer} onChange={(event) => setFilter((current) => ({ ...current, photographer: event.target.value }))} className="h-10 w-full appearance-none rounded-md border border-input bg-background px-3 pr-8 text-sm font-normal text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25"><option value="ALL">All photographers</option>{photographerChoices.map((name) => <option key={name} value={name}>{name}</option>)}</select><ChevronDown className="pointer-events-none absolute right-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" /></span>
          </label>
        </div>
        {pairingSource && <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border border-primary/30 bg-primary/5 px-3 py-2 text-sm" role="status"><span>Select the matching before/after photograph for <strong>{pairingSource.displayFilename}</strong>.</span><Button type="button" variant="ghost" className="min-h-11" onClick={() => setPairingSource(null)} disabled={pairingPending}><X aria-hidden="true" />Cancel pairing</Button></div>}
        {pairingError && <p role="alert" className="mt-2 text-sm text-destructive">{pairingError}</p>}
        <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted-foreground" aria-live="polite"><span>{filteredPhotos.length} of {photos.length} photograph{photos.length === 1 ? "" : "s"}</span>{filter.category !== "ALL" || filter.date || filter.procedure || filter.tooth || filter.photographer !== "ALL" ? <button type="button" className="min-h-11 px-1 font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30" onClick={() => setFilter({ category: "ALL", date: "", procedure: "", tooth: "", photographer: "ALL" })}>Clear filters</button> : null}</div>
        {photos.length === 0 ? <div className="mt-3 border-y py-10 text-center"><ImageIcon className="mx-auto size-8 text-muted-foreground/60" aria-hidden="true" /><p className="mt-2 text-sm font-medium">No clinical photographs recorded</p><p className="mt-1 text-xs text-muted-foreground">Add a dated photograph to keep the treatment record complete.</p></div> : filteredPhotos.length === 0 ? <p className="mt-3 border-y py-8 text-center text-sm text-muted-foreground">No photographs match the selected filters.</p> : <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{filteredPhotos.map((photo) => <PhotoCard key={photo.photoId} photo={photo} canWriteClinical={canWriteClinical} pairingSource={pairingSource} pairingPending={pairingPending} pairingEnabled={Boolean(onPair)} onView={viewPhoto} onPairStart={(source) => { setPairingError(null); setPairingSource(source); }} onPairSelect={selectPair} onRename={onRename ? requestRename : undefined} onArchive={onArchive ? (target) => { setArchiveError(null); setArchiveTarget(target); } : undefined} />)}</div>}
      </>}

      <Dialog open={Boolean(preview)} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-3xl">
          <DialogHeader><DialogTitle>Photo preview</DialogTitle><DialogDescription>Permission-checked private derivative for the clinical record.</DialogDescription></DialogHeader>
          {preview && <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_15rem]"><div className="overflow-hidden border bg-muted/30"><PhotoImage photo={preview} size="display" /></div><div className="min-w-0"><p className="break-words text-sm font-medium">{preview.displayFilename}</p><p className="mt-1 text-xs text-muted-foreground"><time dateTime={preview.captureAt}>{formatDateTime(preview.captureAt)}</time></p><p className="mt-3 text-xs text-muted-foreground">{categoryLabel(preview.category)}{preview.toothCodes.length ? ` · Tooth ${preview.toothCodes.join(", ")}` : ""}</p>{preview.note && <p className="mt-3 border-t pt-3 text-sm text-muted-foreground">{preview.note}</p>}</div></div>}
          <DialogFooter>{preview && getPair(preview, photos) && <Button type="button" variant="outline" className="min-h-11" onClick={() => comparePhoto(preview)}><GitCompareArrows aria-hidden="true" />Compare before and after</Button>}<Button type="button" variant="outline" className="min-h-11" onClick={() => setPreview(null)}>Close</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <BeforeAfterCompare open={Boolean(comparison)} before={comparison?.before ?? null} after={comparison?.after ?? null} onOpenChange={(open) => !open && setComparison(null)} />

      <Dialog open={Boolean(renameTarget)} onOpenChange={(open) => !open && !renamePending && setRenameTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Rename clinical photograph</DialogTitle><DialogDescription>Only the display metadata changes. The private storage object and original media remain unchanged.</DialogDescription></DialogHeader>
          <div className="grid gap-2"><label htmlFor="clinical-photo-rename" className="text-sm font-medium">Display filename</label><Input id="clinical-photo-rename" aria-label="Display filename" value={renameFilename} onChange={(event) => setRenameFilename(event.target.value)} maxLength={255} /><p className="text-xs text-muted-foreground">The real image extension is preserved automatically.</p></div>
          {renameError && <p role="alert" className="text-sm text-destructive">{renameError}</p>}
          <DialogFooter><Button type="button" variant="outline" className="min-h-11" onClick={() => setRenameTarget(null)} disabled={renamePending}>Cancel</Button><Button type="button" className="min-h-11" onClick={() => void confirmRename()} disabled={renamePending || !renameFilename}>{renamePending && <LoaderCircle className="animate-spin" aria-hidden="true" />}Save filename</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(archiveTarget)} onOpenChange={(open) => !open && !archivePending && setArchiveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Archive clinical photograph?</AlertDialogTitle><AlertDialogDescription>Archiving removes this image from the active gallery. The original media is retained for the clinical record and the action is attributed in the audit history.</AlertDialogDescription></AlertDialogHeader>
          {archiveError && <p role="alert" className="text-sm text-destructive">{archiveError}</p>}
          <AlertDialogFooter><AlertDialogCancel disabled={archivePending}>Cancel</AlertDialogCancel><AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90" onClick={(event) => { event.preventDefault(); void confirmArchive(); }} disabled={archivePending}>{archivePending && <LoaderCircle className="animate-spin" aria-hidden="true" />}Archive photo</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
