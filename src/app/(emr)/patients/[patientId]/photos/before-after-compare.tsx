"use client";
/* eslint-disable @next/next/no-img-element -- private derivative URLs come from the provider-neutral media adapter. */

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { ClinicalPhotoDisplay } from "./clinical-photo-gallery";

export type BeforeAfterCompareProps = {
  open: boolean;
  before: ClinicalPhotoDisplay | null;
  after: ClinicalPhotoDisplay | null;
  onOpenChange?: (open: boolean) => void;
};

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "Unknown date";
  return new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function imageSource(photo: ClinicalPhotoDisplay) {
  return photo.displayUrl ?? photo.previewUrl ?? photo.thumbnailUrl ?? null;
}

function CompareImage({ photo, label }: { photo: ClinicalPhotoDisplay; label: "Before" | "After" }) {
  const src = imageSource(photo);
  return <div className="min-w-0 overflow-hidden border bg-muted/30"><div className="border-b bg-background px-3 py-2"><p className="text-sm font-medium">{label}</p><p className="truncate text-xs text-muted-foreground" title={photo.displayFilename}>{photo.displayFilename}</p><time dateTime={photo.captureAt} className="text-xs text-muted-foreground">{formatDate(photo.captureAt)}</time></div>{src ? <img src={src} alt={`${label} photo: ${photo.displayFilename}`} className="aspect-[4/3] w-full object-contain" /> : <div className="flex aspect-[4/3] items-center justify-center px-4 text-center text-xs text-muted-foreground" role="img" aria-label={`${label} photo preview unavailable`}>Preview unavailable</div>}</div>;
}

export function BeforeAfterCompare({ open, before, after, onOpenChange }: BeforeAfterCompareProps) {
  const [mode, setMode] = useState<"split" | "overlay">("split");
  const [position, setPosition] = useState(50);

  return (
    <Dialog open={open && Boolean(before && after)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Before and after comparison</DialogTitle>
          <DialogDescription>Compare dated clinical photographs using private display derivatives.</DialogDescription>
        </DialogHeader>
        {before && after && (
          <>
            <div className="flex flex-wrap gap-1 border-b pb-2" role="group" aria-label="Comparison view">
              <Button type="button" variant={mode === "split" ? "secondary" : "ghost"} className="min-h-11" aria-pressed={mode === "split"} onClick={() => setMode("split")}>Side by side</Button>
              <Button type="button" variant={mode === "overlay" ? "secondary" : "ghost"} className="min-h-11" aria-pressed={mode === "overlay"} onClick={() => setMode("overlay")}>Overlay</Button>
            </div>
            {mode === "split" ? (
              <div className="grid gap-3 md:grid-cols-2">
                <CompareImage photo={before} label="Before" />
                <CompareImage photo={after} label="After" />
              </div>
            ) : (
              <div className="grid gap-3">
                <label className="grid gap-1 text-sm font-medium" htmlFor="comparison-position">
                  Comparison position
                  <input id="comparison-position" aria-label="Comparison position" type="range" min="0" max="100" value={position} onChange={(event) => setPosition(Number(event.target.value))} className="min-h-11 w-full accent-primary" />
                </label>
                <div className="relative aspect-[4/3] overflow-hidden border bg-muted/30">
                  {imageSource(after) ? <img src={imageSource(after)!} alt={`After photo: ${after.displayFilename}`} className="absolute inset-0 size-full object-contain" /> : <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">After preview unavailable</div>}
                  {imageSource(before) ? <div className="absolute inset-y-0 left-0 overflow-hidden border-r-2 border-white/90 bg-muted/30" style={{ width: `${position}%` }}><img src={imageSource(before)!} alt={`Before photo: ${before.displayFilename}`} className="h-full max-w-none object-contain" /></div> : null}
                  <div className="pointer-events-none absolute inset-x-0 top-2 flex justify-between px-2 text-xs font-semibold text-white drop-shadow"><span>Before</span><span>After</span></div>
                </div>
              </div>
            )}
          </>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" className="min-h-11" onClick={() => onOpenChange?.(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
