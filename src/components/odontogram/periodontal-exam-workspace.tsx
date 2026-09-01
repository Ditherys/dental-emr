"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { PERIO_SITES, type PerioSite } from "@/lib/odontogram/clinical-codes";
import {
  derivePerioClassification,
  reducePerioTooth,
  type PerioToothSitesInput,
} from "@/lib/odontogram/perio-classification";
import type { PeriodontalClassification, PeriodontalRiskInputs } from "@/lib/odontogram/perio";
import {
  PeriodontalMeasurementGrid,
  emptyPerioGridToothRow,
  type PerioGridSiteField,
  type PerioGridSurfaceField,
  type PerioGridToothField,
  type PerioGridToothRow,
} from "./periodontal-measurement-grid";
import { PeriodontalArchVisualization } from "./periodontal-arch-visualization";
import { PeriodontalComparison } from "./periodontal-comparison";
import {
  PeriodontalRiskClassification,
  type PerioConfirmationInput,
} from "./periodontal-risk-classification";
import {
  PERIO_FURCATION_ENTRANCES,
  PERIO_PLAQUE_SURFACES,
  PeriodontalSummary,
  type PerioComparisonPayload,
  type PerioExaminationKind,
  type PerioFurcationEntrance,
  type PerioPlaqueSurfaceCode,
  type PerioRiskPayload,
  type PeriodontalWorkspacePayload,
} from "./periodontal-summary";

/**
 * The one periodontal and peri-implant work surface.
 *
 * It is rebuilt on every load from `get_periodontal_workspace_v2`; no browser
 * state, renderer payload or local storage is ever canonical. Four rules run
 * through it:
 *
 * - `null` is unknown, end to end. Nothing here turns an unmeasured site into a
 *   zero, a missing bleeding answer into "no bleeding", or an unknown
 *   attachment level into the probing depth.
 * - Autosave sends only the rows that actually changed. Task 9's triggers null
 *   the whole classification block on any child UPDATE and Task 11's RPC diffs
 *   before writing, so re-sending unchanged rows would risk silently
 *   withdrawing a clinician's confirmation for no reason. An empty diff sends
 *   nothing at all.
 * - Success is never claimed early. `Saving` holds until the write resolves;
 *   a stale version becomes an actionable conflict; a transport failure becomes
 *   an offline state with a retry, never a "Saved".
 * - The classification a clinician confirms comes from the server.
 */

export type PerioBatchSiteRow = {
  tooth_fdi: string;
  site: PerioSite;
  probing_depth_mm: number;
  gingival_margin_mm?: number | null;
  bleeding_on_probing?: boolean | null;
  suppuration?: boolean | null;
  implant_context?: boolean;
};

export type PerioBatchToothRow = {
  tooth_fdi: string;
  tooth_present?: boolean;
  implant_context?: boolean;
  mobility_miller?: string | null;
  keratinized_gingiva_mm?: number | null;
  gingival_thickness_mm?: number | null;
  gingival_phenotype?: string | null;
  miller_recession_class?: string | null;
  cej_visible?: boolean | null;
  root_concavity?: boolean | null;
};

export type PerioBatchPlaqueRow = {
  tooth_fdi: string;
  surface: PerioPlaqueSurfaceCode;
  plaque_present?: boolean | null;
  plaque_index?: number | null;
  gingival_index?: number | null;
  modified_plaque_index?: number | null;
  modified_bleeding_index?: number | null;
};

export type PerioBatchFurcationRow = {
  tooth_fdi: string;
  entrance: PerioFurcationEntrance;
  grade: number;
};

export type PerioMeasurementBatch = {
  sites?: PerioBatchSiteRow[];
  plaque?: PerioBatchPlaqueRow[];
  tooth?: PerioBatchToothRow[];
  furcation?: PerioBatchFurcationRow[];
  risk?: Partial<Record<keyof PerioRiskPayload, number | string | null>>;
};

export type PerioWorkspaceOutcome =
  | { ok: true; id?: string; version?: number }
  | { ok: false; code: string };

export type PeriodontalWorkspaceHandlers = {
  load: (input: { examinationId: string | null }) => Promise<
    { ok: true; payload: PeriodontalWorkspacePayload } | { ok: false; code: string }
  >;
  createDraft: (input: {
    examinationKind: PerioExaminationKind;
    examinedAt: string | null;
  }) => Promise<PerioWorkspaceOutcome>;
  save: (input: {
    examinationId: string;
    expectedVersion: number;
    batch: PerioMeasurementBatch;
    /** Stable across a retry of the SAME batch, so a write that succeeded but
     *  whose response was lost is not applied twice. */
    attemptKey?: string;
  }) => Promise<PerioWorkspaceOutcome>;
  finalize: (input: {
    examinationId: string;
    expectedVersion: number;
    confirmation: PerioConfirmationInput;
  }) => Promise<PerioWorkspaceOutcome>;
  amend: (input: { predecessorExaminationId: string; reason: string }) => Promise<PerioWorkspaceOutcome>;
  compare: (input: { leftExaminationId: string; rightExaminationId: string }) => Promise<
    { ok: true; payload: PerioComparisonPayload } | { ok: false; code: string }
  >;
};

