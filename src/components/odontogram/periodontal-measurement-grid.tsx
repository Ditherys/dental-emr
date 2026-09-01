"use client";

import * as React from "react";

import { PERIO_SITES, type PerioSite } from "@/lib/odontogram/clinical-codes";
import {
  PERIO_GINGIVAL_PHENOTYPES,
  PERIO_GINGIVAL_THICKNESS_MAX_MM,
  PERIO_GINGIVAL_THICKNESS_MIN_MM,
  PERIO_GM_MAX,
  PERIO_GM_MIN,
  PERIO_KERATINIZED_GINGIVA_MAX_MM,
  PERIO_KERATINIZED_GINGIVA_MIN_MM,
  PERIO_MILLER_RECESSION_CLASSES,
  PERIO_MOBILITY_GRADES,
  PERIO_PD_MAX,
  PERIO_PD_MIN,
  PERIO_SURFACE_INDEX_MAX,
  PERIO_SURFACE_INDEX_MIN,
  deriveCal,
  type PerioGingivalPhenotype,
  type PerioMillerRecessionClass,
  type PerioMobilityGrade,
} from "@/lib/odontogram/perio";
import { perioIndexAppliesTo } from "@/lib/odontogram/perio-indices";
import {
  NOT_RECORDED,
  NotRecorded,
  PERIO_FURCATION_ENTRANCES,
  PERIO_PLAQUE_SURFACES,
  type PerioFurcationEntrance,
  type PerioPlaqueSurfaceCode,
} from "./periodontal-summary";

/**
 * The dense, keyboard-first periodontal measurement grid.
 *
 * One semantic `<table>` per arch. Rows are teeth, so the natural tab order is
 * the clinical charting order — one tooth, its six sites MB, B, DB, ML, L, DL,
 * then the next tooth. Column headers carry the measurement name AND its unit;
 * no label is hidden in a placeholder, and no input carries a placeholder at
 * all.
 *
 * Unknown is never rendered as a value. An unrecorded number is an empty field
 * whose accessible name ends in "not recorded"; an unrecorded finding is a
 * three-state toggle showing "?", never an unchecked checkbox that reads as a
 * recorded "no"; and a derived attachment level that cannot be computed says
 * "Not recorded" in words rather than falling back to the probing depth.
 *
 * Arrow keys navigate only the three-state toggles, where an arrow has no
 * native meaning. Number inputs and selects keep their native arrow behaviour
 * (spinner and option cycling); they move vertically with Enter and
 * Shift+Enter instead. Horizontal movement everywhere is Tab.
 */

export type PerioGridSiteReading = {
  probingDepthMm: number | null;
  gingivalMarginMm: number | null;
  bleedingOnProbing: boolean | null;
  suppuration: boolean | null;
};

export type PerioGridSurfaceReading = {
  plaquePresent: boolean | null;
  plaqueIndex: number | null;
  gingivalIndex: number | null;
  modifiedPlaqueIndex: number | null;
  modifiedBleedingIndex: number | null;
};

export type PerioGridToothRow = {
  toothFdi: string;
  present: boolean | null;
  implantContext: boolean | null;
  sites: Partial<Record<PerioSite, PerioGridSiteReading>>;
  surfaces: Partial<Record<PerioPlaqueSurfaceCode, PerioGridSurfaceReading>>;
  furcation: Partial<Record<PerioFurcationEntrance, number | null>>;
  mobilityMiller: PerioMobilityGrade | null;
  keratinizedGingivaMm: number | null;
  gingivalThicknessMm: number | null;
  gingivalPhenotype: PerioGingivalPhenotype | null;
  millerRecessionClass: PerioMillerRecessionClass | null;
  cejVisible: boolean | null;
  rootConcavity: boolean | null;
};

export type PerioGridSiteField = keyof PerioGridSiteReading;
export type PerioGridSurfaceField = keyof PerioGridSurfaceReading;
export type PerioGridToothField =
  | "present"
  | "implantContext"
  | "mobilityMiller"
  | "keratinizedGingivaMm"
  | "gingivalThicknessMm"
  | "gingivalPhenotype"
  | "millerRecessionClass"
  | "cejVisible"
  | "rootConcavity";

