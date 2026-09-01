"use client";

import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";

import {
  ClinicalChartToolbar,
  ClinicalChartViewProvider,
  DEFAULT_CLINICAL_CHART_VIEW,
  type ClinicalChartView,
} from "@/components/odontogram/clinical-chart-toolbar";
import { Button } from "@/components/ui/button";
import type { ClinicalChartMode } from "@/lib/clinical/types";

function RegionFailure({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-destructive/40 px-3 py-3 text-sm text-destructive"
    >
      <span className="min-w-0 break-words">{message}</span>
      {onRetry && (
        <Button type="button" variant="outline" size="sm" className="min-h-11 shrink-0" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}

/**
 * The one Clinical chart work surface. It owns the workspace landmark, the visit
 * row, the always-visible medical-safety strip, the three chart modes, the
 * full-width chart breakout, and the chronological record. Each region degrades
 * to a bounded retry rather than to stale content.
 */
export function ClinicalChartWorkspace({
  visitHeader,
  medicalSafety,
  chart,
  record,
  gallery,
  chartLoadFailed = false,
  recordLoadFailed = false,
  galleryLoadFailed = false,
  onRetry,
  defaultMode = "CURRENT_STATUS",
}: {
  visitHeader: ReactNode;
  medicalSafety: ReactNode;
  chart: Record<ClinicalChartMode, ReactNode>;
  record: ReactNode;
  gallery?: ReactNode;
  chartLoadFailed?: boolean;
  recordLoadFailed?: boolean;
  galleryLoadFailed?: boolean;
  onRetry?: () => void;
  defaultMode?: ClinicalChartMode;
}) {
  const [mode, setMode] = useState<ClinicalChartMode>(defaultMode);
  // The chart view belongs to the workspace, not to any one chart mode, so it
  // survives a mode change and a responsive reflow.
  const [view, setView] = useState<ClinicalChartView>(DEFAULT_CLINICAL_CHART_VIEW);
  const galleryRef = useRef<HTMLDivElement | null>(null);

  const updateView = useCallback(
    (next: Partial<ClinicalChartView>) => setView((current) => ({ ...current, ...next })),
    [],
  );
  const chartView = useMemo(() => ({ ...view, setView: updateView }), [updateView, view]);
  const hasGallery = gallery !== undefined || galleryLoadFailed;

  return (
    <section aria-labelledby="clinical-chart-heading" className="flex w-full min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 id="clinical-chart-heading" className="text-base font-semibold tracking-[-0.01em] text-foreground">
          Clinical chart
        </h2>
        {visitHeader}
      </div>

      {medicalSafety}

      <ClinicalChartToolbar
        mode={mode}
        onModeChange={setMode}
        view={view}
        onViewChange={updateView}
        onPrint={() => window.print()}
        onOpenGallery={
          hasGallery
            ? () => galleryRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" })
            : undefined
        }
      />

      <div data-testid="clinical-chart-surface" className="w-full min-w-0">
        {chartLoadFailed ? (
          <RegionFailure
            message="The dental chart could not be loaded. Retry to load the current record."
            onRetry={onRetry}
          />
        ) : (
          <ClinicalChartViewProvider value={chartView}>{chart[mode]}</ClinicalChartViewProvider>
        )}
      </div>

      <div data-testid="clinical-progress-record" className="w-full min-w-0">
        {recordLoadFailed ? (
          <RegionFailure
            message="The progress record could not be loaded. Retry to load the current record."
            onRetry={onRetry}
          />
        ) : (
          record
        )}
      </div>

      {hasGallery && (
        <div ref={galleryRef} data-testid="clinical-photo-region" className="w-full min-w-0">
          {galleryLoadFailed ? (
            <RegionFailure
              message="The clinical photographs could not be loaded. Retry to load them."
              onRetry={onRetry}
            />
          ) : (
            gallery
          )}
        </div>
      )}
    </section>
  );
}
