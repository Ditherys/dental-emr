"use client";

import * as React from "react";

import {
  getPlanChart,
  getStatusChart,
  importStatus,
  OdontogramChartSurface,
  OdontogramProvider,
  onStateChange,
  setPlanChart,
  setToothAnatomy,
  ToothControlsSurface,
  ToothInfoSurface,
} from "react-advanced-odontogram";

import {
  buildForkPayload,
  buildForkRelationshipBaselines,
  forkClinicalDraftKey,
  forkPayloadToClinicalDraft,
  type ForkClinicalDraft,
  type ForkRelationshipBaseline,
} from "@/lib/odontogram/fork-adapter";
import type { PatientOdontogramDTO } from "@/lib/odontogram/types";
import "./styles.css";

export type ForkOdontogramProps = {
  patientKey: string;
  dto: PatientOdontogramDTO;
  canWriteClinical: boolean;
  onSelect: (fdi: number) => void;
  onDraftChange: (drafts: readonly ForkClinicalDraft[]) => void;
  onError: (message: string) => void;
};

type RuntimeBridgeProps = {
  status: Record<string, unknown>;
  plan: Record<string, unknown> | null;
  relationshipBaselines: readonly ForkRelationshipBaseline[];
  onDraftChange: ForkOdontogramProps["onDraftChange"];
  onError: ForkOdontogramProps["onError"];
};

const FIXED_FDI_TEETH = new Set([
  18, 17, 16, 15, 14, 13, 12, 11,
  21, 22, 23, 24, 25, 26, 27, 28,
  48, 47, 46, 45, 44, 43, 42, 41,
  31, 32, 33, 34, 35, 36, 37, 38,
]);

function RuntimeBridge({ status, plan, relationshipBaselines, onDraftChange, onError }: RuntimeBridgeProps) {
  const baselineKeys = React.useRef<ReadonlySet<string>>(new Set());

  React.useLayoutEffect(() => {
    // Child layout effects run before the provider's passive initialization.
    // Fix the anatomy profile before the engine chooses and caches SVG assets.
    setToothAnatomy("measured");
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    let readinessTimer: number | undefined;
    let readinessObserver: MutationObserver | undefined;

    const attachChangeListener = () => {
      if (cancelled || unsubscribe) return;
      readinessTimer = window.setTimeout(() => {
        if (cancelled || unsubscribe) return;
        unsubscribe = onStateChange(() => {
          if (cancelled) return;
          try {
            const drafts = forkPayloadToClinicalDraft(
              { status: getStatusChart(), plan: getPlanChart() },
              { relationshipBaselines },
            );
            onDraftChange(drafts.filter((draft) => !baselineKeys.current.has(forkClinicalDraftKey(draft))));
          } catch {
            onError("The chart change could not be prepared. Refresh the odontogram and try again.");
          }
        });
      }, 0);
    };

    const attachWhenGridIsReady = () => {
      const grid = document.getElementById("toothGrid");
      if (grid?.querySelector("svg")) {
        readinessObserver?.disconnect();
        attachChangeListener();
        return true;
      }
      return false;
    };

    try {
      baselineKeys.current = new Set(
        forkPayloadToClinicalDraft({ status, plan }, { relationshipBaselines }).map(forkClinicalDraftKey),
      );
      // Hydrate before subscribing. importStatus intentionally emits a state
      // notification; attaching only after the initialized SVG grid is present
      // keeps both that notification and the provider's init notification from
      // entering the dentist-edit flow.
      importStatus(status);
      if (plan !== null) setPlanChart(plan);

      if (!attachWhenGridIsReady()) {
        const grid = document.getElementById("toothGrid");
        if (!grid) throw new Error("Missing odontogram grid");
        readinessObserver = new MutationObserver(() => { attachWhenGridIsReady(); });
        readinessObserver.observe(grid, { childList: true, subtree: true });
      }
    } catch {
      onError("The odontogram could not be initialized. Refresh to try again.");
    }

    return () => {
      cancelled = true;
      if (readinessTimer !== undefined) window.clearTimeout(readinessTimer);
      readinessObserver?.disconnect();
      unsubscribe?.();
    };
  }, [onDraftChange, onError, plan, relationshipBaselines, status]);

  return null;
}

function selectedFdiFromEvent(target: EventTarget | null): number | null {
  if (!(target instanceof Element)) return null;
  const tile = target.closest<HTMLElement>("[data-tooth]");
  if (!tile) return null;
  const fdi = Number(tile.dataset.tooth);
  return FIXED_FDI_TEETH.has(fdi) ? fdi : null;
}

export function ForkOdontogram({
  patientKey,
  dto,
  canWriteClinical,
  onSelect,
  onDraftChange,
  onError,
}: ForkOdontogramProps): React.ReactElement {
  const payload = React.useMemo(() => buildForkPayload(dto), [dto]);
  const relationshipBaselines = React.useMemo(() => buildForkRelationshipBaselines(dto), [dto]);

  const handleChartSelection = React.useCallback((event: React.SyntheticEvent) => {
    const fdi = selectedFdiFromEvent(event.target);
    if (fdi !== null) onSelect(fdi);
  }, [onSelect]);

  return (
    <div
      className="dental-emr-fork"
      data-testid="fork-odontogram"
      onClickCapture={handleChartSelection}
      onKeyUpCapture={handleChartSelection}
    >
      <OdontogramProvider
        key={patientKey}
        language="en"
        numberingSystem="FDI"
        readOnly={!canWriteClinical}
        enableNotes
        enableIcdas
        rootCariesMode="severity"
        radiographicDepthMode="detailed"
        cariesDepthEnabled
        surfaceNotation="full"
        showStatusCard
        showOrthoCard
      >
        <RuntimeBridge
          status={payload.status}
          plan={payload.plan}
          relationshipBaselines={relationshipBaselines}
          onDraftChange={onDraftChange}
          onError={onError}
        />
        <div className="dental-emr-fork-layout">
          <main className="dental-emr-fork-chart-column">
            <OdontogramChartSurface />
            <ToothInfoSurface />
          </main>
          <aside className="panel dental-emr-fork-controls" aria-label="Odontogram controls">
            <ToothControlsSurface />
          </aside>
        </div>
      </OdontogramProvider>
    </div>
  );
}
