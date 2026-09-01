/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { CurrentStatusPanel, type ProcedureCaseChoice } from "@/components/odontogram/current-status-panel";
import { ForkOdontogram } from "@/components/odontogram/fork-odontogram";
import { ForkPrintChart } from "@/components/odontogram/fork-print-chart";
import { ProcedureFollowupDialog, type ProcedureFollowupInput } from "@/components/odontogram/procedure-followup-dialog";
import { ProgressRecordTable } from "@/components/odontogram/progress-record-table";
import { ToothRecordDrawer } from "@/components/odontogram/tooth-record-drawer";
import { useClinicalChartView } from "@/components/odontogram/clinical-chart-toolbar";
import type { ForkClinicalDraft } from "@/lib/odontogram/fork-adapter";
import type { ToothProposalMarker } from "@/components/odontogram/measured-tooth";
import type { PlanAuthoringContext } from "@/components/odontogram/planned-treatment-form";
import type { ClinicalChartMode } from "@/lib/clinical/types";
import type { ClinicalComposerContext } from "@/lib/odontogram/composer-context";
import type { PatientOdontogramDTO } from "@/lib/odontogram/types";

import { progressEventsFromOdontogram, type ProgressEventDTO } from "@/lib/odontogram/progress-record";
import { getPatientOdontogramAction } from "./odontogram-actions";

/**
 * The projection-only renderer never emits fork drafts. The prop stays until
 * Task 17 removes the wrapper; a stable no-op keeps it from allocating a new
 * closure on every render.
 */
const NO_FORK_DRAFTS: (drafts: readonly ForkClinicalDraft[]) => void = () => {};

type Props = {
  patientId: string;
  actingBranchId: string;
  canWriteClinical: boolean;
  printPatientName?: string;
  printBranchName?: string;
  printProviderName?: string;
  /** @deprecated O13 read cutover — use initialOdontogram (get_patient_odontogram DTO). */
  initialConditions?: unknown;
  initialOdontogram?: PatientOdontogramDTO | null;
  /** Authorized server projection the record drawer hands to the composer. */
  composerContext?: ClinicalComposerContext | null;
  /** Which chart mode mounted this section; the drawer opens accordingly. */
  chartMode?: ClinicalChartMode;
  /** The plan a Treatment plan proposal is authored into, when there is one. */
  planContext?: PlanAuthoringContext | null;
  /** Proposed treatment per tooth. Absent in every mode but Treatment plan. */
  proposals?: ReadonlyMap<number, ToothProposalMarker>;
  initialProgressEvents?: { patientId: string; events: ProgressEventDTO[] };
  procedureCases?: readonly ProcedureCaseChoice[];
  recordFollowup?: (input: ProcedureFollowupInput) => Promise<{ ok: boolean }>;
  /** False when the Clinical chart workspace owns the chronological record region. */
  renderProgressRecord?: boolean;
  loadFailed?: boolean;
};