export function emptyPerioGridToothRow(toothFdi: string): PerioGridToothRow {
  return {
    toothFdi,
    present: null,
    implantContext: null,
    sites: {},
    surfaces: {},
    furcation: {},
    mobilityMiller: null,
    keratinizedGingivaMm: null,
    gingivalThicknessMm: null,
    gingivalPhenotype: null,
    millerRecessionClass: null,
    cejVisible: null,
    rootConcavity: null,
  };
}

export const PERIO_SITE_WORDS: Record<PerioSite, string> = {
  MB: "mesio-buccal",
  B: "buccal",
  DB: "disto-buccal",
  ML: "mesio-lingual",
  L: "lingual",
  DL: "disto-lingual",
};

const SURFACE_WORDS: Record<PerioPlaqueSurfaceCode, string> = {
  MESIAL: "mesial",
  DISTAL: "distal",
  BUCCAL: "buccal",
  LINGUAL: "lingual",
};

const SURFACE_SHORT: Record<PerioPlaqueSurfaceCode, string> = {
  MESIAL: "M",
  DISTAL: "D",
  BUCCAL: "B",
  LINGUAL: "L",
};

const ENTRANCE_SHORT: Record<PerioFurcationEntrance, string> = {
  mesial: "M",
  distal: "D",
  buccal: "B",
  lingual: "L",
};

/** Every three-state toggle column, in the left-to-right order they appear. */
const TOGGLE_COLUMNS: readonly string[] = [
  ...PERIO_SITES.map((site) => `bop:${site}`),
  ...PERIO_SITES.map((site) => `sup:${site}`),
  ...PERIO_PLAQUE_SURFACES.map((surface) => `plaque:${surface}`),
  "cej",
  "concavity",
];

const NUMBER_COLUMNS: readonly string[] = [
  ...PERIO_SITES.map((site) => `pd:${site}`),
  ...PERIO_SITES.map((site) => `gm:${site}`),
  "kg",
  "gt",
];

const cellId = (kind: "toggle" | "input", column: string, toothFdi: string) =>
  `perio-grid-${kind}-${column}-${toothFdi}`;

function focusCell(kind: "toggle" | "input", column: string, toothFdi: string): boolean {
  const element = document.getElementById(cellId(kind, column, toothFdi));
  if (!element) return false;
  element.focus();
  return true;
}

const inputClass =
  "h-9 w-14 min-w-0 rounded-md border border-input bg-background px-1 text-center text-xs tabular-nums outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50";
const selectClass =
  "h-9 w-full min-w-14 rounded-md border border-input bg-background px-1 text-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50";
const headClass = "whitespace-nowrap border-b px-1 py-1 text-[10px] font-medium text-muted-foreground";

/** `null → true → false → null`, so a clinician can always get back to
 *  "not recorded" before anything is written. */
function nextTriState(value: boolean | null): boolean | null {
  if (value === null) return true;
  if (value) return false;
  return null;
}

function TriStateToggle({
  column,
  toothFdi,
  label,
  value,
  disabled,
  onChange,
  onNavigate,
}: {
  column: string;
  toothFdi: string;
  label: string;
  value: boolean | null;
  disabled: boolean;
  onChange: (next: boolean | null) => void;
  onNavigate: (column: string, direction: -1 | 1, axis: "row" | "column") => void;
}): React.ReactElement {
  const state = value === null ? NOT_RECORDED.toLowerCase() : value ? "present" : "absent";
  return (
    <button
      id={cellId("toggle", column, toothFdi)}
      type="button"
      disabled={disabled}
      aria-label={`${label}, ${state}`}
      data-state={value === null ? "UNKNOWN" : value ? "PRESENT" : "ABSENT"}
      onClick={() => onChange(nextTriState(value))}
      onKeyDown={(event) => {
        const map: Record<string, [-1 | 1, "row" | "column"]> = {
          ArrowUp: [-1, "column"],
          ArrowDown: [1, "column"],
          ArrowLeft: [-1, "row"],
          ArrowRight: [1, "row"],
        };
        const move = map[event.key];
        if (!move) return;
        event.preventDefault();
        onNavigate(column, move[0], move[1]);
      }}
      className={
        "inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border text-xs font-semibold tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50 " +
        (value === null
          ? "border-dashed border-input text-muted-foreground"
          : value
            ? "border-destructive/50 bg-destructive/10 text-destructive"
            : "border-input text-foreground")
      }
    >
      <span aria-hidden="true">{value === null ? "?" : value ? "+" : "–"}</span>
    </button>
  );
}

