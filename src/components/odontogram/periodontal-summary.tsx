"use client";

import * as React from "react";

import type { PerioSite } from "@/lib/odontogram/clinical-codes";
import type {
  PerioDiabetesStatus,
  PerioDiagnosis,
  PerioExtent,
  PerioGingivalPhenotype,
  PerioGrade,
  PerioMillerRecessionClass,
  PerioMobilityGrade,
  PerioSmokingStatus,
  PerioStage,
} from "@/lib/odontogram/perio";

/**
 * The periodontal workspace projection, and the descriptive statistics a
 * clinician reads above the chart.
 *
 * Two rules govern everything in this file.
 *
 * 1. `null` means unknown. It is never rendered as `0`, as an empty string that
 *    reads like zero, or as a filled-in value. Every unknown is rendered in
 *    words: "Not recorded" for a measurement, "Not assessed" for a finding
 *    nobody looked for.
 * 2. Every denominator counts only readings that exist. An average over six
 *    sites where two are unknown is an average of four, reported as such.
 *
 * The CLASSIFICATION is deliberately absent from these statistics. It is
 * computed by the server and arrives on `payload.derived`; nothing here derives
 * a diagnosis, a stage, a grade or an extent.
 */

export type PerioPlaqueSurfaceCode = "MESIAL" | "DISTAL" | "BUCCAL" | "LINGUAL";
export type PerioFurcationEntrance = "mesial" | "distal" | "buccal" | "lingual";

export const PERIO_PLAQUE_SURFACES: readonly PerioPlaqueSurfaceCode[] = [
  "MESIAL",
  "DISTAL",
  "BUCCAL",
  "LINGUAL",
];

export const PERIO_FURCATION_ENTRANCES: readonly PerioFurcationEntrance[] = [
  "mesial",
  "distal",
  "buccal",
  "lingual",
];

export type PerioSiteRow = {
  tooth_fdi: string;
  site: PerioSite;
  probing_depth_mm: number | null;
  gingival_margin_mm: number | null;
  cal_mm: number | null;
  bleeding_on_probing: boolean | null;
  suppuration: boolean | null;
  implant_context: boolean | null;
};

export type PerioPlaqueRow = {
  tooth_fdi: string;
  surface: PerioPlaqueSurfaceCode;
  plaque_present: boolean | null;
  plaque_index: number | null;
  gingival_index: number | null;
  modified_plaque_index: number | null;
  modified_bleeding_index: number | null;
};

export type PerioToothRow = {
  tooth_fdi: string;
  tooth_present: boolean | null;
  implant_context: boolean | null;
  context_inferred?: boolean | null;
  mobility_miller: PerioMobilityGrade | null;
  notes: string | null;
  keratinized_gingiva_mm: number | null;
  gingival_thickness_mm: number | null;
  gingival_phenotype: PerioGingivalPhenotype | null;
  miller_recession_class: PerioMillerRecessionClass | null;
  cej_visible: boolean | null;
  root_concavity: boolean | null;
};

export type PerioFurcationRow = {
  tooth_fdi: string;
  entrance: PerioFurcationEntrance;
  grade: number;
};

export type PerioRiskPayload = {
  age_years_snapshot: number | null;
  smoking_status: PerioSmokingStatus | null;
  cigarettes_per_day: number | null;
  diabetes_status: PerioDiabetesStatus | null;
  hba1c_percent: number | null;
  teeth_lost_to_periodontitis: number | null;
  radiographic_bone_loss_percent: number | null;
};

export type PerioClassificationPayload = {
  diagnosis: PerioDiagnosis | null;
  stage: PerioStage | null;
  grade: PerioGrade | null;
  extent: PerioExtent | null;
  measurement_fingerprint?: string | null;
  confirmed_at?: string | null;
  override_reason?: string | null;
};

export type PerioExaminationKind = "INITIAL" | "RE-EVALUATION" | "MAINTENANCE";

export type PerioExaminationPayload = {
  id: string;
  patient_id: string;
  encounter_id: string;
  predecessor_examination_id: string | null;
  examination_kind: PerioExaminationKind;
  status: "DRAFT" | "FINAL";
  version: number;
  recorded_at: string;
  examined_at: string | null;
  finalized_at: string | null;
  amendment_reason: string | null;
  risk: PerioRiskPayload;
  stored_derived: PerioClassificationPayload;
  confirmed: PerioClassificationPayload;
};

