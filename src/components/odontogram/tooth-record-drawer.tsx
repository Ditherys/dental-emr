"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { bridgeSpanSummary, type BridgeUnit } from "@/lib/odontogram/bridge";
import { toLabel, type NumberingSystem } from "@/lib/odontogram/dentition";
import {
  currentImplantProjection,
  currentImplantStage,
  describeImplantStage,
  type ImplantComponentRecord,
} from "@/lib/odontogram/implant";
import type { ClinicalChartMode } from "@/lib/clinical/types";
import type { ClinicalComposerContext } from "@/lib/odontogram/composer-context";
import type { PatientOdontogramDTO, ToothClinicalEntryDTO } from "@/lib/odontogram/types";

import { ClinicalRecordComposer } from "./clinical-record-composer";
import type { PlanAuthoringContext } from "./planned-treatment-form";
import { ToothInspector, isLegacyToothEntry } from "./tooth-inspector";

/** One body at a time, so the drawer never becomes a stack of panels. */
type DrawerBody = "summary" | "composer" | "corrections";

function philippineClinicalDate(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function isCurrent(entry: ToothClinicalEntryDTO): boolean {
  return entry.voided_at === null && entry.lifecycle === "OPEN" && entry.event_state === "CURRENT";
}

function describeEntry(entry: ToothClinicalEntryDTO): string {
  const surfaces = entry.surfaces?.length ? entry.surfaces.join(", ") : "whole tooth";
  return `${entry.clinical_code.replaceAll("_", " ")} · ${entry.status} · ${surfaces}`;
}

export type ToothRecordDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientId: string;
  branchId: string;
  /** Teeth currently selected on the chart, in selection order. */
  selectedFdi: readonly number[];
  notation: NumberingSystem;
  dto: PatientOdontogramDTO | null;
  canWriteClinical: boolean;
  /**
   * The authorized server projection that makes the composer's treatment,
   * bridge and implant forms usable. Absent when the read was refused or has
   * not loaded; the composer then says exactly what is missing.
   */
  composerContext?: ClinicalComposerContext | null;
  /**
   * The chart mode the drawer was opened from. Treatment plan opens the
   * composer on Planned treatment; every other mode opens on Finding.
   */
  chartMode?: ClinicalChartMode;
  /** The plan a Treatment plan proposal is authored into, when there is one. */
  planContext?: PlanAuthoringContext | null;
  /** Refetch the canonical projection after a confirmed server write. */
  onRecorded: () => void | Promise<void>;
};

/**
 * The current bridge and implant record for one tooth, read from the canonical
 * relationship DTOs. The chart's connector is a projection of this, never the
 * other way round.
 */
function relationshipSummary(
  dto: PatientOdontogramDTO | null,
  toothCode: string | null,
): { bridge: string | null; bridgeDate: string | null; implant: string | null; implantDate: string | null } | null {
  if (!dto || toothCode === null) return null;

  const bridge = (dto.bridges ?? []).find(
    (candidate) =>
      candidate.event_state === "CURRENT" &&
      (candidate.units ?? []).some((unit) => unit.tooth_fdi === toothCode),
  );
  const unit = bridge?.units?.find((candidate) => candidate.tooth_fdi === toothCode) ?? null;
  const bridgeUnits: BridgeUnit[] = (bridge?.units ?? []).map((candidate) => ({
    toothFdi: Number(candidate.tooth_fdi),
    ordinal: candidate.ordinal,
    role: candidate.role,
    supportKind: candidate.support_kind,
    supportComponentId: candidate.support_component_id,
  }));

  const chain = (dto.implantChains ?? []).find(
    (candidate) => candidate.event_state === "CURRENT" && candidate.tooth_fdi === toothCode,
  );
  const components: ImplantComponentRecord[] = (chain?.components ?? []).map((component) => ({
    id: component.id,
    patientId: dto.patientId,
    toothFdi: Number(chain?.tooth_fdi ?? toothCode),
    ordinal: component.ordinal,
    componentKind: component.component_kind,
    recordKind: chain?.record_kind ?? "CURRENT",
    dependsOnComponentId: component.depends_on_component_id,
    provenance: null,
    sealedAt: component.sealed_at,
    voidedAt: null,
    supersedesComponentId: component.supersedes_component_id,
  }));
  const stage = chain ? currentImplantStage(currentImplantProjection(components)) : null;

  if (!bridge && !chain) return null;
  return {
    bridge: bridge && unit
      ? `${bridgeSpanSummary(bridgeUnits)} · this tooth is the ${unit.role === "PONTIC" ? "pontic" : "abutment"}`
      : null,
    bridgeDate: bridge?.executed_at ? String(bridge.executed_at).slice(0, 10) : null,
    implant: chain ? describeImplantStage(stage) : null,
    implantDate: chain?.executed_at ? String(chain.executed_at).slice(0, 10) : null,
  };
}