const UPPER_PERMANENT = ["18", "17", "16", "15", "14", "13", "12", "11", "21", "22", "23", "24", "25", "26", "27", "28"];
const LOWER_PERMANENT = ["48", "47", "46", "45", "44", "43", "42", "41", "31", "32", "33", "34", "35", "36", "37", "38"];
const DEFAULT_DENTITION: readonly string[] = [...UPPER_PERMANENT, ...LOWER_PERMANENT];

const EXAMINATION_KINDS: readonly PerioExaminationKind[] = ["INITIAL", "RE-EVALUATION", "MAINTENANCE"];

type ChartingArch = "UPPER" | "LOWER" | "BOTH";

type AutosaveStatus = "IDLE" | "PENDING" | "SAVING" | "SAVED" | "CONFLICT" | "OFFLINE" | "REFUSED";

const controlClass =
  "h-11 w-full min-w-0 rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50";

// ---------------------------------------------------------------------------
// Projection -> editable rows
// ---------------------------------------------------------------------------

function rowsFromPayload(
  payload: PeriodontalWorkspacePayload,
  dentition: readonly string[],
): Map<string, PerioGridToothRow> {
  const codes = new Set<string>(dentition);
  for (const row of payload.tooth) codes.add(row.tooth_fdi);
  for (const row of payload.sites) codes.add(row.tooth_fdi);

  const ordered = [...dentition, ...[...codes].filter((code) => !dentition.includes(code))];
  const rows = new Map<string, PerioGridToothRow>();
  for (const code of ordered) rows.set(code, emptyPerioGridToothRow(code));

  for (const row of payload.tooth) {
    const target = rows.get(row.tooth_fdi);
    if (!target) continue;
    target.present = row.tooth_present;
    target.implantContext = row.implant_context;
    target.mobilityMiller = row.mobility_miller;
    target.keratinizedGingivaMm = row.keratinized_gingiva_mm;
    target.gingivalThicknessMm = row.gingival_thickness_mm;
    target.gingivalPhenotype = row.gingival_phenotype;
    target.millerRecessionClass = row.miller_recession_class;
    target.cejVisible = row.cej_visible;
    target.rootConcavity = row.root_concavity;
  }
  for (const row of payload.sites) {
    const target = rows.get(row.tooth_fdi);
    if (!target) continue;
    target.sites[row.site] = {
      probingDepthMm: row.probing_depth_mm,
      gingivalMarginMm: row.gingival_margin_mm,
      bleedingOnProbing: row.bleeding_on_probing,
      suppuration: row.suppuration,
    };
    if (row.implant_context === true) target.implantContext = true;
  }
  for (const row of payload.plaque) {
    const target = rows.get(row.tooth_fdi);
    if (!target) continue;
    target.surfaces[row.surface] = {
      plaquePresent: row.plaque_present,
      plaqueIndex: row.plaque_index,
      gingivalIndex: row.gingival_index,
      modifiedPlaqueIndex: row.modified_plaque_index,
      modifiedBleedingIndex: row.modified_bleeding_index,
    };
  }
  for (const row of payload.furcation) {
    const target = rows.get(row.tooth_fdi);
    if (!target) continue;
    target.furcation[row.entrance] = row.grade;
  }
  return rows;
}

function cloneRows(rows: ReadonlyMap<string, PerioGridToothRow>): Map<string, PerioGridToothRow> {
  const next = new Map<string, PerioGridToothRow>();
  for (const [code, row] of rows) {
    next.set(code, {
      ...row,
      sites: Object.fromEntries(Object.entries(row.sites).map(([key, value]) => [key, { ...value! }])) as PerioGridToothRow["sites"],
      surfaces: Object.fromEntries(
        Object.entries(row.surfaces).map(([key, value]) => [key, { ...value! }]),
      ) as PerioGridToothRow["surfaces"],
      furcation: { ...row.furcation },
    });
  }
  return next;
}

const TOOTH_FIELD_KEYS: Record<Exclude<PerioGridToothField, "present" | "implantContext">, keyof PerioBatchToothRow> = {
  mobilityMiller: "mobility_miller",
  keratinizedGingivaMm: "keratinized_gingiva_mm",
  gingivalThicknessMm: "gingival_thickness_mm",
  gingivalPhenotype: "gingival_phenotype",
  millerRecessionClass: "miller_recession_class",
  cejVisible: "cej_visible",
  rootConcavity: "root_concavity",
};

const SURFACE_FIELD_KEYS: Record<PerioGridSurfaceField, keyof PerioBatchPlaqueRow> = {
  plaquePresent: "plaque_present",
  plaqueIndex: "plaque_index",
  gingivalIndex: "gingival_index",
  modifiedPlaqueIndex: "modified_plaque_index",
  modifiedBleedingIndex: "modified_bleeding_index",
};