function NumberCell({
  column,
  toothFdi,
  label,
  value,
  min,
  max,
  step,
  disabled,
  onChange,
  onNavigate,
}: {
  column: string;
  toothFdi: string;
  label: string;
  value: number | null;
  min: number;
  max: number;
  step: number;
  disabled: boolean;
  onChange: (next: number | null) => void;
  onNavigate: (column: string, direction: -1 | 1) => void;
}): React.ReactElement {
  return (
    <input
      id={cellId("input", column, toothFdi)}
      type="number"
      inputMode={min < 0 ? "text" : "numeric"}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      aria-label={value === null ? `${label}, not recorded` : label}
      value={value === null ? "" : String(value)}
      onChange={(event) => {
        const raw = event.target.value;
        if (raw.trim() === "") {
          onChange(null);
          return;
        }
        const parsed = Number(raw);
        if (!Number.isFinite(parsed) || parsed < min || parsed > max) return;
        onChange(parsed);
      }}
      onKeyDown={(event) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        onNavigate(column, event.shiftKey ? -1 : 1);
      }}
      className={inputClass}
    />
  );
}

function OptionalSelect<T extends string>({
  label,
  value,
  options,
  disabled,
  allowUnknown,
  onChange,
  format,
}: {
  label: string;
  value: T | null;
  options: readonly T[];
  disabled: boolean;
  allowUnknown: boolean;
  onChange: (next: T | null) => void;
  format?: (option: T) => string;
}): React.ReactElement {
  return (
    <select
      aria-label={value === null ? `${label}, not recorded` : label}
      disabled={disabled}
      value={value ?? ""}
      onChange={(event) => onChange(event.target.value === "" ? null : (event.target.value as T))}
      className={selectClass}
    >
      {(allowUnknown || value === null) && <option value="">{NOT_RECORDED}</option>}
      {options.map((option) => (
        <option key={option} value={option}>
          {format ? format(option) : option}
        </option>
      ))}
    </select>
  );
}

export interface PeriodontalMeasurementGridProps {
  caption: string;
  teeth: readonly PerioGridToothRow[];
  readOnly?: boolean;
  onSiteChange: (toothFdi: string, site: PerioSite, field: PerioGridSiteField, value: number | boolean | null) => void;
  onToothChange: (toothFdi: string, field: PerioGridToothField, value: string | number | boolean | null) => void;
  onSurfaceChange: (
    toothFdi: string,
    surface: PerioPlaqueSurfaceCode,
    field: PerioGridSurfaceField,
    value: number | boolean | null,
  ) => void;
  onFurcationChange: (toothFdi: string, entrance: PerioFurcationEntrance, grade: number | null) => void;
}