/**
 * The one temporary tooth surface of the clinical chart.
 *
 * It shows who the tooth is, what its record currently says, how it got there,
 * and offers exactly one way to add to it. There is no permanent inspector
 * column: the drawer opens over the chart, and every clinical fact it shows is
 * read from the canonical projection rather than from any local draft.
 */
export function ToothRecordDrawer({
  open,
  onOpenChange,
  patientId,
  branchId,
  selectedFdi,
  notation,
  dto,
  canWriteClinical,
  composerContext = null,
  chartMode = "CURRENT_STATUS",
  planContext = null,
  onRecorded,
}: ToothRecordDrawerProps): React.ReactElement {
  const [body, setBody] = React.useState<DrawerBody>("summary");

  const toothCodes = React.useMemo(() => selectedFdi.map((fdi) => String(fdi)), [selectedFdi]);
  const selectionKey = `${patientId}:${toothCodes.join(",")}`;
  // A different patient or a different tooth is a different clinical subject, so
  // the drawer body and every draft inside it reset rather than carry over.
  const [bodySelectionKey, setBodySelectionKey] = React.useState(selectionKey);
  if (bodySelectionKey !== selectionKey) {
    setBodySelectionKey(selectionKey);
    if (body !== "summary") setBody("summary");
  }

  const focusedFdi = selectedFdi.at(-1) ?? null;
  const focusedCode = focusedFdi === null ? null : String(focusedFdi);
  const isCurrentPatientDto = dto?.patientId === patientId;

  const toothEntries = React.useMemo(() => {
    if (!isCurrentPatientDto || focusedCode === null) return [];
    return (dto?.entries ?? []).filter((entry) => entry.tooth_code === focusedCode);
  }, [dto, focusedCode, isCurrentPatientDto]);

  const currentEntries = React.useMemo(() => toothEntries.filter(isCurrent), [toothEntries]);
  const history = React.useMemo(
    () =>
      [...toothEntries].sort((left, right) =>
        String(left.recorded_at).localeCompare(String(right.recorded_at)),
      ),
    [toothEntries],
  );

  const legacyEntries = React.useMemo(() => toothEntries.filter(isLegacyToothEntry), [toothEntries]);

  const relationship = React.useMemo(
    () => (isCurrentPatientDto ? relationshipSummary(dto, focusedCode) : null),
    [dto, focusedCode, isCurrentPatientDto],
  );

  // A projection belonging to another patient is never used, exactly as the
  // odontogram DTO is not. The composer then reports what is missing rather than
  // mounting a form against the wrong record.
  const context = composerContext?.patientId === patientId ? composerContext : null;
  const treatmentContext = React.useMemo(
    () =>
      context
        ? {
            patientIdentifier: context.patientIdentifier,
            procedures: context.procedures,
            activeFindings: context.activeFindings,
            planItems: context.planItems,
            openCases: context.openCases,
            paymentMethods: context.paymentMethods,
          }
        : undefined,
    [context],
  );
  const relationshipContext = React.useMemo(
    () =>
      context
        ? {
            chargeChoices: context.chargeChoices,
            supportComponents: context.supportComponents,
            implantStageByTooth: context.implantStageByTooth,
            implantParentByTooth: context.implantParentByTooth,
          }
        : undefined,
    [context],
  );

  const heading =
    selectedFdi.length === 0
      ? "No tooth selected"
      : selectedFdi.length === 1
        ? `Tooth ${toLabel(selectedFdi[0]!, notation)}`
        : `Teeth ${selectedFdi.map((fdi) => toLabel(fdi, notation)).join(", ")}`;

  // The record below belongs to exactly one tooth. With several selected, the
  // heading names them all and the composer writes to them all, so every
  // record section states which tooth it is showing and the drawer says so
  // once in plain words. A clinician must never read one tooth's restoration
  // as if it belonged to the pair.
  const focusedLabel = focusedFdi === null ? null : toLabel(focusedFdi, notation);
  const recordScope = focusedLabel === null ? "" : ` — tooth ${focusedLabel}`;
  const isMultiSelection = selectedFdi.length > 1;

  return (
    // Non-modal on purpose: the drawer sits beside the chart, so selecting
    // another tooth, changing the region or reading the toolbar must all stay
    // possible while it is open. An outside interaction updates the drawer
    // rather than dismissing it; Close and Escape dismiss it.
    <Sheet open={open} onOpenChange={onOpenChange} modal={false}>
      <SheetContent
        side="right"
        showOverlay={false}
        onInteractOutside={(event) => event.preventDefault()}
        // CSS only: a full-width panel on a phone, a roughly 400px rail beside
        // the chart from the small breakpoint up. No width is measured in JS.
        className="data-[side=right]:w-full data-[side=right]:sm:max-w-[400px] gap-0 overflow-y-auto p-0"
      >
        <div data-testid="tooth-record-drawer" className="flex min-h-0 flex-col">
        <SheetHeader className="border-b">
          <SheetTitle asChild>
            <h3 className="text-sm font-semibold">{heading}</h3>
          </SheetTitle>
          <SheetDescription className="text-xs">
            {selectedFdi.length === 0
              ? "Select a tooth on the chart to see and add to its record."
              : `${selectedFdi.length === 1 ? "FDI" : "FDI teeth"} ${selectedFdi.join(", ")} · ${notation}`}
          </SheetDescription>
        </SheetHeader>

        <div className="grid gap-4 px-4 py-4">
          {body === "composer" && canWriteClinical ? (
            <ClinicalRecordComposer
              patientId={patientId}
              branchId={branchId}
              toothCodes={toothCodes}
              defaultClinicalDate={philippineClinicalDate()}
              treatmentContext={treatmentContext}
              relationshipContext={relationshipContext}
              planContext={planContext}
              defaultKind={chartMode === "TREATMENT_PLAN" ? "PLANNED_TREATMENT" : "FINDING"}
              onRecorded={async () => {
                await onRecorded();
                setBody("summary");
              }}
              onCancel={() => setBody("summary")}
            />
          ) : body === "corrections" && focusedFdi !== null && isCurrentPatientDto && dto ? (
            <ToothInspector
              patientId={patientId}
              actingBranchId={branchId}
              fdi={focusedFdi}
              dto={dto}
              notation={notation}
              canWriteClinical={canWriteClinical}
              onClose={() => setBody("summary")}
              onMutated={onRecorded}
            />
          ) : (
            <>
              {isMultiSelection && focusedLabel !== null && (
                <p
                  data-testid="drawer-record-scope"
                  role="status"
                  className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground"
                >
                  Showing the record for tooth {focusedLabel}. A new clinical record applies to all{" "}
                  {selectedFdi.length} selected teeth.
                </p>
              )}

              {legacyEntries.length > 0 && (
                <p
                  data-testid="drawer-legacy-notice"
                  role="alert"
                  className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900"
                >
                  Legacy reconciliation needed: {legacyEntries.length} row(s) on tooth {focusedLabel} still
                  need resolving. Open Corrections to resolve them.
                </p>
              )}

              <section aria-labelledby="tooth-current-state-heading" className="grid gap-1.5">
                <h4 id="tooth-current-state-heading" className="text-xs font-semibold text-muted-foreground">
                  Current state{recordScope}
                </h4>
                <div data-testid="tooth-current-state">
                  {currentEntries.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No current record for this tooth.</p>
                  ) : (
                    <ul className="divide-y rounded-md border">
                      {currentEntries.map((entry) => (
                        <li key={entry.id} className="px-3 py-2">
                          <p className="text-sm font-medium">{describeEntry(entry)}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {entry.kind} · recorded {String(entry.recorded_at).slice(0, 10)}
                            {entry.notes ? ` · ${entry.notes}` : ""}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </section>

              {relationship && (
                <section aria-labelledby="tooth-relationship-heading" className="grid gap-1.5">
                  <h4 id="tooth-relationship-heading" className="text-xs font-semibold text-muted-foreground">
                    Bridge and implant{recordScope}
                  </h4>
                  <ul data-testid="tooth-relationship-summary" className="divide-y rounded-md border">
                    {relationship.bridge && (
                      <li className="px-3 py-2">
                        <p className="text-sm font-medium">{relationship.bridge}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Bridge{relationship.bridgeDate ? ` · placed ${relationship.bridgeDate}` : ""}
                        </p>
                      </li>
                    )}
                    {relationship.implant && (
                      <li className="px-3 py-2">
                        <p className="text-sm font-medium">{relationship.implant}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Implant{relationship.implantDate ? ` · recorded ${relationship.implantDate}` : ""}
                        </p>
                      </li>
                    )}
                  </ul>
                </section>
              )}

              <section aria-labelledby="tooth-history-heading" className="grid gap-1.5">
                <h4 id="tooth-history-heading" className="text-xs font-semibold text-muted-foreground">
                  History{recordScope}
                </h4>
                <div data-testid="tooth-history">
                  {history.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No history for this tooth.</p>
                  ) : (
                    <ul className="divide-y rounded-md border">
                      {history.map((entry) => (
                        <li key={entry.id} className="px-3 py-2">
                          <p className="text-xs font-medium">{describeEntry(entry)}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {String(entry.recorded_at).slice(0, 10)} · {entry.lifecycle}
                            {entry.voided_at ? ` · voided ${String(entry.voided_at).slice(0, 10)}` : ""}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </section>

              {canWriteClinical ? (
                <div className="grid gap-2">
                  <Button
                    type="button"
                    size="sm"
                    className="min-h-11 justify-center"
                    disabled={selectedFdi.length === 0}
                    onClick={() => setBody("composer")}
                  >
                    Add clinical record
                  </Button>
                  {/*
                    Amend, void and legacy reconciliation are corrections, not
                    new records. They stay one explicit step away instead of
                    occupying the drawer beside the current state.
                  */}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="min-h-11 justify-center"
                    disabled={focusedFdi === null || toothEntries.length === 0}
                    onClick={() => setBody("corrections")}
                  >
                    Corrections
                  </Button>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Read-only access. Clinical write permission is required to add to this record.
                </p>
              )}
            </>
          )}
        </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
