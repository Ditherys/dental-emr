"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";

import {
  ClinicalChartToolbar,
  ClinicalChartViewProvider,
  DEFAULT_CLINICAL_CHART_VIEW,
  type ClinicalChartInterchange,
  type ClinicalChartView,
} from "@/components/odontogram/clinical-chart-toolbar";
import { Button } from "@/components/ui/button";
import type { ClinicalChartMode } from "@/lib/clinical/types";

import { ClinicalGallerySheet } from "./clinical-gallery-sheet";

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
  patientId,
  visitHeader,
  medicalSafety,
  chart,
  record,
  gallery,
  interchange,
  chartLoadFailed = false,
  recordLoadFailed = false,
  galleryLoadFailed = false,
  onRetry,
  defaultMode = "CURRENT_STATUS",
}: {
  /** Route patient. Every scrap of chart view state is scoped to it. */
  patientId: string;
  visitHeader: ReactNode;
  medicalSafety: ReactNode;
  chart: Record<ClinicalChartMode, ReactNode>;
  record: ReactNode;
  gallery?: ReactNode;
  /** Import and export context. Omitted where the caller has no authorized
   *  patient and branch to act in. */
  interchange?: ClinicalChartInterchange;
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
  const [galleryOpen, setGalleryOpen] = useState(false);

  // The chart view is patient-scoped clinical context, not a durable
  // preference. A tooth selected on one patient must never survive into
  // another patient's chart, and the reset must not depend on which chart mode
  // happens to be mounted — the modes come and go, this owner does not. The
  // adjustment runs during render rather than in an effect so no frame can ever
  // paint the previous patient's selection against the new patient.
  const [viewPatientId, setViewPatientId] = useState(patientId);
  if (viewPatientId !== patientId) {
    setViewPatientId(patientId);
    setView(DEFAULT_CLINICAL_CHART_VIEW);
    // An open photograph panel must never survive into another patient's chart.
    setGalleryOpen(false);
  }

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
        onOpenGallery={hasGallery ? () => setGalleryOpen(true) : undefined}
        interchange={interchange}
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
        <ClinicalGallerySheet
          open={galleryOpen}
          onOpenChange={setGalleryOpen}
          loadFailed={galleryLoadFailed}
          onRetry={onRetry}
        >
          {gallery}
        </ClinicalGallerySheet>
      )}
    </section>
  );
}
