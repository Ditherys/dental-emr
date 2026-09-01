"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

/**
 * The clinical context a photograph is being attached from.
 *
 * It carries only what the clinician already selected on the chart. There is no
 * organization, no branch, no provider and no patient identity here: the photo
 * server action re-derives every one of those from the signed-in actor, and a
 * value travelling through the browser is never authorization.
 */
export type ClinicalPhotoAttachmentContext = {
  /** FDI codes selected on the chart when the composer opened. */
  toothCodes: readonly string[];
  /** The clinical date the composer is working at, not the server's clock. */
  clinicalDate: string;
  /** An explicitly chosen procedure case, or null for an unattached image. */
  procedureCaseId: string | null;
};

export type ClinicalPhotoAttachment = (context: ClinicalPhotoAttachmentContext) => void;

const AttachmentContext = React.createContext<ClinicalPhotoAttachment | null>(null);

/**
 * Published by whichever surface owns the photo upload flow. The chart composer
 * is several layers below it, and threading a callback through every one of
 * them would make each layer look like it had a say in clinical media. It does
 * not: this is one workflow handing the composer a door, exactly as the chart
 * view context hands the renderer its display state.
 */
export function ClinicalPhotoAttachmentProvider({
  attach,
  children,
}: {
  /** Null where the signed-in actor may not record a clinical photograph. */
  attach: ClinicalPhotoAttachment | null;
  children: React.ReactNode;
}): React.ReactElement {
  return <AttachmentContext.Provider value={attach}>{children}</AttachmentContext.Provider>;
}

/**
 * Null when no photo workflow is mounted above the caller — a print preview or
 * a focused test. Callers must treat that as "this surface cannot attach a
 * photograph" and say so, never as permission to write one another way.
 */
export function useClinicalPhotoAttachment(): ClinicalPhotoAttachment | null {
  return React.useContext(AttachmentContext);
}

/**
 * The private clinical gallery, opened from the chart toolbar.
 *
 * Photographs are the most sensitive thing on this screen, so they live behind
 * a deliberate action rather than underneath every charting session: the panel
 * is unmounted while closed, which means no private derivative URL is minted
 * and no clinical image sits in the document until someone asks for it. A
 * failed load reports itself here, where the clinician went looking, instead of
 * silently showing an empty gallery.
 */
export function ClinicalGallerySheet({
  open,
  onOpenChange,
  children,
  loadFailed = false,
  onRetry,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  loadFailed?: boolean;
  onRetry?: () => void;
}): React.ReactElement {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="w-full gap-0 overflow-y-auto sm:max-w-4xl"
      >
        {/* The gallery supplies the visible heading; repeating it here would
            give the panel two titles for the same thing. */}
        <SheetHeader className="sr-only">
          <SheetTitle>Clinical photographs</SheetTitle>
          <SheetDescription>
            Private, permission-checked images attached to this patient record.
          </SheetDescription>
        </SheetHeader>

        <div className="flex items-center justify-end border-b px-4 py-2">
          <Button type="button" variant="ghost" className="min-h-11" onClick={() => onOpenChange(false)}>
            Close photographs
          </Button>
        </div>

        <div data-testid="clinical-photo-region" className="min-w-0 px-4 pb-6">
          {loadFailed ? (
            <div
              role="alert"
              className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-destructive/40 px-3 py-3 text-sm text-destructive"
            >
              <span className="min-w-0 break-words">
                The clinical photographs could not be loaded. Retry to load them.
              </span>
              {onRetry && (
                <Button type="button" variant="outline" size="sm" className="min-h-11 shrink-0" onClick={onRetry}>
                  Retry
                </Button>
              )}
            </div>
          ) : (
            children
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
