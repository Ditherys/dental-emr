"use client";

import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import type { ClinicalChartMode } from "@/lib/clinical/types";
import { cn } from "@/lib/utils";

const CHART_MODES: ReadonlyArray<{ value: ClinicalChartMode; label: string }> = [
  { value: "CURRENT_STATUS", label: "Current status" },
  { value: "TREATMENT_PLAN", label: "Treatment plan" },
  { value: "PERIODONTAL", label: "Periodontal" },
];

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

  return (
    <section aria-labelledby="clinical-chart-heading" className="flex w-full min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 id="clinical-chart-heading" className="text-base font-semibold tracking-[-0.01em] text-foreground">
          Clinical chart
        </h2>
        {visitHeader}
      </div>

      {medicalSafety}

      <div role="group" aria-label="Chart mode" className="flex flex-wrap gap-1 border-b text-sm font-medium">
        {CHART_MODES.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            aria-pressed={mode === value}
            onClick={() => setMode(value)}
            className={cn(
              "min-h-11 shrink-0 rounded-t border-b-2 px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
              mode === value
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div data-testid="clinical-chart-surface" className="w-full min-w-0">
        {chartLoadFailed ? (
          <RegionFailure
            message="The dental chart could not be loaded. Retry to load the current record."
            onRetry={onRetry}
          />
        ) : (
          chart[mode]
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

      {(gallery !== undefined || galleryLoadFailed) && (
        <div data-testid="clinical-photo-region" className="w-full min-w-0">
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
