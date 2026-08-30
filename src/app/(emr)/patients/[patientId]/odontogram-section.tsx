/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { MeasuredChart } from "@/components/odontogram/measured-chart";
import { CurrentStatusPanel, type ProcedureCaseChoice } from "@/components/odontogram/current-status-panel";
import { OdontogramToolbar, type ChartViewFilter, type DentitionFilter } from "@/components/odontogram/odontogram-toolbar";
import { PerioWorkspace, type PerioMeasurement } from "@/components/odontogram/perio-workspace";
import { OdontogramPrintHistory } from "@/components/odontogram/print-history";
import { ProcedureFollowupDialog, type ProcedureFollowupInput } from "@/components/odontogram/procedure-followup-dialog";
import { ProgressRecordTable } from "@/components/odontogram/progress-record-table";
import { ToothInspector } from "@/components/odontogram/tooth-inspector";
import type { NumberingSystem } from "@/lib/odontogram/dentition";
import { isPrimaryFdi, isPermanentFdi } from "@/lib/odontogram/dentition";
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
  /** @deprecated O13 read cutover — use initialOdontogram (get_patient_odontogram DTO). */
  initialConditions?: unknown;
  initialOdontogram?: PatientOdontogramDTO | null;
  initialProgressEvents?: ProgressEventDTO[];
  procedureCases?: readonly ProcedureCaseChoice[];
  recordFollowup?: (input: ProcedureFollowupInput) => Promise<{ ok: boolean }>;
  loadFailed?: boolean;
};