export function PeriodontalMeasurementGrid({
  caption,
  teeth,
  readOnly = false,
  onSiteChange,
  onToothChange,
  onSurfaceChange,
  onFurcationChange,
}: PeriodontalMeasurementGridProps): React.ReactElement {
  const toothOrder = React.useMemo(() => teeth.map((tooth) => tooth.toothFdi), [teeth]);

  const navigateToggle = React.useCallback(
    (toothFdi: string) => (column: string, direction: -1 | 1, axis: "row" | "column") => {
      if (axis === "column") {
        const index = toothOrder.indexOf(toothFdi) + direction;
        const target = toothOrder[index];
        if (target) focusCell("toggle", column, target);
        return;
      }
      const index = TOGGLE_COLUMNS.indexOf(column) + direction;
      const target = TOGGLE_COLUMNS[index];
      if (target) focusCell("toggle", target, toothFdi);
    },
    [toothOrder],
  );

  const navigateNumber = React.useCallback(
    (toothFdi: string) => (column: string, direction: -1 | 1) => {
      const index = toothOrder.indexOf(toothFdi) + direction;
      const target = toothOrder[index];
      if (target && NUMBER_COLUMNS.includes(column)) focusCell("input", column, target);
    },
    [toothOrder],
  );

  return (
    <div className="min-w-0">
      <div data-testid="perio-grid-scroll" className="-mx-1 overflow-x-auto px-1 [scrollbar-width:thin]">
        <table className="w-max border-separate border-spacing-0 text-left">
          <caption className="mb-1 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {caption}
          </caption>
          <thead>
            <tr>
              <th scope="col" rowSpan={2} className={`${headClass} sticky left-0 z-10 bg-background`}>
                Tooth
              </th>
              <th scope="colgroup" colSpan={6} className={headClass}>
                Probing depth (mm)
              </th>
              <th scope="colgroup" colSpan={6} className={headClass}>
                Gingival margin (mm)
              </th>
              <th scope="colgroup" colSpan={6} className={headClass}>
                Attachment level (mm)
              </th>
              <th scope="colgroup" colSpan={6} className={headClass}>
                Bleeding on probing
              </th>
              <th scope="colgroup" colSpan={6} className={headClass}>
                Suppuration
              </th>
              <th scope="colgroup" colSpan={4} className={headClass}>
                Plaque, O&apos;Leary
              </th>
              <th scope="colgroup" colSpan={4} className={headClass}>
                Plaque index (0–3)
              </th>
              <th scope="colgroup" colSpan={4} className={headClass}>
                Gingival / bleeding index (0–3)
              </th>
              <th scope="colgroup" colSpan={4} className={headClass}>
                Furcation, Glickman (1–4)
              </th>
              <th scope="colgroup" colSpan={9} className={headClass}>
                Tooth findings
              </th>
            </tr>
            <tr>
              {["pd", "gm", "cal", "bop", "sup"].flatMap((group) =>
                PERIO_SITES.map((site) => (
                  <th key={`${group}-${site}`} scope="col" className={headClass}>
                    {site}
                  </th>
                )),
              )}
              {["plaque", "pi", "gi"].flatMap((group) =>
                PERIO_PLAQUE_SURFACES.map((surface) => (
                  <th key={`${group}-${surface}`} scope="col" className={headClass}>
                    {SURFACE_SHORT[surface]}
                  </th>
                )),
              )}
              {PERIO_FURCATION_ENTRANCES.map((entrance) => (
                <th key={`furcation-${entrance}`} scope="col" className={headClass}>
                  {ENTRANCE_SHORT[entrance]}
                </th>
              ))}
              <th scope="col" className={headClass}>
                Presence
              </th>
              <th scope="col" className={headClass}>
                Type
              </th>
              <th scope="col" className={headClass}>
                Mobility (Miller)
              </th>
              <th scope="col" className={headClass}>
                Keratinized gingiva (mm)
              </th>
              <th scope="col" className={headClass}>
                Gingival thickness (mm)
              </th>
              <th scope="col" className={headClass}>
                Phenotype band (thin / thick)
              </th>
              <th scope="col" className={headClass}>
                Miller recession class
              </th>
              <th scope="col" className={headClass}>
                CEJ visible
              </th>
              <th scope="col" className={headClass}>
                Root concavity
              </th>
            </tr>
          </thead>
          <tbody>
            {teeth.map((tooth) => {
              const absent = tooth.present === false;
              const implant = tooth.implantContext === true;
              const locked = readOnly || absent;
              // perio_tooth_implant_property_check: an implant has no cemento-
              // enamel junction, so there is no attachment to classify Miller
              // recession against and no CEJ or root concavity to record. The
              // database refuses all three on an implant; the grid does not
              // offer them rather than letting the write fail.
              const naturalOnly = locked || implant;
              const status = absent
                ? "absent"
                : tooth.present === null
                  ? "presence not recorded"
                  : implant
                    ? "implant"
                    : "present";
              const toggleNav = navigateToggle(tooth.toothFdi);
              const numberNav = navigateNumber(tooth.toothFdi);
              const cell = "border-b px-0.5 py-0.5 align-middle";

              return (
                <tr key={tooth.toothFdi}>
                  <th
                    scope="row"
                    className="sticky left-0 z-10 whitespace-nowrap border-b bg-background px-1 py-1 text-left text-xs font-semibold tabular-nums"
                  >
                    Tooth {tooth.toothFdi}
                    <span className="ml-1 block text-[10px] font-normal text-muted-foreground">{status}</span>
                  </th>

                  {PERIO_SITES.map((site) => (
                    <td key={`pd-${site}`} className={cell}>
                      <NumberCell
                        column={`pd:${site}`}
                        toothFdi={tooth.toothFdi}
                        label={`Tooth ${tooth.toothFdi} ${PERIO_SITE_WORDS[site]} probing depth in millimetres`}
                        value={tooth.sites[site]?.probingDepthMm ?? null}
                        min={PERIO_PD_MIN}
                        max={PERIO_PD_MAX}
                        step={1}
                        disabled={locked}
                        onChange={(next) => onSiteChange(tooth.toothFdi, site, "probingDepthMm", next)}
                        onNavigate={numberNav}
                      />
                    </td>
                  ))}

                  {PERIO_SITES.map((site) => (
                    <td key={`gm-${site}`} className={cell}>
                      <NumberCell
                        column={`gm:${site}`}
                        toothFdi={tooth.toothFdi}
                        label={`Tooth ${tooth.toothFdi} ${PERIO_SITE_WORDS[site]} gingival margin in millimetres`}
                        value={tooth.sites[site]?.gingivalMarginMm ?? null}
                        min={PERIO_GM_MIN}
                        max={PERIO_GM_MAX}
                        step={1}
                        disabled={locked}
                        onChange={(next) => onSiteChange(tooth.toothFdi, site, "gingivalMarginMm", next)}
                        onNavigate={numberNav}
                      />
                    </td>
                  ))}

                  {PERIO_SITES.map((site) => {
                    const reading = tooth.sites[site];
                    const cal = deriveCal(reading?.probingDepthMm ?? null, reading?.gingivalMarginMm ?? null);
                    return (
                      <td
                        key={`cal-${site}`}
                        data-testid={`perio-grid-cal-${tooth.toothFdi}-${site}`}
                        className={`${cell} text-center text-xs tabular-nums`}
                      >
                        {cal === null ? <NotRecorded /> : cal}
                      </td>
                    );
                  })}

                  {PERIO_SITES.map((site) => (
                    <td key={`bop-${site}`} className={cell}>
                      <TriStateToggle
                        column={`bop:${site}`}
                        toothFdi={tooth.toothFdi}
                        label={`Tooth ${tooth.toothFdi} ${PERIO_SITE_WORDS[site]} bleeding on probing`}
                        value={tooth.sites[site]?.bleedingOnProbing ?? null}
                        disabled={locked}
                        onChange={(next) => onSiteChange(tooth.toothFdi, site, "bleedingOnProbing", next)}
                        onNavigate={toggleNav}
                      />
                    </td>
                  ))}

                  {PERIO_SITES.map((site) => (
                    <td key={`sup-${site}`} className={cell}>
                      <TriStateToggle
                        column={`sup:${site}`}
                        toothFdi={tooth.toothFdi}
                        label={`Tooth ${tooth.toothFdi} ${PERIO_SITE_WORDS[site]} suppuration`}
                        value={tooth.sites[site]?.suppuration ?? null}
                        disabled={locked}
                        onChange={(next) => onSiteChange(tooth.toothFdi, site, "suppuration", next)}
                        onNavigate={toggleNav}
                      />
                    </td>
                  ))}

                  {PERIO_PLAQUE_SURFACES.map((surface) => (
                    <td key={`plaque-${surface}`} className={cell}>
                      <TriStateToggle
                        column={`plaque:${surface}`}
                        toothFdi={tooth.toothFdi}
                        label={`Tooth ${tooth.toothFdi} ${SURFACE_WORDS[surface]} plaque`}
                        value={tooth.surfaces[surface]?.plaquePresent ?? null}
                        disabled={locked}
                        onChange={(next) => onSurfaceChange(tooth.toothFdi, surface, "plaquePresent", next)}
                        onNavigate={toggleNav}
                      />
                    </td>
                  ))}

                  {PERIO_PLAQUE_SURFACES.map((surface) => {
                    const usePlaqueIndex = perioIndexAppliesTo("PI", implant);
                    const field: PerioGridSurfaceField = usePlaqueIndex ? "plaqueIndex" : "modifiedPlaqueIndex";
                    const label = `Tooth ${tooth.toothFdi} ${SURFACE_WORDS[surface]} ${usePlaqueIndex ? "plaque index" : "modified plaque index"}`;
                    return (
                      <td key={`pi-${surface}`} className={cell}>
                        <OptionalSelect
                          label={label}
                          value={numberOption(tooth.surfaces[surface]?.[field] ?? null)}
                          options={SURFACE_INDEX_OPTIONS}
                          disabled={locked}
                          allowUnknown
                          onChange={(next) =>
                            onSurfaceChange(tooth.toothFdi, surface, field, next === null ? null : Number(next))
                          }
                        />
                      </td>
                    );
                  })}

                  {PERIO_PLAQUE_SURFACES.map((surface) => {
                    const useGingivalIndex = perioIndexAppliesTo("GI", implant);
                    const field: PerioGridSurfaceField = useGingivalIndex ? "gingivalIndex" : "modifiedBleedingIndex";
                    const label = `Tooth ${tooth.toothFdi} ${SURFACE_WORDS[surface]} ${useGingivalIndex ? "gingival index" : "modified bleeding index"}`;
                    return (
                      <td key={`gi-${surface}`} className={cell}>
                        <OptionalSelect
                          label={label}
                          value={numberOption(tooth.surfaces[surface]?.[field] ?? null)}
                          options={SURFACE_INDEX_OPTIONS}
                          disabled={locked}
                          allowUnknown
                          onChange={(next) =>
                            onSurfaceChange(tooth.toothFdi, surface, field, next === null ? null : Number(next))
                          }
                        />
                      </td>
                    );
                  })}

                  {PERIO_FURCATION_ENTRANCES.map((entrance) => (
                    <td key={`furcation-${entrance}`} className={cell}>
                      <OptionalSelect
                        label={`Tooth ${tooth.toothFdi} ${entrance} furcation grade`}
                        value={numberOption(tooth.furcation[entrance] ?? null)}
                        options={FURCATION_OPTIONS}
                        disabled={locked}
                        allowUnknown
                        onChange={(next) =>
                          onFurcationChange(tooth.toothFdi, entrance, next === null ? null : Number(next))
                        }
                      />
                    </td>
                  ))}

                  <td className={cell}>
                    <OptionalSelect
                      label={`Tooth ${tooth.toothFdi} presence`}
                      value={tooth.present === null ? null : tooth.present ? "PRESENT" : "ABSENT"}
                      options={PRESENCE_OPTIONS}
                      disabled={readOnly}
                      allowUnknown={false}
                      onChange={(next) =>
                        onToothChange(tooth.toothFdi, "present", next === null ? null : next === "PRESENT")
                      }
                      format={(option) => (option === "PRESENT" ? "Present" : "Absent")}
                    />
                  </td>
                  <td className={cell}>
                    <OptionalSelect
                      label={`Tooth ${tooth.toothFdi} type`}
                      value={tooth.implantContext === null ? null : tooth.implantContext ? "IMPLANT" : "NATURAL"}
                      options={CONTEXT_OPTIONS}
                      disabled={locked}
                      allowUnknown={false}
                      onChange={(next) =>
                        onToothChange(tooth.toothFdi, "implantContext", next === null ? null : next === "IMPLANT")
                      }
                      format={(option) => (option === "IMPLANT" ? "Implant" : "Natural")}
                    />
                  </td>
                  <td className={cell}>
                    <OptionalSelect
                      label={`Tooth ${tooth.toothFdi} mobility, Miller`}
                      value={tooth.mobilityMiller}
                      options={PERIO_MOBILITY_GRADES}
                      disabled={locked}
                      allowUnknown
                      onChange={(next) => onToothChange(tooth.toothFdi, "mobilityMiller", next)}
                    />
                  </td>
                  <td className={cell}>
                    <NumberCell
                      column="kg"
                      toothFdi={tooth.toothFdi}
                      label={`Tooth ${tooth.toothFdi} keratinized gingiva in millimetres`}
                      value={tooth.keratinizedGingivaMm}
                      min={PERIO_KERATINIZED_GINGIVA_MIN_MM}
                      max={PERIO_KERATINIZED_GINGIVA_MAX_MM}
                      step={0.5}
                      disabled={locked}
                      onChange={(next) => onToothChange(tooth.toothFdi, "keratinizedGingivaMm", next)}
                      onNavigate={numberNav}
                    />
                  </td>
                  <td className={cell}>
                    <NumberCell
                      column="gt"
                      toothFdi={tooth.toothFdi}
                      label={`Tooth ${tooth.toothFdi} gingival thickness in millimetres`}
                      value={tooth.gingivalThicknessMm}
                      min={PERIO_GINGIVAL_THICKNESS_MIN_MM}
                      max={PERIO_GINGIVAL_THICKNESS_MAX_MM}
                      step={0.1}
                      disabled={locked}
                      onChange={(next) => onToothChange(tooth.toothFdi, "gingivalThicknessMm", next)}
                      onNavigate={numberNav}
                    />
                  </td>
                  <td className={cell}>
                    <OptionalSelect
                      label={`Tooth ${tooth.toothFdi} recorded phenotype band`}
                      value={tooth.gingivalPhenotype}
                      options={PERIO_GINGIVAL_PHENOTYPES}
                      disabled={locked}
                      allowUnknown
                      onChange={(next) => onToothChange(tooth.toothFdi, "gingivalPhenotype", next)}
                      format={(option) => (option === "THIN" ? "Thin" : "Thick")}
                    />
                  </td>
                  <td className={cell}>
                    <OptionalSelect
                      label={`Tooth ${tooth.toothFdi} Miller recession class`}
                      value={tooth.millerRecessionClass}
                      options={PERIO_MILLER_RECESSION_CLASSES}
                      disabled={naturalOnly}
                      allowUnknown
                      onChange={(next) => onToothChange(tooth.toothFdi, "millerRecessionClass", next)}
                    />
                  </td>
                  <td className={cell}>
                    <TriStateToggle
                      column="cej"
                      toothFdi={tooth.toothFdi}
                      label={`Tooth ${tooth.toothFdi} CEJ visible`}
                      value={tooth.cejVisible}
                      disabled={naturalOnly}
                      onChange={(next) => onToothChange(tooth.toothFdi, "cejVisible", next)}
                      onNavigate={toggleNav}
                    />
                  </td>
                  <td className={cell}>
                    <TriStateToggle
                      column="concavity"
                      toothFdi={tooth.toothFdi}
                      label={`Tooth ${tooth.toothFdi} root concavity`}
                      value={tooth.rootConcavity}
                      disabled={naturalOnly}
                      onChange={(next) => onToothChange(tooth.toothFdi, "rootConcavity", next)}
                      onNavigate={toggleNav}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p data-testid="perio-grid-phenotype-note" className="mt-2 text-[11px] text-muted-foreground">
        The recorded phenotype band holds two values only, thin or thick. It is{" "}
        <strong className="font-medium">not the full 2017 phenotype</strong>, which distinguishes thin scalloped,
        thick flat and thick scalloped; that three-way form is an open clinical-owner question and is not stored.
      </p>
      <p className="mt-1 text-[11px] text-muted-foreground">
        A three-state toggle reads <span aria-hidden="true">?</span> not recorded,{" "}
        <span aria-hidden="true">+</span> present, <span aria-hidden="true">–</span> absent. Arrow keys move
        between toggles; Enter and Shift+Enter move a numeric field up and down its column; Tab follows the
        clinical order MB, B, DB, ML, L, DL, one tooth at a time. An empty numeric field means the measurement was
        never taken, which is not the same as a reading of zero.
      </p>
    </div>
  );
}

const SURFACE_INDEX_OPTIONS = Array.from(
  { length: PERIO_SURFACE_INDEX_MAX - PERIO_SURFACE_INDEX_MIN + 1 },
  (_, index) => String(PERIO_SURFACE_INDEX_MIN + index),
) as readonly string[];

const FURCATION_OPTIONS = ["1", "2", "3", "4"] as const;
const PRESENCE_OPTIONS = ["PRESENT", "ABSENT"] as const;
const CONTEXT_OPTIONS = ["NATURAL", "IMPLANT"] as const;

function numberOption(value: number | null): string | null {
  return value === null ? null : String(value);
}
