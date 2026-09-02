"use client";

import * as React from "react";
import { Ellipsis } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { ClinicalChartMode } from "@/lib/clinical/types";
import type { NumberingSystem } from "@/lib/odontogram/dentition";
import type { RendererToothView } from "@/lib/odontogram/renderer-projection";
import { cn } from "@/lib/utils";

import { ChartViewportControls } from "./chart-viewport-controls";
import { ClinicalExportMenu } from "./clinical-export-menu";
import { ClinicalImportDialog } from "./clinical-import-dialog";
import type { ChartDentition, ChartViewportChoice } from "./measured-chart";
import { OdontogramHelp } from "./odontogram-help";

/**
 * The chart view is presentation state owned by the Clinical chart workspace:
 * how the dentition is displayed and which teeth are highlighted. It is never
 * authorization, never a clinical fact, and never written back to the canonical
 * projection.
 */
export type ClinicalChartView = {
  notation: NumberingSystem;
  dentition: ChartDentition;
  viewport: ChartViewportChoice;
  selectedFdi: readonly number[];
  /** Draw the bone/gum backdrop. Presentation only. */
  showBoneGum: boolean;
  /** Draw the healthy pulp chamber. Presentation only. */
  showPulp: boolean;
  /** Include FDI 18/28/38/48 in the grid. Presentation only. */
  showWisdomTeeth: boolean;
  /** The angle every tooth is drawn from. Presentation only. */
  renderAngle: RendererToothView;
};

export type ClinicalChartViewState = ClinicalChartView & {
  setView: (next: Partial<ClinicalChartView>) => void;
  /** True when the workspace toolbar owns this view. */
  managed: boolean;
};

export const DEFAULT_CLINICAL_CHART_VIEW: ClinicalChartView = Object.freeze({
  notation: "FDI",
  dentition: "AUTO",
  viewport: "AUTO",
  selectedFdi: Object.freeze([]) as readonly number[],
  showBoneGum: true,
  showPulp: true,
  showWisdomTeeth: true,
  renderAngle: "front",
});

const ChartViewContext = React.createContext<ClinicalChartViewState | null>(null);

export function ClinicalChartViewProvider({
  value,
  children,
}: {
  value: Omit<ClinicalChartViewState, "managed">;
  children: React.ReactNode;
}): React.ReactElement {
  const managed = React.useMemo<ClinicalChartViewState>(() => ({ ...value, managed: true }), [value]);
  return <ChartViewContext.Provider value={managed}>{children}</ChartViewContext.Provider>;
}

/**
 * Reads the workspace's chart view. A chart mounted outside the workspace — a
 * print preview or a focused unit test — keeps its own bounded local view
 * instead of failing, so the renderer never depends on a toolbar being present.
 */
export function useClinicalChartView(): ClinicalChartViewState {
  const provided = React.useContext(ChartViewContext);
  const [local, setLocal] = React.useState<ClinicalChartView>(DEFAULT_CLINICAL_CHART_VIEW);
  const setView = React.useCallback(
    (next: Partial<ClinicalChartView>) => setLocal((current) => ({ ...current, ...next })),
    [],
  );
  const fallback = React.useMemo<ClinicalChartViewState>(
    () => ({ ...local, setView, managed: false }),
    [local, setView],
  );
  return provided ?? fallback;
}

const CHART_MODES: ReadonlyArray<{ value: ClinicalChartMode; label: string }> = Object.freeze([
  { value: "CURRENT_STATUS", label: "Current status" },
  { value: "TREATMENT_PLAN", label: "Treatment plan" },
  { value: "PERIODONTAL", label: "Periodontal" },
]);

const NOTATIONS: ReadonlyArray<{ value: NumberingSystem; label: string }> = Object.freeze([
  { value: "FDI", label: "FDI" },
  { value: "UNIVERSAL", label: "Universal" },
  { value: "PALMER", label: "Palmer" },
]);

const DENTITIONS: ReadonlyArray<{ value: ChartDentition; label: string }> = Object.freeze([
  { value: "AUTO", label: "From record" },
  { value: "PERMANENT", label: "Permanent" },
  { value: "MIXED", label: "Mixed" },
  { value: "PRIMARY", label: "Primary" },
]);

export function selectionSummary(selectedFdi: readonly number[]): string {
  if (selectedFdi.length === 0) return "No tooth selected";
  const sorted = [...selectedFdi].sort((a, b) => a - b);
  if (sorted.length === 1) return `Tooth ${sorted[0]} selected`;
  return `Teeth ${sorted.join(", ")} selected`;
}

/**
 * The interchange context the toolbar needs to offer import and export.
 *
 * It is route context and presentation only. No organization, no provider
 * identifier and no author: the provider display is a line of confirmation text
 * and is never sent back to the server, which derives the treating provider
 * from the signed-in user on every clinical write.
 */
export type ClinicalChartInterchange = {
  patientId: string;
  branchId: string;
  /** False for a clinical reader, who may export but may not import. */
  canImport: boolean;
  providerDisplay?: string | null;
  clinicalDate?: string | null;
  getChartSvg?: () => string | null;
  onImported?: () => void;
};

export type ClinicalChartToolbarProps = {
  mode: ClinicalChartMode;
  onModeChange: (mode: ClinicalChartMode) => void;
  view: ClinicalChartView;
  onViewChange: (next: Partial<ClinicalChartView>) => void;
  /** Omitted when the surrounding workspace has nothing to print. */
  onPrint?: () => void;
  /** Omitted when the workspace holds no clinical photographs. */
  onOpenGallery?: () => void;
  /** Omitted where the surrounding screen has no authorized patient context. */
  interchange?: ClinicalChartInterchange;
};