export function OdontogramSection({
  patientId,
  actingBranchId,
  canWriteClinical,
  initialOdontogram,
  initialProgressEvents,
  procedureCases: suppliedProcedureCases,
  recordFollowup,
  loadFailed,
}: Props): React.ReactElement {
  const [dto, setDto] = React.useState<PatientOdontogramDTO | null>(() => initialOdontogram ?? null);
  const [loading, setLoading] = React.useState(() => !initialOdontogram && !loadFailed);
  const [error, setError] = React.useState<string | null>(null);
  const [selectedFdi, setSelectedFdi] = React.useState<number | null>(null);
  const [notation, setNotation] = React.useState<NumberingSystem>("FDI");
  const [dentition, setDentition] = React.useState<DentitionFilter>("permanent");
  const [view, setView] = React.useState<ChartViewFilter>("all");
  const [perioOpen, setPerioOpen] = React.useState(false);
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [followupOpen, setFollowupOpen] = React.useState(false);
  const [directTreatmentRequested, setDirectTreatmentRequested] = React.useState(false);

  // Transient state is keyed by patientId — clear selection on patient change.
  React.useEffect(() => {
    setSelectedFdi(null);
    setSheetOpen(false);
    setError(null);
    setPerioOpen(false);
    setFollowupOpen(false);
    setDirectTreatmentRequested(false);
  }, [patientId]);

  const handleSelect = React.useCallback(
    (fdi: number) => {
      const active = document.activeElement as HTMLElement | null;
      if (active?.matches?.('[data-fdi]')) lastFocusedRef.current = active;
      setSelectedFdi(fdi);
      setSheetOpen(window.matchMedia?.("(max-width: 1023px)")?.matches ?? false);
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
      setDto(result.odontogram);
    } catch {
      setError("The odontogram could not be loaded. Refresh to try again.");
    } finally {
      setLoading(false);
    }
  }, [actingBranchId, patientId]);

  React.useEffect(() => {
    if (initialOdontogram) {
      setDto(initialOdontogram);
      setLoading(false);
      return;
    }
    if (loadFailed) {
      setLoading(false);
      return;
    }
    void refetch();
  }, [initialOdontogram, loadFailed, refetch]);

  const filteredDto = React.useMemo(() => {
    if (!dto) return dto;
    let entries = dto.entries ?? [];
    if (dentition !== "all") {
      entries = entries.filter((e) => {
        const fdi = Number(e.tooth_code);
        if (!Number.isFinite(fdi)) return false;
        if (dentition === "permanent") return isPermanentFdi(fdi);
        return isPrimaryFdi(fdi);
      });
    }
    if (view !== "all") {
      entries = entries.filter((e) => {
        const status = String(e.status);
        const isPlanned = status === "PLANNED";
        return view === "planned" ? isPlanned : !isPlanned;
      });
    }
    return { ...dto, entries };
  }, [dto, dentition, view]);

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

  const progressEvents = React.useMemo(
    () => initialProgressEvents ?? (dto ? progressEventsFromOdontogram(dto) : []),
    [dto, initialProgressEvents],
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
        const first = document.querySelector<HTMLElement>(`[data-fdi]`);
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
    <div key={patientId} data-testid="odontogram-section" className="@container flex max-w-full flex-col gap-3 overflow-hidden">
      {error && (
        <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <OdontogramToolbar
        notation={notation}
        dentition={dentition}
        view={view}
        canWriteClinical={canWriteClinical}
        onNotationChange={setNotation}
        onDentitionChange={setDentition}
        onViewChange={setView}
        onPerioEntry={() => setPerioOpen(true)}
      />

      {loading || !filteredDto ? (
        <div className="rounded-md border p-6 text-sm text-muted-foreground">Loading odontogram…</div>
      ) : (
        <div className="flex gap-4">
          <div className="min-w-0 flex-1 overflow-hidden">
            <MeasuredChart dto={filteredDto} selectedFdi={selectedFdi} onSelect={handleSelect} notation={notation} dentition={dentition} />
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>{canWriteClinical ? "Select a tooth to review or record findings. Use inspector for amend/void." : "Read-only access. Selection shows current clinical record."}</span>
              <Button type="button" variant="outline" size="sm" className="min-h-8 text-xs lg:hidden" disabled={!selectedFdi} onClick={() => setSheetOpen(true)}>
                Open inspector
              </Button>
            </div>
            <div className="mt-4">
              <OdontogramPrintHistory dto={dto ?? filteredDto} />
            </div>
          </div>

          <aside
            aria-label="Tooth inspector"
            className="hidden w-[340px] shrink-0 overflow-hidden rounded-md border bg-card lg:flex lg:flex-col"
          >
            {selectedFdi === null ? (
              <div className="p-6 text-sm text-muted-foreground">Select a tooth on the chart to view details and actions.</div>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col overflow-auto">
                <ToothInspector
                  key={`desktop-${selectedFdi}-${directTreatmentRequested ? "direct" : "inspect"}`}
                  patientId={patientId}
                  actingBranchId={actingBranchId}
                  fdi={selectedFdi}
                  dto={dto}
                  notation={notation}
                  canWriteClinical={canWriteClinical}
                  onClose={closeInspector}
                  onMutated={refetch}
                  initialRecordOpen={directTreatmentRequested}
                />
              </div>
            )}
          </aside>
        </div>
      )}

      <CurrentStatusPanel
        selectedTooth={selectedFdi}
        canWriteClinical={canWriteClinical}
        procedureCases={procedureCases}
        followupAvailable={followupAvailable}
        onRecordDirectTreatment={() => {
          setDirectTreatmentRequested(true);
          setSheetOpen(window.matchMedia?.("(max-width: 1023px)")?.matches ?? false);
        }}
        onOpenFollowup={() => setFollowupOpen(true)}
      />

      <ProgressRecordTable events={progressEvents} />

      <Sheet open={sheetOpen && selectedFdi !== null} onOpenChange={(open) => { if (!open) closeInspector(); else setSheetOpen(true); }}>
        <SheetContent side="bottom" className="max-h-[85dvh] overflow-auto p-0 sm:max-h-[80dvh] sm:max-w-none" onEscapeKeyDown={closeInspector} onInteractOutside={closeInspector}>
          <SheetHeader className="sr-only">
            <SheetTitle>Tooth details</SheetTitle>
          </SheetHeader>
          {selectedFdi !== null && dto && (
            <ToothInspector
              patientId={patientId}
              actingBranchId={actingBranchId}
              fdi={selectedFdi}
              dto={dto}
              notation={notation}
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