/**
 * The diff that keeps autosave honest.
 *
 * A field is sent only when its current value DIFFERS from the last projection
 * the server gave us and is itself known. An unchanged row is never re-sent, so
 * the RPC's own diff never sees a statement that could reset the classification
 * block for nothing. A known value cleared back to unknown is not expressible
 * on this boundary and is refused at the point of edit, not silently dropped
 * here.
 */
export function buildPeriodontalBatch(
  baseline: ReadonlyMap<string, PerioGridToothRow>,
  draft: ReadonlyMap<string, PerioGridToothRow>,
  baselineRisk: PerioRiskPayload,
  draftRisk: PerioRiskPayload,
): PerioMeasurementBatch {
  const sites: PerioBatchSiteRow[] = [];
  const tooth: PerioBatchToothRow[] = [];
  const plaque: PerioBatchPlaqueRow[] = [];
  const furcation: PerioBatchFurcationRow[] = [];

  for (const [code, current] of draft) {
    const base = baseline.get(code) ?? emptyPerioGridToothRow(code);

    for (const site of PERIO_SITES) {
      const now = current.sites[site];
      const was = base.sites[site];
      if (!now || now.probingDepthMm === null) continue;
      const row: PerioBatchSiteRow = { tooth_fdi: code, site, probing_depth_mm: now.probingDepthMm };
      let changed = now.probingDepthMm !== (was?.probingDepthMm ?? null);
      // A field is sent when it DIFFERS from the baseline, whether the new
      // value is a reading or an explicit null. Null is a withdrawal the
      // boundary understands through key presence; an unchanged field is still
      // never re-sent. A site that has no baseline row at all sends no null,
      // because the INSERT already stores unknown as NULL.
      if (was !== undefined || now.gingivalMarginMm !== null) {
        if (now.gingivalMarginMm !== (was?.gingivalMarginMm ?? null)) {
          row.gingival_margin_mm = now.gingivalMarginMm;
          changed = true;
        }
      }
      if (was !== undefined || now.bleedingOnProbing !== null) {
        if (now.bleedingOnProbing !== (was?.bleedingOnProbing ?? null)) {
          row.bleeding_on_probing = now.bleedingOnProbing;
          changed = true;
        }
      }
      if (was !== undefined || now.suppuration !== null) {
        if (now.suppuration !== (was?.suppuration ?? null)) {
          row.suppuration = now.suppuration;
          changed = true;
        }
      }
      if (changed) sites.push(row);
    }

    const toothRow: PerioBatchToothRow = { tooth_fdi: code };
    let toothChanged = false;
    if (current.present !== null && current.present !== base.present) {
      toothRow.tooth_present = current.present;
      toothChanged = true;
    }
    if (current.implantContext !== null && current.implantContext !== base.implantContext) {
      toothRow.implant_context = current.implantContext;
      toothChanged = true;
    }
    for (const [field, key] of Object.entries(TOOTH_FIELD_KEYS) as [
      keyof typeof TOOTH_FIELD_KEYS,
      keyof PerioBatchToothRow,
    ][]) {
      const now = current[field];
      const was = base[field];
      if (now !== was) {
        (toothRow as Record<string, unknown>)[key] = now;
        toothChanged = true;
      }
    }

    for (const surface of PERIO_PLAQUE_SURFACES) {
      const now = current.surfaces[surface];
      const was = base.surfaces[surface];
      if (!now) continue;
      const row: PerioBatchPlaqueRow = { tooth_fdi: code, surface };
      let changed = false;
      for (const [field, key] of Object.entries(SURFACE_FIELD_KEYS) as [
        PerioGridSurfaceField,
        keyof PerioBatchPlaqueRow,
      ][]) {
        const value = now[field];
        if ((was !== undefined || value !== null) && value !== (was?.[field] ?? null)) {
          (row as Record<string, unknown>)[key] = value;
          changed = true;
        }
      }
      if (changed) plaque.push(row);
    }

    for (const entrance of PERIO_FURCATION_ENTRANCES) {
      const now = current.furcation[entrance] ?? null;
      const was = base.furcation[entrance] ?? null;
      if (now !== null && now !== was) furcation.push({ tooth_fdi: code, entrance, grade: now });
    }

    // A surface index or a furcation grade needs its tooth row to exist first,
    // so a tooth this batch writes those for and that has no row yet gets a
    // minimal one. A site does not need it: the site row carries its own
    // presence flag.
    //
    // "Has a stored row" is read off the two NOT NULL columns, not off
    // `baseline.has(code)`: the baseline map is seeded with a blank row for
    // every tooth in the dentition, so `has` is always true and would make this
    // guard permanently inert. `tooth_present` and `implant_context` are NOT
    // NULL in the schema, so they are non-null in the projection exactly when a
    // row exists.
    const baselineHasToothRow = base.present !== null || base.implantContext !== null;
    const needsToothRow =
      !toothChanged &&
      !baselineHasToothRow &&
      (plaque.some((row) => row.tooth_fdi === code) || furcation.some((row) => row.tooth_fdi === code));
    if (toothChanged || needsToothRow) tooth.push(toothRow);
  }

  const risk: Partial<Record<keyof PerioRiskPayload, number | string | null>> = {};
  let riskChanged = false;
  for (const key of Object.keys(draftRisk) as (keyof PerioRiskPayload)[]) {
    const now = draftRisk[key];
    if (now !== baselineRisk[key]) {
      risk[key] = now;
      riskChanged = true;
    }
  }

  const batch: PerioMeasurementBatch = {};
  if (sites.length > 0) batch.sites = sites;
  if (plaque.length > 0) batch.plaque = plaque;
  if (tooth.length > 0) batch.tooth = tooth;
  if (furcation.length > 0) batch.furcation = furcation;
  if (riskChanged) batch.risk = risk;
  return batch;
}