/**
 * The single control row of the Clinical chart work surface.
 *
 * Everything a clinician reaches for while charting is here once: the three
 * chart modes, the rendered region, the display notation, the dentition, and
 * the current selection. Infrequent actions stay behind one `More` menu instead
 * of becoming another wall of always-visible buttons.
 */
export function ClinicalChartToolbar({
  mode,
  onModeChange,
  view,
  onViewChange,
  onPrint,
  onOpenGallery,
  interchange,
}: ClinicalChartToolbarProps): React.ReactElement {
  const [helpOpen, setHelpOpen] = React.useState(false);
  const [importOpen, setImportOpen] = React.useState(false);
  const notationId = React.useId();
  const dentitionId = React.useId();

  // An open import review belongs to the patient it was opened on. The reset
  // runs during render, so no frame can show one patient's proposed records
  // against another patient's chart.
  const [interchangePatientId, setInterchangePatientId] = React.useState(interchange?.patientId);
  if (interchangePatientId !== interchange?.patientId) {
    setInterchangePatientId(interchange?.patientId);
    setImportOpen(false);
  }

  return (
    <div
      role="toolbar"
      aria-label="Clinical chart controls"
      data-testid="clinical-chart-toolbar"
      className="flex w-full min-w-0 flex-wrap items-center gap-x-3 gap-y-2 border-b pb-2"
    >
      <div role="group" aria-label="Chart mode" className="flex flex-wrap gap-1 text-sm font-medium">
        {CHART_MODES.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            aria-pressed={mode === value}
            onClick={() => onModeChange(value)}
            className={cn(
              "min-h-11 shrink-0 rounded-t border-b-2 px-3 py-2",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
              mode === value
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <ChartViewportControls
        viewport={view.viewport}
        onViewportChange={(viewport) => onViewChange({ viewport })}
      />

      <div className="flex items-center gap-1.5">
        <label htmlFor={notationId} className="text-xs font-medium text-muted-foreground">
          Notation
        </label>
        <Select
          id={notationId}
          aria-label="Tooth notation"
          value={view.notation}
          onChange={(event) => onViewChange({ notation: event.target.value as NumberingSystem })}
          className="min-h-11 w-auto text-xs"
        >
          {NOTATIONS.map(({ value, label }) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </div>

      <div className="flex items-center gap-1.5">
        <label htmlFor={dentitionId} className="text-xs font-medium text-muted-foreground">
          Dentition
        </label>
        <Select
          id={dentitionId}
          aria-label="Dentition"
          value={view.dentition}
          onChange={(event) => onViewChange({ dentition: event.target.value as ChartDentition })}
          className="min-h-11 w-auto text-xs"
        >
          {DENTITIONS.map(({ value, label }) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </div>

      {/* The chart owns the live announcement; this is the persistent readout. */}
      <p data-testid="chart-selection-summary" className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
        {selectionSummary(view.selectedFdi)}
      </p>

      {interchange && (
        <ClinicalExportMenu
          patientId={interchange.patientId}
          branchId={interchange.branchId}
          // Only the two tooth-chart modes mount a renderer to serialize. The
          // toolbar is where the mode is known, so this is where the chart-image
          // exports stop being offered - a caller cannot reasonably be asked to
          // re-derive which mode is showing.
          getChartSvg={mode === "PERIODONTAL" ? undefined : interchange.getChartSvg}
          onPrint={onPrint}
        />
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="sm" className="min-h-11" aria-label="More chart actions">
            <Ellipsis aria-hidden="true" /> More
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuCheckboxItem
            checked={view.showBoneGum}
            onCheckedChange={(checked) => onViewChange({ showBoneGum: checked === true })}
          >
            Bone and gum
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={view.showPulp}
            onCheckedChange={(checked) => onViewChange({ showPulp: checked === true })}
          >
            Pulp chamber
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={view.showWisdomTeeth}
            onCheckedChange={(checked) => onViewChange({ showWisdomTeeth: checked === true })}
          >
            Wisdom teeth
          </DropdownMenuCheckboxItem>
          {/* The rendering angle every tooth is drawn from, not the per-tooth
              `occlusal` finding surface used elsewhere in this app. */}
          <DropdownMenuCheckboxItem
            checked={view.renderAngle === "occlusal"}
            onCheckedChange={(checked) => onViewChange({ renderAngle: checked === true ? "occlusal" : "front" })}
          >
            Occlusal view
          </DropdownMenuCheckboxItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setHelpOpen(true)}>Chart help</DropdownMenuItem>
          {onPrint && <DropdownMenuItem onSelect={() => onPrint()}>Print chart</DropdownMenuItem>}
          {onOpenGallery && (
            <DropdownMenuItem onSelect={() => onOpenGallery()}>Clinical photographs</DropdownMenuItem>
          )}
          {interchange?.canImport && (
            <DropdownMenuItem onSelect={() => setImportOpen(true)}>
              Import clinical records
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {interchange?.canImport && (
        <ClinicalImportDialog
          open={importOpen}
          onOpenChange={setImportOpen}
          patientId={interchange.patientId}
          branchId={interchange.branchId}
          providerDisplay={interchange.providerDisplay}
          clinicalDate={interchange.clinicalDate}
          onApplied={interchange.onImported}
        />
      )}

      <Sheet open={helpOpen} onOpenChange={setHelpOpen}>
        <SheetContent side="right" className="w-full overflow-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Chart help</SheetTitle>
            <SheetDescription>
              How to move around the chart, what the markers mean, and where the anatomy comes from.
            </SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-4">
            <OdontogramHelp />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