/** The server's own recomputation. The single authority for the confirmation
 *  form; nothing in the browser may replace it there. */
export type PerioDerivedPayload = {
  diagnosis: PerioDiagnosis | null;
  stage: PerioStage | null;
  grade: PerioGrade | null;
  extent: PerioExtent | null;
  present_tooth_count: number | null;
  teeth_with_known_interdental_cal: number | null;
  assessed_bop_site_count: number | null;
  bleeding_site_count: number | null;
  bop_percent: number | null;
  complete: boolean | null;
};

export type PerioTimelineEntry = {
  id: string;
  examination_kind: PerioExaminationKind;
  status: "DRAFT" | "FINAL";
  version: number;
  recorded_at: string;
  finalized_at: string | null;
  predecessor_examination_id: string | null;
  confirmed_diagnosis: PerioDiagnosis | null;
};

export type PeriodontalWorkspacePayload = {
  examination: PerioExaminationPayload | null;
  sites: PerioSiteRow[];
  plaque: PerioPlaqueRow[];
  tooth: PerioToothRow[];
  furcation: PerioFurcationRow[];
  /** `null` for a patient with no examination at all. */
  derived: PerioDerivedPayload | null;
  timeline: PerioTimelineEntry[];
};

export type PerioComparisonSummary = PerioExaminationSummaryHeader;

export type PerioExaminationSummaryHeader = {
  id: string;
  examination_kind: PerioExaminationKind;
  status: "DRAFT" | "FINAL";
  version: number;
  recorded_at: string;
  finalized_at: string | null;
  predecessor_examination_id: string | null;
  confirmed_diagnosis: PerioDiagnosis | null;
  confirmed_stage: PerioStage | null;
  confirmed_grade: PerioGrade | null;
  confirmed_extent: PerioExtent | null;
  // Attribution. Every one of these is genuinely nullable: an examination whose
  // provider link was never established is not attributable, and the header
  // says so rather than naming somebody.
  examined_provider_id: string | null;
  examined_provider_name: string | null;
  finalized_provider_id: string | null;
  finalized_provider_name: string | null;
  branch_id: string | null;
  branch_name: string | null;
};

export type PerioComparisonSiteRow = {
  tooth_fdi: string;
  site: PerioSite;
  left_probing_depth_mm: number | null;
  left_gingival_margin_mm: number | null;
  left_cal_mm: number | null;
  left_bleeding_on_probing: boolean | null;
  right_probing_depth_mm: number | null;
  right_gingival_margin_mm: number | null;
  right_cal_mm: number | null;
  right_bleeding_on_probing: boolean | null;
  delta_probing_depth_mm: number | null;
  delta_cal_mm: number | null;
};

export type PerioComparisonDerived = {
  diagnosis: PerioDiagnosis | null;
  stage: PerioStage | null;
  grade: PerioGrade | null;
  extent: PerioExtent | null;
  bop_percent: number | null;
  complete: boolean | null;
};

export type PerioComparisonPayload = {
  left: PerioExaminationSummaryHeader | null;
  right: PerioExaminationSummaryHeader | null;
  left_derived: PerioComparisonDerived;
  right_derived: PerioComparisonDerived;
  sites: PerioComparisonSiteRow[];
};

// ---------------------------------------------------------------------------
// Unknown rendering
// ---------------------------------------------------------------------------

export const NOT_RECORDED = "Not recorded";
export const NOT_ASSESSED = "Not assessed";