export function OdontogramSection({
  patientId,
  actingBranchId,
  canWriteClinical,
  printPatientName,
  printBranchName,
  printProviderName,
  initialOdontogram,
  composerContext = null,
  chartMode = "CURRENT_STATUS",
  planContext = null,
  proposals,
  initialProgressEvents,
  procedureCases: suppliedProcedureCases,
  recordFollowup,
  renderProgressRecord = true,
  loadFailed,
}: Props): React.ReactElement {
  const hasMismatchedInitialDto = Boolean(initialOdontogram && initialOdontogram.patientId !== patientId);
  const initialDto = initialOdontogram?.patientId === patientId ? initialOdontogram : null;
  const [dtoSnapshot, setDtoSnapshot] = React.useState(() => ({ patientId, dto: initialDto }));
  const isCurrentPatientSnapshot = dtoSnapshot.patientId === patientId && !hasMismatchedInitialDto;
  const dto = isCurrentPatientSnapshot ? dtoSnapshot.dto : null;
  const [loading, setLoading] = React.useState(() => !initialDto && !loadFailed);
  const [error, setError] = React.useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [followupOpen, setFollowupOpen] = React.useState(false);

  // One selection owner. The chart publishes selection into the workspace chart
  // view; this section reads the tooth the inspector should show from that same
  // state, so closing the inspector, switching chart mode, or reopening it can
  // never leave the chart painted as selected while the section believes
  // nothing is.
  const view = useClinicalChartView();
  const { managed, setView, selectedFdi: viewSelection } = view;
  const selectedFdi = viewSelection.at(-1) ?? null;

  // Render only state whose owner matches the route parameter. Effects clear
  // the old state afterwards, but this synchronous gate prevents a one-frame
  // cross-patient clinical disclosure during a deferred fetch.
  const selectedFdiForCurrentPatient = isCurrentPatientSnapshot ? selectedFdi : null;
  const suppliedProgressEvents = initialProgressEvents?.patientId === patientId && Array.isArray(initialProgressEvents.events)
    ? initialProgressEvents.events
    : null;

  // Transient local state is keyed by patientId. It also runs when the chart
  // mode remounts this section, which is harmless for overlay state.
  React.useEffect(() => {
    setDrawerOpen(false);
    setError(null);
    setFollowupOpen(false);
  }, [patientId]);

  // The cross-patient selection reset belongs to `ClinicalChartWorkspace`, the
  // one owner of the chart view. It resets during render, before any mode is
  // mounted, so it fires in every chart mode rather than only the one this
  // section happens to occupy. This section deliberately keeps no second copy.

  const handleSelect = React.useCallback(
    (fdi: number) => {
      const active = document.activeElement as HTMLElement | null;
      if (active?.matches?.("[data-fdi]")) lastFocusedRef.current = active;
      // A managed chart already published the full selection, including a
      // multi-tooth one, before it reported the last tooth. Only an unmanaged
      // chart — a compatibility mount with no workspace above it — needs this
      // section to record the selection on its behalf.
      if (!managed) setView({ selectedFdi: [fdi] });
      // Selecting a tooth opens the temporary record drawer. It is a bounded
      // side panel rather than the removed permanent inspector column, so the
      // chart keeps the whole workspace row when nothing is selected.
      setDrawerOpen(true);
    },
    [managed, setView],
  );

  const refetch = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getPatientOdontogramAction({ actingBranchId, patientId });
      if (!result.ok) {
        setError(result.code === "NOT_AUTHORIZED" ? "Your access or selected branch changed. Refresh the chart and try again." : "The odontogram could not be loaded. Refresh to try again.");
        return;
      }
      if (result.odontogram.patientId !== patientId) {
        setDtoSnapshot({ patientId, dto: null });
        setError("The odontogram could not be loaded. Refresh to try again.");
        return;
      }
      setDtoSnapshot({ patientId, dto: result.odontogram });
    } catch {
      setError("The odontogram could not be loaded. Refresh to try again.");
    } finally {
      setLoading(false);
    }
  }, [actingBranchId, patientId]);

  React.useEffect(() => {
    if (hasMismatchedInitialDto) {
      setDtoSnapshot({ patientId, dto: null });
      setError("The odontogram could not be loaded. Refresh to try again.");
      setLoading(false);
      return;
    }
    if (initialDto) {
      setDtoSnapshot({ patientId, dto: initialDto });
      setLoading(false);
      return;
    }
    setDtoSnapshot({ patientId, dto: null });
    if (loadFailed) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void refetch();
  }, [hasMismatchedInitialDto, initialDto, loadFailed, patientId, refetch]);

  const progressEvents = React.useMemo(
    () => isCurrentPatientSnapshot ? (suppliedProgressEvents ?? (dto ? progressEventsFromOdontogram(dto) : [])) : [],
    [dto, isCurrentPatientSnapshot, suppliedProgressEvents],
  );
  const procedureCases = React.useMemo<ProcedureCaseChoice[]>(() => {
    if (suppliedProcedureCases) return [...suppliedProcedureCases];
    const seen = new Set<string>();
    return progressEvents.flatMap((event) => {
      if (!event.procedureCaseId || seen.has(event.procedureCaseId)) return [];
      seen.add(event.procedureCaseId);
      return [{ procedureCaseId: event.procedureCaseId, display: event.procedureDisplay ?? "Procedure case" }];
    });
  }, [progressEvents, suppliedProcedureCases]);
  const followupAvailable = canWriteClinical && procedureCases.length > 0 && Boolean(recordFollowup);

  const lastFocusedRef = React.useRef<HTMLElement | null>(null);

  // Closing an overlay closes the overlay only. The tooth stays selected, so
  // the chart, the toolbar summary and the reopen affordances continue to agree
  // and the clinical write path can be reopened without re-selecting.
  const returnFocusToChart = React.useCallback(() => {
    const el = lastFocusedRef.current ?? document.querySelector<HTMLElement>(`[data-fdi="${selectedFdi}"]`);
    // Defer to next frame so sheet/dialog unmount does not steal focus.
    requestAnimationFrame(() => {
      if (el && document.contains(el)) el.focus();
      else {
        const first = document.querySelector<HTMLElement>("[data-fdi]");
        first?.focus();
      }
    });
  }, [selectedFdi]);

  if (loadFailed && !dto) {
    return (
      <div key={patientId} data-testid="odontogram-section">
        <p role="alert" className="border-y py-3 text-sm text-destructive">The odontogram could not be loaded. Refresh to try again.</p>
      </div>
    );
  }

  return (
    <div key={patientId} data-testid="odontogram-section" className="@container flex max-w-full min-w-0 flex-col gap-3">
      {error && (
        <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {!isCurrentPatientSnapshot || loading || !dto ? (
        <div className="rounded-md border p-6 text-sm text-muted-foreground">Loading odontogram…</div>
      ) : (
        // The chart owns the whole workspace row. Nothing clips or scrolls it,
        // so a squeezed composition would be visible rather than masked.
        <div className="flex w-full min-w-0 flex-col gap-3">
          <ForkOdontogram
            patientKey={patientId}
            dto={dto}
            canWriteClinical={canWriteClinical}
            proposals={proposals}
            onSelect={handleSelect}
            onDraftChange={NO_FORK_DRAFTS}
            onError={setError}
          />
          <ForkPrintChart
            dto={dto}
            patientName={printPatientName}
            branchName={printBranchName}
            providerName={printProviderName}
            progressEvents={progressEvents}
            renderChart={false}
          />
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground print:hidden">
        <span>{canWriteClinical ? "Select a tooth to open its record drawer and add a clinical record." : "Read-only access. Selection shows the current clinical record."}</span>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" className="min-h-11 text-xs" disabled={!selectedFdiForCurrentPatient} onClick={() => setDrawerOpen(true)}>
            Open tooth record
          </Button>
        </div>
      </div>

      <CurrentStatusPanel
        selectedTooth={selectedFdiForCurrentPatient}
        canWriteClinical={canWriteClinical}
        procedureCases={procedureCases}
        followupAvailable={followupAvailable}
        onRecordDirectTreatment={() => setDrawerOpen(true)}
        onOpenFollowup={() => setFollowupOpen(true)}
      />

      {renderProgressRecord && <ProgressRecordTable events={progressEvents} />}

      <ToothRecordDrawer
        open={drawerOpen && selectedFdiForCurrentPatient !== null}
        onOpenChange={(open) => {
          setDrawerOpen(open);
          if (!open) returnFocusToChart();
        }}
        patientId={patientId}
        branchId={actingBranchId}
        selectedFdi={isCurrentPatientSnapshot ? viewSelection : []}
        notation={view.notation}
        dto={dto}
        canWriteClinical={canWriteClinical}
        composerContext={composerContext}
        chartMode={chartMode}
        planContext={planContext}
        onRecorded={refetch}
      />

      {recordFollowup && (
        <ProcedureFollowupDialog
          open={followupOpen}
          onOpenChange={setFollowupOpen}
          procedureCases={procedureCases}
          onRecord={recordFollowup}
        />
      )}
    </div>
  );
}
