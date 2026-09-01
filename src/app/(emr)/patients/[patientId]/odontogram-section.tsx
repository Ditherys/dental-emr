/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { CurrentStatusPanel, type ProcedureCaseChoice } from "@/components/odontogram/current-status-panel";
import { ForkOdontogram } from "@/components/odontogram/fork-odontogram";
import { ForkSaveController } from "@/components/odontogram/fork-save-controller";
import { PerioWorkspace, type PerioMeasurement, type PerioToothState } from "@/components/odontogram/perio-workspace";
import { ForkPrintChart } from "@/components/odontogram/fork-print-chart";
import { ProcedureFollowupDialog, type ProcedureFollowupInput } from "@/components/odontogram/procedure-followup-dialog";
import { ProgressRecordTable } from "@/components/odontogram/progress-record-table";
import { ToothInspector } from "@/components/odontogram/tooth-inspector";
import type { ForkClinicalDraft } from "@/lib/odontogram/fork-adapter";
import type { PatientOdontogramDTO } from "@/lib/odontogram/types";
import { progressEventsFromOdontogram, type ProgressEventDTO } from "@/lib/odontogram/progress-record";
import { getPatientOdontogramAction } from "./odontogram-actions";
import {
  amendPeriodontalExaminationAction,
  finalizePeriodontalExaminationAction,
  savePeriodontalMeasurementsAction,
} from "./perio-actions";

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
  const [selectedFdi, setSelectedFdi] = React.useState<number | null>(null);
  const [forkDrafts, setForkDrafts] = React.useState<readonly ForkClinicalDraft[]>([]);
  const [perioOpen, setPerioOpen] = React.useState(false);
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [followupOpen, setFollowupOpen] = React.useState(false);
  const [directTreatmentRequested, setDirectTreatmentRequested] = React.useState(false);
  // Render only state whose owner matches the route parameter. Effects clear
  // the old state afterwards, but this synchronous gate prevents a one-frame
  // cross-patient clinical disclosure during a deferred fetch.
  const selectedFdiForCurrentPatient = isCurrentPatientSnapshot ? selectedFdi : null;
  const suppliedProgressEvents = initialProgressEvents?.patientId === patientId && Array.isArray(initialProgressEvents.events)
    ? initialProgressEvents.events
    : null;

  // Transient state is keyed by patientId — clear selection on patient change.
  React.useEffect(() => {
    setSelectedFdi(null);
    setSheetOpen(false);
    setError(null);
    setPerioOpen(false);
    setFollowupOpen(false);
    setDirectTreatmentRequested(false);
    setForkDrafts([]);
  }, [patientId]);

  const handleSelect = React.useCallback(
    (fdi: number) => {
      const active = document.activeElement as HTMLElement | null;
      if (active?.matches?.("[data-fdi]")) lastFocusedRef.current = active;
      setSelectedFdi(fdi);
      // Selection stays on the chart. The inspector is a temporary overlay
      // opened explicitly, at every width, so selecting a tooth never covers
      // the chart-level actions. Task 5 replaces this overlay with the record
      // drawer.
    },
    [],
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

  const selectedPeriodontalExam = React.useMemo(() => {
    const examinations = dto?.periodontalExaminations ?? [];
    return examinations.find((exam) => exam.status === "DRAFT") ?? examinations[0] ?? null;
  }, [dto]);

  const selectedPerioSites = React.useMemo<PerioMeasurement[]>(() => {
    if (!selectedPeriodontalExam) return [];
    return selectedPeriodontalExam.sites.map((site) => ({
      toothFdi: site.tooth_fdi,
      site: site.site,
      probingDepthMm: site.probing_depth_mm,
      gingivalMarginMm: site.gingival_margin_mm,
      calMm: site.cal_mm,
      bleedingOnProbing: site.bleeding_on_probing,
      suppuration: site.suppuration,
    }));
  }, [selectedPeriodontalExam]);

  const perioToothStates = React.useMemo<Readonly<Record<string, PerioToothState>>>(() => {
    const states: Record<string, PerioToothState> = {};
    if (!dto) return states;

    for (const entry of dto.entries ?? []) {
      if (entry.status === "PLANNED" || entry.lifecycle !== "OPEN" || entry.event_state !== "CURRENT") continue;
      const isMissing = entry.clinical_code === "MISSING" || (entry.detail?.code === "TOOTH_STATE" && entry.detail.state === "MISSING");
      if (isMissing) states[entry.tooth_code] = { toothPresent: false };
    }
    for (const chain of dto.implantChains ?? []) {
      if (chain.record_kind === "CURRENT" && chain.event_state === "CURRENT") states[chain.tooth_fdi] = { toothPresent: true, implantContext: true };
    }
    for (const site of selectedPeriodontalExam?.sites ?? []) {
      const existing = states[site.tooth_fdi] ?? {};
      states[site.tooth_fdi] = {
        toothPresent: site.tooth_present === false ? false : existing.toothPresent,
        implantContext: site.implant_context === true || existing.implantContext,
      };
    }
    return states;
  }, [dto, selectedPeriodontalExam]);

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

  const closeInspector = React.useCallback(() => {
    setSelectedFdi(null);
    setSheetOpen(false);
    setDirectTreatmentRequested(false);
    // Return focus to the previously selected tooth for keyboard continuity.
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
            onSelect={handleSelect}
            onDraftChange={setForkDrafts}
            onError={setError}
          />
          <ForkSaveController
            key={`${patientId}:${actingBranchId}`}
            patientId={patientId}
            actingBranchId={actingBranchId}
            canWriteClinical={canWriteClinical}
            drafts={forkDrafts}
            onSaved={async () => {
              setForkDrafts([]);
              await refetch();
            }}
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
        <span>{canWriteClinical ? "Record, amend or void from the tooth inspector once a tooth is selected." : "Read-only access. Selection shows the current clinical record."}</span>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" className="min-h-11 text-xs" disabled={!selectedFdiForCurrentPatient} onClick={() => setSheetOpen(true)}>
            Open inspector
          </Button>
          <Button type="button" variant="outline" size="sm" className="min-h-11 text-xs" onClick={() => setPerioOpen(true)}>
            Open periodontal entry
          </Button>
        </div>
      </div>

      <CurrentStatusPanel
        selectedTooth={selectedFdiForCurrentPatient}
        canWriteClinical={canWriteClinical}
        procedureCases={procedureCases}
        followupAvailable={followupAvailable}
        onRecordDirectTreatment={() => {
          setDirectTreatmentRequested(true);
          setSheetOpen(true);
        }}
        onOpenFollowup={() => setFollowupOpen(true)}
      />

      {renderProgressRecord && <ProgressRecordTable events={progressEvents} />}

      <Sheet open={sheetOpen && selectedFdiForCurrentPatient !== null} onOpenChange={(open) => { if (!open) closeInspector(); else setSheetOpen(true); }}>
        <SheetContent side="bottom" className="max-h-[85dvh] overflow-auto p-0 sm:max-h-[80dvh] sm:max-w-none" onEscapeKeyDown={closeInspector} onInteractOutside={closeInspector}>
          <SheetHeader className="sr-only">
            <SheetTitle>Tooth details</SheetTitle>
          </SheetHeader>
          {selectedFdiForCurrentPatient !== null && dto && (
            <ToothInspector
              patientId={patientId}
              actingBranchId={actingBranchId}
              fdi={selectedFdiForCurrentPatient}
              dto={dto}
              notation="FDI"
              canWriteClinical={canWriteClinical}
              onClose={closeInspector}
              onMutated={refetch}
              initialRecordOpen={directTreatmentRequested}
            />
          )}
        </SheetContent>
      </Sheet>

      <Dialog open={perioOpen} onOpenChange={(open) => !open && setPerioOpen(false)}>
        <DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-6xl overflow-auto sm:w-[min(96vw,72rem)]" onEscapeKeyDown={() => setPerioOpen(false)}>
          <DialogHeader>
            <DialogTitle>Periodontal entry</DialogTitle>
            <DialogDescription>Six-site measurements remain a bounded periodontal examination, separate from the tooth-chart projection.</DialogDescription>
          </DialogHeader>
          {selectedPeriodontalExam && canWriteClinical ? (
            <PerioWorkspace
              patientId={patientId}
              actingBranchId={actingBranchId}
              examination={{
                id: selectedPeriodontalExam.id,
                status: selectedPeriodontalExam.status,
                version: selectedPeriodontalExam.version,
                examinationKind: selectedPeriodontalExam.examination_kind,
                examinedAt: selectedPeriodontalExam.examined_at,
                examinedProviderId: selectedPeriodontalExam.examined_provider_id,
                finalizedAt: selectedPeriodontalExam.finalized_at,
                finalizedBy: selectedPeriodontalExam.finalized_by,
                encounterId: selectedPeriodontalExam.encounter_id,
              }}
              initialSites={selectedPerioSites}
              toothStates={perioToothStates}
              onSave={async (payload) => {
                const result = await savePeriodontalMeasurementsAction(payload);
                if (result.ok) void refetch();
                return result;
              }}
              onFinalize={async (payload) => {
                const result = await finalizePeriodontalExaminationAction(payload);
                if (result.ok) void refetch();
                return result;
              }}
              onAmend={async (payload) => {
                const result = await amendPeriodontalExaminationAction(payload);
                if (result.ok) void refetch();
                return result;
              }}
            />
          ) : (
            <div className="rounded-md border bg-muted/30 px-3 py-3 text-sm text-muted-foreground">
              {selectedPeriodontalExam
                ? "This periodontal examination is read-only for your current clinical permission."
                : "No periodontal examination is available yet. Create one from an authorized clinical encounter before charting measurements."}
            </div>
          )}
        </DialogContent>
      </Dialog>

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