/** The one way an unknown measurement reaches the screen. */
export function NotRecorded({ label = NOT_RECORDED }: { label?: string }): React.ReactElement {
  return (
    <span data-unknown="true" className="text-muted-foreground italic">
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Descriptive statistics
// ---------------------------------------------------------------------------

export type PerioPocketBand = { label: string; count: number };

export type PeriodontalExamStatistics = {
  presentToothRowCount: number;
  chartedSiteCount: number;
  expectedSiteCount: number;
  unknownSiteCount: number;
  meanProbingDepthMm: number | null;
  maxProbingDepthMm: number | null;
  knownProbingDepthCount: number;
  meanCalMm: number | null;
  maxCalMm: number | null;
  knownCalCount: number;
  bandCounts: readonly PerioPocketBand[];
  assessedBopSiteCount: number;
  bleedingSiteCount: number;
  bopPercent: number | null;
  assessedPlaqueSurfaceCount: number;
  plaqueSurfaceCount: number;
  plaquePercent: number | null;
  maxFurcationGrade: number | null;
};

function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function max(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((best, value) => (value > best ? value : best), values[0]!);
}

/**
 * Reduce one authorized projection to the numbers a clinician reads.
 *
 * Every denominator counts recorded readings only:
 * - the expected site count is six per tooth ROW that exists and says present,
 *   never six per tooth in the dentition, because a tooth with no row was never
 *   assessed at all;
 * - the bleeding share divides by assessed sites, so an unassessed mouth
 *   reports `null` and not 0 %;
 * - an attachment level is known only when both readings behind it are.
 */
export function summarizePeriodontalExamination(
  payload: Pick<PeriodontalWorkspacePayload, "sites" | "plaque" | "tooth" | "furcation" | "derived">,
): PeriodontalExamStatistics {
  const presentToothRows = payload.tooth.filter((row) => row.tooth_present !== false);
  const chartedSites = payload.sites.filter((row) => row.probing_depth_mm !== null);
  const probingDepths = chartedSites.map((row) => row.probing_depth_mm!) as number[];
  const calValues = payload.sites
    .map((row) => row.cal_mm)
    .filter((value): value is number => value !== null);

  const expectedSiteCount = presentToothRows.length * 6;

  const assessedBop = payload.sites.filter((row) => row.bleeding_on_probing !== null);
  const bleeding = assessedBop.filter((row) => row.bleeding_on_probing === true);
  const assessedPlaque = payload.plaque.filter((row) => row.plaque_present !== null);
  const plaquePositive = assessedPlaque.filter((row) => row.plaque_present === true);

  const bandCounts: PerioPocketBand[] = [
    { label: "1–3 mm", count: probingDepths.filter((value) => value <= 3).length },
    { label: "4–5 mm", count: probingDepths.filter((value) => value >= 4 && value <= 5).length },
    { label: "≥ 6 mm", count: probingDepths.filter((value) => value >= 6).length },
  ];

  return {
    presentToothRowCount: presentToothRows.length,
    chartedSiteCount: chartedSites.length,
    expectedSiteCount,
    unknownSiteCount: Math.max(0, expectedSiteCount - chartedSites.length),
    meanProbingDepthMm: mean(probingDepths),
    maxProbingDepthMm: max(probingDepths),
    knownProbingDepthCount: probingDepths.length,
    meanCalMm: mean(calValues),
    maxCalMm: max(calValues),
    knownCalCount: calValues.length,
    bandCounts,
    // The bleeding share the server already computed is preferred when present;
    // it is the same reduction, made by the authority that owns the record.
    assessedBopSiteCount: payload.derived?.assessed_bop_site_count ?? assessedBop.length,
    bleedingSiteCount: payload.derived?.bleeding_site_count ?? bleeding.length,
    bopPercent:
      payload.derived?.bop_percent ??
      (assessedBop.length === 0 ? null : (bleeding.length / assessedBop.length) * 100),
    assessedPlaqueSurfaceCount: assessedPlaque.length,
    plaqueSurfaceCount: plaquePositive.length,
    plaquePercent: assessedPlaque.length === 0 ? null : (plaquePositive.length / assessedPlaque.length) * 100,
    maxFurcationGrade: max(payload.furcation.map((row) => row.grade)),
  };
}

function Millimetres({ value, decimals = 0 }: { value: number | null; decimals?: number }): React.ReactElement {
  if (value === null) return <NotRecorded />;
  return <span className="tabular-nums">{value.toFixed(decimals)} mm</span>;
}

function Row({
  label,
  testId,
  children,
  hint,
}: {
  label: string;
  testId: string;
  children: React.ReactNode;
  hint?: React.ReactNode;
}): React.ReactElement {
  return (
    <div data-testid={testId} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-b py-1.5 last:border-b-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium text-foreground">
        {children}
        {hint ? <span className="ml-2 text-xs font-normal text-muted-foreground">{hint}</span> : null}
      </dd>
    </div>
  );
}

/**
 * The examination's descriptive statistics. Not a KPI row and not a card grid:
 * a two-column definition list a clinician can read top to bottom.
 */
export function PeriodontalSummary({
  payload,
}: {
  payload: Pick<PeriodontalWorkspacePayload, "sites" | "plaque" | "tooth" | "furcation" | "derived">;
}): React.ReactElement {
  const stats = React.useMemo(() => summarizePeriodontalExamination(payload), [payload]);
  const derived = payload.derived;

  return (
    <section data-testid="perio-summary" aria-label="Examination summary" className="min-w-0">
      <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Examination summary
      </h4>
      <dl className="grid gap-x-8 @2xl:grid-cols-2">
        <Row label="Completeness" testId="perio-summary-completeness">
          {derived === null || derived.complete === null ? (
            <NotRecorded />
          ) : derived.complete ? (
            "Complete"
          ) : (
            "Incomplete"
          )}
          {derived !== null ? (
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              {stats.chartedSiteCount} of {stats.expectedSiteCount} sites charted
            </span>
          ) : null}
        </Row>
        <Row label="Present teeth recorded" testId="perio-summary-present-teeth">
          {derived?.present_tooth_count === null || derived === null ? (
            <NotRecorded />
          ) : (
            <span className="tabular-nums">{derived.present_tooth_count}</span>
          )}
        </Row>
        <Row
          label="Mean probing depth"
          testId="perio-summary-mean-pd"
          hint={`over ${stats.knownProbingDepthCount} recorded site${stats.knownProbingDepthCount === 1 ? "" : "s"}`}
        >
          <Millimetres value={stats.meanProbingDepthMm} decimals={1} />
        </Row>
        <Row label="Deepest probing depth" testId="perio-summary-max-pd">
          <Millimetres value={stats.maxProbingDepthMm} />
        </Row>
        <Row label="Mean attachment level" testId="perio-summary-mean-cal">
          <Millimetres value={stats.meanCalMm} decimals={1} />
        </Row>
        <Row label="Worst attachment level" testId="perio-summary-max-cal">
          <Millimetres value={stats.maxCalMm} />
        </Row>
        <Row label="Attachment level known at" testId="perio-summary-known-cal">
          <span className="tabular-nums">
            {stats.knownCalCount} of {stats.chartedSiteCount}
          </span>
          <span className="ml-2 text-xs font-normal text-muted-foreground">charted sites</span>
        </Row>
        <Row label="Bleeding on probing" testId="perio-summary-bop">
          {stats.bopPercent === null ? (
            <NotRecorded label={NOT_ASSESSED} />
          ) : (
            <span className="tabular-nums">
              {stats.bopPercent.toFixed(0)}%
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {stats.bleedingSiteCount} of {stats.assessedBopSiteCount} assessed sites
              </span>
            </span>
          )}
        </Row>
        <Row label="Plaque (O'Leary)" testId="perio-summary-plaque">
          {stats.plaquePercent === null ? (
            <NotRecorded label={NOT_ASSESSED} />
          ) : (
            <span className="tabular-nums">
              {stats.plaquePercent.toFixed(0)}%
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {stats.plaqueSurfaceCount} of {stats.assessedPlaqueSurfaceCount} assessed surfaces
              </span>
            </span>
          )}
        </Row>
        <Row label="Worst furcation (Glickman)" testId="perio-summary-max-furcation">
          {stats.maxFurcationGrade === null ? (
            <NotRecorded />
          ) : (
            <span className="tabular-nums">Grade {stats.maxFurcationGrade}</span>
          )}
        </Row>
      </dl>

      <div data-testid="perio-summary-pd-distribution" className="mt-2 border-t pt-2">
        <p className="mb-1 text-xs font-medium text-muted-foreground">Pocket depth distribution</p>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {stats.bandCounts.map((band) => (
            <li key={band.label} className="tabular-nums">
              <span className="text-muted-foreground">{band.label}</span>{" "}
              <span className="font-medium">{band.count}</span>
            </li>
          ))}
          <li className="tabular-nums text-muted-foreground">
            <span className="font-medium">{stats.unknownSiteCount}</span> not recorded
          </li>
        </ul>
      </div>
    </section>
  );
}