function batchIsEmpty(batch: PerioMeasurementBatch): boolean {
  return Object.keys(batch).length === 0;
}

/** A request key, not a secret. WebCrypto where it exists; a v4-shaped
 *  fallback otherwise so a test or an older runtime still gets a key. */
function newRequestKey(): string {
  const webCrypto = globalThis.crypto;
  if (webCrypto && typeof webCrypto.randomUUID === "function") return webCrypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const random = Math.trunc(Math.random() * 16);
    return (character === "x" ? random : (random & 0x3) | 0x8).toString(16);
  });
}

const EMPTY_RISK: PerioRiskPayload = {
  age_years_snapshot: null,
  smoking_status: null,
  cigarettes_per_day: null,
  diabetes_status: null,
  hba1c_percent: null,
  teeth_lost_to_periodontitis: null,
  radiographic_bone_loss_percent: null,
};

function localPreview(
  rows: ReadonlyMap<string, PerioGridToothRow>,
  risk: PerioRiskPayload,
  furcationMax: number | null,
): PeriodontalClassification {
  const teeth = [...rows.values()]
    .filter((row) => row.present !== null || Object.keys(row.sites).length > 0)
    .map((row) => {
      const input: PerioToothSitesInput = {
        fdi: Number(row.toothFdi),
        present: row.present !== false,
        implantContext: row.implantContext === true,
        sites: Object.fromEntries(
          (Object.entries(row.sites) as [PerioSite, PerioGridToothRow["sites"][PerioSite]][]).map(
            ([site, reading]) => [
              site,
              {
                probingDepthMm: reading?.probingDepthMm ?? null,
                gingivalMarginMm: reading?.gingivalMarginMm ?? null,
                bleedingOnProbing: reading?.bleedingOnProbing ?? null,
              },
            ],
          ),
        ),
      };
      return reducePerioTooth(input);
    });

  const riskInputs: PeriodontalRiskInputs = {
    ageYearsSnapshot: risk.age_years_snapshot,
    smokingStatus: risk.smoking_status,
    cigarettesPerDay: risk.cigarettes_per_day,
    diabetesStatus: risk.diabetes_status,
    hba1cPercent: risk.hba1c_percent,
    teethLostToPeriodontitis: risk.teeth_lost_to_periodontitis,
    radiographicBoneLossPercent: risk.radiographic_bone_loss_percent,
  };

  return derivePerioClassification({ teeth, maxFurcationGrade: furcationMax, risk: riskInputs }).classification;
}

// ---------------------------------------------------------------------------

export interface PeriodontalExamWorkspaceProps {
  patientId: string;
  actingBranchId: string;
  canWriteClinical: boolean;
  canCorrect?: boolean;
  handlers: PeriodontalWorkspaceHandlers;
  initialPayload?: PeriodontalWorkspacePayload;
  dentition?: readonly string[];
  autosaveDelayMs?: number;
}

