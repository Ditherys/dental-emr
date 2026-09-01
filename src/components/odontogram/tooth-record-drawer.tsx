"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { toLabel, type NumberingSystem } from "@/lib/odontogram/dentition";
import type { PatientOdontogramDTO, ToothClinicalEntryDTO } from "@/lib/odontogram/types";

import { ClinicalRecordComposer } from "./clinical-record-composer";
import { ToothInspector } from "./tooth-inspector";

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
  /** Refetch the canonical projection after a confirmed server write. */
  onRecorded: () => void | Promise<void>;
};

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

  const heading =
    selectedFdi.length === 0
      ? "No tooth selected"
      : selectedFdi.length === 1
        ? `Tooth ${toLabel(selectedFdi[0]!, notation)}`
        : `Teeth ${selectedFdi.map((fdi) => toLabel(fdi, notation)).join(", ")}`;

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
              <section aria-labelledby="tooth-current-state-heading" className="grid gap-1.5">
                <h4 id="tooth-current-state-heading" className="text-xs font-semibold text-muted-foreground">
                  Current state
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

              <section aria-labelledby="tooth-history-heading" className="grid gap-1.5">
                <h4 id="tooth-history-heading" className="text-xs font-semibold text-muted-foreground">
                  History
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