export function PeriodontalExamWorkspace({
  patientId,
  actingBranchId,
  canWriteClinical,
  canCorrect = false,
  handlers,
  initialPayload,
  dentition = DEFAULT_DENTITION,
  autosaveDelayMs = 900,
}: PeriodontalExamWorkspaceProps): React.ReactElement {
  const [payload, setPayload] = React.useState<PeriodontalWorkspacePayload | null>(initialPayload ?? null);
  const [loading, setLoading] = React.useState(initialPayload === undefined);
  const [loadError, setLoadError] = React.useState<string | null>(null);

  const [baseline, setBaseline] = React.useState<Map<string, PerioGridToothRow>>(() =>
    initialPayload ? rowsFromPayload(initialPayload, dentition) : new Map(),
  );
  const [draft, setDraft] = React.useState<Map<string, PerioGridToothRow>>(() =>
    initialPayload ? rowsFromPayload(initialPayload, dentition) : new Map(),
  );
  const [baselineRisk, setBaselineRisk] = React.useState<PerioRiskPayload>(
    initialPayload?.examination?.risk ?? EMPTY_RISK,
  );
  const [draftRisk, setDraftRisk] = React.useState<PerioRiskPayload>(
    initialPayload?.examination?.risk ?? EMPTY_RISK,
  );
  const [version, setVersion] = React.useState<number>(initialPayload?.examination?.version ?? 0);

  const [revision, setRevision] = React.useState(0);
  const [status, setStatus] = React.useState<AutosaveStatus>("IDLE");
  const [failureCode, setFailureCode] = React.useState<string | null>(null);
  const [refusal, setRefusal] = React.useState<string | null>(null);

  const [chartingArch, setChartingArch] = React.useState<ChartingArch>("UPPER");
  const [kind, setKind] = React.useState<PerioExaminationKind>("INITIAL");
  const [examinedAtLocal, setExaminedAtLocal] = React.useState("");
  const [starting, setStarting] = React.useState(false);
  const [amendOpen, setAmendOpen] = React.useState(false);
  const [amendReason, setAmendReason] = React.useState("");
  const [amending, setAmending] = React.useState(false);
  const [comparison, setComparison] = React.useState<PerioComparisonPayload | null>(null);
  const [comparisonError, setComparisonError] = React.useState<string | null>(null);

  // The request key names one autosave ATTEMPT. It survives a retry of the same
  // batch, so a write that landed but whose response was lost is recognised by
  // the server rather than applied twice, and it is replaced once a batch is
  // accepted.
  const [attemptKey, setAttemptKey] = React.useState(() => newRequestKey());
  const [attemptedRevision, setAttemptedRevision] = React.useState(0);

  const examination = payload?.examination ?? null;
  const readOnly = !canWriteClinical || examination === null || examination.status === "FINAL";

  const adopt = React.useCallback(
    (next: PeriodontalWorkspacePayload) => {
      setPayload(next);
      const rows = rowsFromPayload(next, dentition);
      setBaseline(rows);
      setDraft(cloneRows(rows));
      setBaselineRisk(next.examination?.risk ?? EMPTY_RISK);
      setDraftRisk(next.examination?.risk ?? EMPTY_RISK);
      setVersion(next.examination?.version ?? 0);
      setAttemptKey(newRequestKey());
      setAttemptedRevision(0);
      setStatus("IDLE");
      setFailureCode(null);
      setRefusal(null);
    },
    [dentition],
  );

  const reload = React.useCallback(
    async (examinationId: string | null) => {
      setLoading(true);
      setLoadError(null);
      try {
        const result = await handlers.load({ examinationId });
        if (result.ok) adopt(result.payload);
        else setLoadError("The periodontal record could not be loaded.");
      } catch {
        setLoadError("The periodontal record could not be loaded.");
      } finally {
        setLoading(false);
      }
    },
    [adopt, handlers],
  );

  const mounted = React.useRef(false);
  React.useEffect(() => {
    if (mounted.current || initialPayload !== undefined) return;
    mounted.current = true;
    let cancelled = false;
    // Every state update happens after the await, so the effect body itself
    // synchronises with the server rather than driving a cascading render.
    void (async () => {
      let next: PeriodontalWorkspacePayload | null = null;
      let failed = false;
      try {
        const result = await handlers.load({ examinationId: null });
        if (result.ok) next = result.payload;
        else failed = true;
      } catch {
        failed = true;
      }
      if (cancelled) return;
      if (next) adopt(next);
      if (failed) setLoadError("The periodontal record could not be loaded.");
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [adopt, handlers, initialPayload]);


  const batch = React.useMemo(
    () => buildPeriodontalBatch(baseline, draft, baselineRisk, draftRisk),
    [baseline, draft, baselineRisk, draftRisk],
  );
  const hasUnsavedEdits = !batchIsEmpty(batch);

  const flush = React.useCallback(async () => {
    if (readOnly || examination === null || status === "SAVING") return;
    // The single place a no-op is stopped: an empty diff is not a write.
    if (batchIsEmpty(batch)) return;
    setStatus("SAVING");
    setFailureCode(null);
    try {
      const result = await handlers.save({
        examinationId: examination.id,
        expectedVersion: version,
        batch,
        attemptKey,
      });
      if (result.ok) {
        setBaseline(cloneRows(draft));
        setBaselineRisk(draftRisk);
        if (typeof result.version === "number") setVersion(result.version);
        setAttemptKey(newRequestKey());
        setStatus("SAVED");
        return;
      }
      if (result.code === "STALE_VERSION" || result.code === "CONFLICT") {
        setStatus("CONFLICT");
        return;
      }
      setFailureCode(result.code);
      setStatus("OFFLINE");
    } catch {
      setStatus("OFFLINE");
    }
  }, [attemptKey, batch, draft, draftRisk, examination, handlers, readOnly, status, version]);

  // Autosave fires once per BATCH OF EDITS, after a bounded debounce. It is
  // gated on the revision it has already attempted, so a failed write is never
  // retried automatically: an offline or conflicting save waits for the
  // clinician, which is why neither state can spin.
  React.useEffect(() => {
    if (readOnly || revision === 0 || revision === attemptedRevision) return;
    const timer = setTimeout(() => {
      setAttemptedRevision(revision);
      void flush();
    }, autosaveDelayMs);
    return () => clearTimeout(timer);
  }, [attemptedRevision, autosaveDelayMs, flush, readOnly, revision]);

  const touch = React.useCallback(() => {
    setRevision((current) => current + 1);
    setStatus((current) => (current === "SAVING" ? current : "PENDING"));
  }, []);

  // Unknown is writable in both directions for every NULLABLE column: an
  // explicit null is sent and clears the stored value. The four columns below
  // are NOT NULL in the canonical schema, so withdrawing one of them would be a
  // row deletion, and no boundary deletes. Those, and only those, are refused
  // at the point of edit rather than silently dropped from the batch.
  const refuseWithdrawal = React.useCallback((what: string) => {
    setRefusal(
      `${what} is recorded as a NOT NULL value and cannot be withdrawn from a draft: removing it would delete the row, and no periodontal boundary deletes. Correct it to the right value, or finalize and amend the record.`,
    );
  }, []);

  const mutate = React.useCallback(
    (toothFdi: string, apply: (row: PerioGridToothRow) => void) => {
      setDraft((current) => {
        const next = cloneRows(current);
        const row = next.get(toothFdi);
        if (!row) return current;
        apply(row);
        return next;
      });
      touch();
    },
    [touch],
  );

  const onSiteChange = React.useCallback(
    (toothFdi: string, site: PerioSite, field: PerioGridSiteField, value: number | boolean | null) => {
      const persisted = baseline.get(toothFdi)?.sites[site]?.[field] ?? null;
      if (value === null && persisted !== null && field === "probingDepthMm") {
        refuseWithdrawal(`The probing depth at tooth ${toothFdi} ${site}`);
        return;
      }
      setRefusal(null);
      mutate(toothFdi, (row) => {
        const reading = row.sites[site] ?? {
          probingDepthMm: null,
          gingivalMarginMm: null,
          bleedingOnProbing: null,
          suppuration: null,
        };
        row.sites[site] = { ...reading, [field]: value } as typeof reading;
      });
    },
    [baseline, mutate, refuseWithdrawal],
  );

  const onToothChange = React.useCallback(
    (toothFdi: string, field: PerioGridToothField, value: string | number | boolean | null) => {
      const persisted = (baseline.get(toothFdi)?.[field] ?? null) as unknown;
      if (value === null && persisted !== null && (field === "present" || field === "implantContext")) {
        refuseWithdrawal(`The recorded ${field === "present" ? "presence" : "natural or implant context"} of tooth ${toothFdi}`);
        return;
      }
      setRefusal(null);
      mutate(toothFdi, (row) => {
        (row as Record<string, unknown>)[field] = value;
      });
    },
    [baseline, mutate, refuseWithdrawal],
  );

  const onSurfaceChange = React.useCallback(
    (
      toothFdi: string,
      surface: PerioPlaqueSurfaceCode,
      field: PerioGridSurfaceField,
      value: number | boolean | null,
    ) => {
      setRefusal(null);
      mutate(toothFdi, (row) => {
        const reading = row.surfaces[surface] ?? {
          plaquePresent: null,
          plaqueIndex: null,
          gingivalIndex: null,
          modifiedPlaqueIndex: null,
          modifiedBleedingIndex: null,
        };
        row.surfaces[surface] = { ...reading, [field]: value } as typeof reading;
      });
    },
    // Every surface column is nullable, so a withdrawal here is an ordinary
    // write and there is nothing to refuse against the baseline.
    [mutate],
  );

  const onFurcationChange = React.useCallback(
    (toothFdi: string, entrance: PerioFurcationEntrance, grade: number | null) => {
      const persisted = baseline.get(toothFdi)?.furcation[entrance] ?? null;
      if (grade === null && persisted !== null) {
        refuseWithdrawal(`The ${entrance} furcation grade at tooth ${toothFdi}`);
        return;
      }
      setRefusal(null);
      mutate(toothFdi, (row) => {
        row.furcation[entrance] = grade;
      });
    },
    [baseline, mutate, refuseWithdrawal],
  );

  const onRiskChange = React.useCallback(
    (field: keyof PerioRiskPayload, value: string | number | null) => {
      setRefusal(null);
      setDraftRisk((current) => {
        const next = { ...current, [field]: value } as PerioRiskPayload;
        // perio_exam_cigarettes_current_smoker_check requires a cigarette count
        // to belong to a current smoker. Leaving a stale count behind when the
        // status stops being CURRENT would be refused by the database with an
        // error the clinician cannot act on, and the count would be a claim
        // about a status no longer recorded. It clears with the status.
        if (field === "smoking_status" && value !== "CURRENT") next.cigarettes_per_day = null;
        return next;
      });
      touch();
    },
    [touch],
  );

  const startExamination = async () => {
    setStarting(true);
    try {
      const examinedAt = examinedAtLocal === "" ? null : new Date(examinedAtLocal).toISOString();
      const result = await handlers.createDraft({ examinationKind: kind, examinedAt });
      if (result.ok && result.id) await reload(result.id);
      else if (!result.ok) setLoadError("The periodontal draft could not be opened.");
    } catch {
      setLoadError("The periodontal draft could not be opened.");
    } finally {
      setStarting(false);
    }
  };

  const finalizeExamination = async (confirmation: PerioConfirmationInput) => {
    if (examination === null) return;
    const result = await handlers.finalize({
      examinationId: examination.id,
      expectedVersion: version,
      confirmation,
    });
    if (result.ok) await reload(examination.id);
    else if (result.code === "STALE_VERSION") setStatus("CONFLICT");
    else setFailureCode(result.code);
  };

  const createAmendment = async () => {
    if (examination === null) return;
    setAmending(true);
    try {
      const result = await handlers.amend({
        predecessorExaminationId: examination.id,
        reason: amendReason.trim(),
      });
      if (result.ok && result.id) {
        setAmendOpen(false);
        setAmendReason("");
        await reload(result.id);
      } else if (!result.ok) {
        setFailureCode(result.code);
      }
    } finally {
      setAmending(false);
    }
  };

  const runComparison = async (input: { leftExaminationId: string; rightExaminationId: string }) => {
    setComparisonError(null);
    try {
      const result = await handlers.compare(input);
      if (result.ok) setComparison(result.payload);
      else {
        setComparison(null);
        setComparisonError("The two examinations could not be compared.");
      }
    } catch {
      setComparison(null);
      setComparisonError("The two examinations could not be compared.");
    }
  };

  const teeth = React.useMemo(() => [...draft.values()], [draft]);
  const chartingTeeth = React.useMemo(
    () =>
      teeth.filter((row) =>
        chartingArch === "BOTH"
          ? true
          : chartingArch === "UPPER"
            ? UPPER_PERMANENT.includes(row.toothFdi)
            : LOWER_PERMANENT.includes(row.toothFdi),
      ),
    [chartingArch, teeth],
  );

  const maxFurcation = React.useMemo(() => {
    const grades = (payload?.furcation ?? []).map((row) => row.grade);
    return grades.length === 0 ? null : Math.max(...grades);
  }, [payload]);

  const preview = React.useMemo(
    () => (hasUnsavedEdits ? localPreview(draft, draftRisk, maxFurcation) : null),
    [draft, draftRisk, hasUnsavedEdits, maxFurcation],
  );

  const statusText =
    status === "SAVING"
      ? "Saving…"
      : status === "SAVED"
        ? "Saved"
        : status === "PENDING"
          ? "Unsaved edits"
          : status === "CONFLICT"
            ? "Conflict — nothing was written"
            : status === "OFFLINE"
              ? `Offline — nothing was written${failureCode ? ` (${failureCode})` : ""}`
              : hasUnsavedEdits
                ? "Unsaved edits"
                : "Up to date";

  return (
    <div
      data-testid="perio-exam-workspace"
      data-patient-id={patientId}
      data-branch-id={actingBranchId}
      data-examination-id={examination?.id}
      className="@container flex w-full min-w-0 flex-col gap-4"
    >
      {loadError && (
        <p role="alert" className="border-y py-2 text-sm text-destructive">
          {loadError}
        </p>
      )}

      {examination && (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b pb-2">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <StatusBadge variant={examination.status === "FINAL" ? "success" : "warning"}>
              {examination.status}
            </StatusBadge>
            <span>{examination.examination_kind}</span>
            <span>
              Examined{" "}
              {examination.examined_at ? examination.examined_at.slice(0, 10) : examination.recorded_at.slice(0, 10)}
            </span>
            <span>v{version}</span>
            {examination.finalized_at && <span>Finalized {examination.finalized_at.slice(0, 10)}</span>}
            {examination.predecessor_examination_id && <span>Amendment</span>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {(payload?.timeline.length ?? 0) > 1 && (
              <label htmlFor="perio-open-exam" className="flex items-center gap-1 text-xs text-muted-foreground">
                Open examination
                <select
                  id="perio-open-exam"
                  value={examination.id}
                  disabled={loading}
                  onChange={(event) => void reload(event.target.value)}
                  className={`${controlClass} min-w-56`}
                >
                  {(payload?.timeline ?? []).map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.recorded_at.slice(0, 10)} · {entry.examination_kind} · {entry.status} · v{entry.version}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <span
              data-testid="perio-autosave-status"
              role="status"
              aria-live="polite"
              className="text-xs text-muted-foreground"
            >
              {statusText}
            </span>
            {!readOnly && (
              <Button type="button" variant="outline" className="min-h-11" onClick={() => void flush()}>
                Save draft
              </Button>
            )}
            {status === "OFFLINE" && (
              <Button type="button" variant="outline" className="min-h-11" onClick={() => void flush()}>
                Retry
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              disabled={loading}
              onClick={() => void reload(examination.id)}
            >
              Reload
            </Button>
          </div>
        </div>
      )}

      {status === "CONFLICT" && (
        <div data-testid="perio-conflict" role="alert" className="border-y border-destructive/40 py-2 text-sm">
          <p className="text-destructive">
            Save conflict — another clinician has changed this examination since it was loaded, so nothing you typed
            here has been saved.
          </p>
          <Button
            type="button"
            variant="outline"
            className="mt-2 min-h-11"
            onClick={() => void reload(examination?.id ?? null)}
          >
            Reload from the server
          </Button>
          <p className="mt-1 text-xs text-muted-foreground">
            Reloading shows their version and discards the edits on this screen. Note anything you still need before
            reloading.
          </p>
        </div>
      )}

      {refusal && (
        <p data-testid="perio-withdraw-refused" role="alert" className="border-y py-2 text-sm text-destructive">
          {refusal}
        </p>
      )}

      {examination === null ? (
        <p data-testid="perio-exam-empty" className="border-y py-3 text-sm text-muted-foreground">
          No periodontal examination has been recorded for this patient. Nothing here is a finding of health; it is
          the absence of an examination.
        </p>
      ) : null}

      {canWriteClinical && (examination === null || examination.status === "FINAL") && (
        <div className="flex flex-wrap items-end gap-3 border-b pb-3">
          <div className="flex flex-col gap-0.5">
            <label htmlFor="perio-new-kind" className="text-[11px] font-medium text-muted-foreground">
              Examination type
            </label>
            <select
              id="perio-new-kind"
              value={kind}
              onChange={(event) => setKind(event.target.value as PerioExaminationKind)}
              className={`${controlClass} min-w-44`}
            >
              {EXAMINATION_KINDS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-0.5">
            <label htmlFor="perio-new-date" className="text-[11px] font-medium text-muted-foreground">
              Examination date and time
            </label>
            <input
              id="perio-new-date"
              type="datetime-local"
              value={examinedAtLocal}
              onChange={(event) => setExaminedAtLocal(event.target.value)}
              className={`${controlClass} min-w-56`}
            />
          </div>
          <Button type="button" className="min-h-11" disabled={starting} onClick={() => void startExamination()}>
            Start new examination
          </Button>
        </div>
      )}

      {examination && (
        <>
          <section aria-label="Six-site measurements" className="min-w-0">
            <div className="mb-2 flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-0.5">
                <label htmlFor="perio-charting-arch" className="text-[11px] font-medium text-muted-foreground">
                  Charting arch
                </label>
                <select
                  id="perio-charting-arch"
                  value={chartingArch}
                  onChange={(event) => setChartingArch(event.target.value as ChartingArch)}
                  className={`${controlClass} min-w-40`}
                >
                  <option value="UPPER">Maxilla</option>
                  <option value="LOWER">Mandible</option>
                  <option value="BOTH">Both arches</option>
                </select>
              </div>
            </div>
            <PeriodontalMeasurementGrid
              caption={
                chartingArch === "UPPER" ? "Maxilla" : chartingArch === "LOWER" ? "Mandible" : "Both arches"
              }
              teeth={chartingTeeth}
              readOnly={readOnly}
              onSiteChange={onSiteChange}
              onToothChange={onToothChange}
              onSurfaceChange={onSurfaceChange}
              onFurcationChange={onFurcationChange}
            />
          </section>

          <PeriodontalArchVisualization teeth={teeth} />

          {payload && <PeriodontalSummary payload={payload} />}
          {hasUnsavedEdits && (
            <p className="text-[11px] text-muted-foreground">
              The summary above reflects the saved record. Edits on this screen appear in it once autosave lands.
            </p>
          )}

          <PeriodontalRiskClassification
            derived={payload?.derived ?? null}
            preview={preview}
            hasUnsavedEdits={hasUnsavedEdits}
            confirmed={examination.confirmed}
            risk={draftRisk}
            onRiskChange={onRiskChange}
            onConfirm={finalizeExamination}
            readOnly={readOnly}
          />

          {examination.status === "FINAL" && canWriteClinical && canCorrect && (
            <section aria-label="Amend examination" className="min-w-0 border-t pt-3">
              {!amendOpen ? (
                <Button type="button" variant="outline" className="min-h-11" onClick={() => setAmendOpen(true)}>
                  Amend this examination
                </Button>
              ) : (
                <div className="flex flex-col gap-2">
                  <label htmlFor="perio-amend-reason" className="text-[11px] font-medium text-muted-foreground">
                    Amendment reason
                  </label>
                  <textarea
                    id="perio-amend-reason"
                    value={amendReason}
                    onChange={(event) => setAmendReason(event.target.value)}
                    className="min-h-20 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    A finalized examination is never edited. The amendment opens a new draft that supersedes this
                    record while leaving it readable.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      className="min-h-11"
                      disabled={amending || amendReason.trim().length === 0}
                      onClick={() => void createAmendment()}
                    >
                      Create amendment
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-11"
                      disabled={amending}
                      onClick={() => setAmendOpen(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </section>
          )}

          <PeriodontalComparison
            timeline={payload?.timeline ?? []}
            onCompare={runComparison}
            result={comparison}
            error={comparisonError}
          />
        </>
      )}
    </div>
  );
}
