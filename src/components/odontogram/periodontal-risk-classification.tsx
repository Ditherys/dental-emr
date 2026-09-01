"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  PERIO_AGE_MAX_YEARS,
  PERIO_AGE_MIN_YEARS,
  PERIO_BONE_LOSS_MAX_PERCENT,
  PERIO_BONE_LOSS_MIN_PERCENT,
  PERIO_CIGARETTES_MAX_PER_DAY,
  PERIO_CIGARETTES_MIN_PER_DAY,
  PERIO_DIABETES_STATUSES,
  PERIO_DIAGNOSES,
  PERIO_EXTENTS,
  PERIO_GRADES,
  PERIO_HBA1C_MAX_PERCENT,
  PERIO_HBA1C_MIN_PERCENT,
  PERIO_NON_STAGEABLE_DIAGNOSES,
  PERIO_REASON_MAX_LENGTH,
  PERIO_SMOKING_STATUSES,
  PERIO_STAGES,
  PERIO_TEETH_LOST_MAX,
  PERIO_TEETH_LOST_MIN,
  type PerioDiagnosis,
  type PerioExtent,
  type PerioGrade,
  type PerioStage,
} from "@/lib/odontogram/perio";
import type { PeriodontalClassification } from "@/lib/odontogram/perio";
import {
  NOT_ASSESSED,
  NOT_RECORDED,
  NotRecorded,
  type PerioClassificationPayload,
  type PerioDerivedPayload,
  type PerioRiskPayload,
} from "./periodontal-summary";

/**
 * Risk inputs, the derived 2017 classification, and the clinician's
 * confirmation.
 *
 * The single most important rule in this file: **the confirmation form is
 * seeded from `derived`, which is the server's own recomputation from the saved
 * measurements.** The optional `preview` is the browser's local derivation of
 * UNSAVED edits and is rendered only as a labelled preview. The SQL and
 * TypeScript derivations are two hand-maintained implementations of one rule
 * set and have already diverged once; if the clinician confirmed the browser
 * value and the server disagreed, they would be made to write an override
 * reason for a bug, and the permanent record would then read "clinician
 * overrode the server" when nothing was overridden. Seeding from the server
 * downgrades any future drift from a false override on a clinical record to a
 * preview that flickers until autosave lands.
 */

export type PerioConfirmationInput = {
  diagnosis: PerioDiagnosis;
  stage?: PerioStage;
  grade?: PerioGrade;
  extent?: PerioExtent;
  override_reason?: string;
};

type RiskField = keyof PerioRiskPayload;

const NON_STAGEABLE: readonly string[] = PERIO_NON_STAGEABLE_DIAGNOSES;

const controlClass =
  "h-11 w-full min-w-0 rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50";

function humanize(value: string): string {
  return value.replaceAll("_", " ").toLowerCase();
}

function Value({ children, empty = NOT_RECORDED }: { children: string | null; empty?: string }): React.ReactElement {
  if (children === null) return <NotRecorded label={empty} />;
  return <span>{children}</span>;
}

function RiskNumber({
  label,
  field,
  value,
  min,
  max,
  step,
  disabled,
  onRiskChange,
}: {
  label: string;
  field: RiskField;
  value: number | null;
  min: number;
  max: number;
  step: number;
  disabled: boolean;
  onRiskChange: (field: RiskField, value: number | null) => void;
}): React.ReactElement {
  const id = `perio-risk-${field}`;
  return (
    <div className="flex flex-col gap-0.5">
      <label htmlFor={id} className="text-[11px] font-medium text-muted-foreground">
        {label}
      </label>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        value={value === null ? "" : String(value)}
        onChange={(event) => {
          const raw = event.target.value;
          if (raw.trim() === "") {
            onRiskChange(field, null);
            return;
          }
          const parsed = Number(raw);
          if (!Number.isFinite(parsed) || parsed < min || parsed > max) return;
          onRiskChange(field, parsed);
        }}
        className={controlClass}
      />
    </div>
  );
}

function RiskSelect<T extends string>({
  label,
  field,
  value,
  options,
  disabled,
  onRiskChange,
}: {
  label: string;
  field: RiskField;
  value: T | null;
  options: readonly T[];
  disabled: boolean;
  onRiskChange: (field: RiskField, value: T | null) => void;
}): React.ReactElement {
  const id = `perio-risk-${field}`;
  return (
    <div className="flex flex-col gap-0.5">
      <label htmlFor={id} className="text-[11px] font-medium text-muted-foreground">
        {label}
      </label>
      <select
        id={id}
        disabled={disabled}
        value={value ?? ""}
        onChange={(event) => onRiskChange(field, event.target.value === "" ? null : (event.target.value as T))}
        className={controlClass}
      >
        <option value="">{NOT_RECORDED}</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {humanize(option)}
          </option>
        ))}
      </select>
    </div>
  );
}

export interface PeriodontalRiskClassificationProps {
  /** The server's recomputation. The confirmation form's only seed. */
  derived: PerioDerivedPayload | null;
  /** The browser's derivation of unsaved edits. Preview only. */
  preview: PeriodontalClassification | null;
  hasUnsavedEdits: boolean;
  /** True when at least one unsaved reading cannot be written yet, rather than
   *  merely not having been written yet. The two need different instructions:
   *  Save draft cannot help the first. */
  hasDeferredReadings?: boolean;
  confirmed: PerioClassificationPayload | null;
  risk: PerioRiskPayload;
  onRiskChange: (field: RiskField, value: string | number | null) => void;
  onConfirm: (confirmation: PerioConfirmationInput) => Promise<void> | void;
  readOnly?: boolean;
  busy?: boolean;
}

export function PeriodontalRiskClassification({
  derived,
  preview,
  hasUnsavedEdits,
  hasDeferredReadings = false,
  confirmed,
  risk,
  onRiskChange,
  onConfirm,
  readOnly = false,
  busy = false,
}: PeriodontalRiskClassificationProps): React.ReactElement {
  const [diagnosis, setDiagnosis] = React.useState<PerioDiagnosis | null>(derived?.diagnosis ?? null);
  const [stage, setStage] = React.useState<PerioStage | null>(derived?.stage ?? null);
  const [grade, setGrade] = React.useState<PerioGrade | null>(derived?.grade ?? null);
  const [extent, setExtent] = React.useState<PerioExtent | null>(derived?.extent ?? null);
  const [acknowledged, setAcknowledged] = React.useState(false);
  const [reason, setReason] = React.useState("");

  // The form is a projection of the SERVER derivation. When the server value
  // moves — after an autosave, a reload, or an amendment — the form follows it.
  const seed = `${derived?.diagnosis ?? ""}|${derived?.stage ?? ""}|${derived?.grade ?? ""}|${derived?.extent ?? ""}`;
  const [lastSeed, setLastSeed] = React.useState(seed);
  if (lastSeed !== seed) {
    setLastSeed(seed);
    setDiagnosis(derived?.diagnosis ?? null);
    setStage(derived?.stage ?? null);
    setGrade(derived?.grade ?? null);
    setExtent(derived?.extent ?? null);
  }

  const stageable = diagnosis !== null && !NON_STAGEABLE.includes(diagnosis);
  const effectiveStage = stageable ? stage : null;
  const effectiveGrade = stageable ? grade : null;
  const effectiveExtent = stageable ? extent : null;

  const differs =
    diagnosis !== (derived?.diagnosis ?? null) ||
    effectiveStage !== (derived?.stage ?? null) ||
    effectiveGrade !== (derived?.grade ?? null) ||
    effectiveExtent !== (derived?.extent ?? null);

  const signedDiffers =
    confirmed !== null &&
    confirmed.diagnosis !== null &&
    (confirmed.diagnosis !== (derived?.diagnosis ?? null) ||
      confirmed.stage !== (derived?.stage ?? null) ||
      confirmed.grade !== (derived?.grade ?? null) ||
      confirmed.extent !== (derived?.extent ?? null));

  // Finalization is append-only and immutable. An unsaved edit is not covered
  // by the optimistic-concurrency guard - it was never written, so the expected
  // version still matches and the server finalizes happily - and the reload that
  // follows replaces the draft, taking those measurements with it. The panel
  // already knows the diff exists; it must refuse rather than discard.
  const canConfirm =
    !readOnly &&
    !busy &&
    !hasUnsavedEdits &&
    acknowledged &&
    diagnosis !== null &&
    (!differs || reason.trim().length > 0);

  return (
    <section aria-label="Risk factors and classification" className="min-w-0">
      <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Risk factors
      </h4>
      <div className="grid gap-2 @md:grid-cols-2 @3xl:grid-cols-4">
        <RiskNumber
          label="Age in years"
          field="age_years_snapshot"
          value={risk.age_years_snapshot}
          min={PERIO_AGE_MIN_YEARS}
          max={PERIO_AGE_MAX_YEARS}
          step={1}
          disabled={readOnly}
          onRiskChange={onRiskChange}
        />
        <RiskSelect
          label="Smoking status"
          field="smoking_status"
          value={risk.smoking_status}
          options={PERIO_SMOKING_STATUSES}
          disabled={readOnly}
          onRiskChange={onRiskChange}
        />
        <RiskNumber
          label="Cigarettes per day"
          field="cigarettes_per_day"
          value={risk.cigarettes_per_day}
          min={PERIO_CIGARETTES_MIN_PER_DAY}
          max={PERIO_CIGARETTES_MAX_PER_DAY}
          step={1}
          disabled={readOnly}
          onRiskChange={onRiskChange}
        />
        <RiskSelect
          label="Diabetes status"
          field="diabetes_status"
          value={risk.diabetes_status}
          options={PERIO_DIABETES_STATUSES}
          disabled={readOnly}
          onRiskChange={onRiskChange}
        />
        <RiskNumber
          label="HbA1c (percent)"
          field="hba1c_percent"
          value={risk.hba1c_percent}
          min={PERIO_HBA1C_MIN_PERCENT}
          max={PERIO_HBA1C_MAX_PERCENT}
          step={0.1}
          disabled={readOnly}
          onRiskChange={onRiskChange}
        />
        <RiskNumber
          label="Teeth lost to periodontitis"
          field="teeth_lost_to_periodontitis"
          value={risk.teeth_lost_to_periodontitis}
          min={PERIO_TEETH_LOST_MIN}
          max={PERIO_TEETH_LOST_MAX}
          step={1}
          disabled={readOnly}
          onRiskChange={onRiskChange}
        />
        <RiskNumber
          label="Radiographic bone loss (percent)"
          field="radiographic_bone_loss_percent"
          value={risk.radiographic_bone_loss_percent}
          min={PERIO_BONE_LOSS_MIN_PERCENT}
          max={PERIO_BONE_LOSS_MAX_PERCENT}
          step={1}
          disabled={readOnly}
          onRiskChange={onRiskChange}
        />
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">
        An empty risk field means the fact was never recorded. It is not a zero, a &quot;never&quot; or a
        &quot;none&quot;, and the derivation treats it as unknown.
      </p>

      <h4 className="mt-4 mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Derived classification (2017 World Workshop)
      </h4>

      {derived === null ? (
        <p data-testid="perio-derived-empty" className="border-y py-3 text-sm text-muted-foreground">
          No periodontal examination has been recorded for this patient yet, so nothing has been derived. An empty
          record is not a healthy mouth.
        </p>
      ) : (
        <>
          <p data-testid="perio-derived-source" className="mb-2 text-[11px] text-muted-foreground">
            Derived by the server from the saved measurements of this examination. The browser does not compute the
            value you confirm.
          </p>
          <dl className="grid gap-x-8 border-y py-2 @2xl:grid-cols-2">
            <div data-testid="perio-derived-diagnosis" className="flex items-baseline justify-between gap-3 py-0.5">
              <dt className="text-xs text-muted-foreground">Diagnosis</dt>
              <dd className="text-sm font-medium">
                <Value>{derived.diagnosis === null ? null : humanize(derived.diagnosis)}</Value>
              </dd>
            </div>
            <div data-testid="perio-derived-stage" className="flex items-baseline justify-between gap-3 py-0.5">
              <dt className="text-xs text-muted-foreground">Stage</dt>
              <dd className="text-sm font-medium">
                <Value>{derived.stage}</Value>
              </dd>
            </div>
            <div data-testid="perio-derived-grade" className="flex items-baseline justify-between gap-3 py-0.5">
              <dt className="text-xs text-muted-foreground">Grade</dt>
              <dd className="text-sm font-medium">
                <Value>{derived.grade}</Value>
              </dd>
            </div>
            <div data-testid="perio-derived-extent" className="flex items-baseline justify-between gap-3 py-0.5">
              <dt className="text-xs text-muted-foreground">Extent</dt>
              <dd className="text-sm font-medium">
                <Value>{derived.extent === null ? null : humanize(derived.extent)}</Value>
              </dd>
            </div>
            <div data-testid="perio-derived-bop" className="flex items-baseline justify-between gap-3 py-0.5">
              <dt className="text-xs text-muted-foreground">Bleeding on probing</dt>
              <dd className="text-sm font-medium">
                {derived.bop_percent === null ? (
                  <NotRecorded label={NOT_ASSESSED} />
                ) : (
                  <span className="tabular-nums">{derived.bop_percent.toFixed(0)}%</span>
                )}
              </dd>
            </div>
          </dl>

          <ul data-testid="perio-data-limitations" className="mt-2 space-y-0.5 text-[11px] text-muted-foreground">
            <li>
              {derived.complete === null
                ? "Whether this examination is complete has not been derived."
                : derived.complete
                  ? "Every present tooth carries six charted sites with a known attachment level."
                  : "This examination is incomplete: it cannot be finalized until every present tooth carries six charted sites with a known attachment level."}
            </li>
            <li>
              {derived.teeth_with_known_interdental_cal === null || derived.present_tooth_count === null ? (
                <>
                  How many present teeth carry a known interdental attachment level: <NotRecorded />
                </>
              ) : (
                <>
                  Interdental attachment level known at{" "}
                  <span className="tabular-nums">
                    {derived.teeth_with_known_interdental_cal} of {derived.present_tooth_count}
                  </span>{" "}
                  present teeth.
                </>
              )}
            </li>
            {derived.bop_percent === null && <li>Bleeding was not assessed anywhere, so no bleeding share exists.</li>}
            {derived.stage === null && derived.diagnosis === "PERIODONTITIS" && (
              <li>Stage could not be derived: neither attachment loss nor radiographic bone loss is known.</li>
            )}
            {derived.grade === null && <li>Grade could not be derived from the recorded risk factors.</li>}
          </ul>

          {hasUnsavedEdits && preview !== null && (
            <div
              data-testid="perio-classification-preview"
              className="mt-2 border-l-2 border-warning/60 py-1 pl-2 text-[11px] text-muted-foreground"
            >
              <span className="font-medium text-foreground">Preview of unsaved edits</span> — this is not the record
              and is not what you confirm. It is the browser&apos;s own derivation and it disappears once autosave
              lands and the server re-derives.
              <span className="mt-0.5 block">
                {preview.diagnosis === null ? NOT_RECORDED : humanize(preview.diagnosis)}
                {preview.stage ? ` · stage ${preview.stage}` : ""}
                {preview.grade ? ` · grade ${preview.grade}` : ""}
                {preview.extent ? ` · ${humanize(preview.extent)}` : ""}
              </span>
            </div>
          )}

          {signedDiffers && (
            <p data-testid="perio-signed-vs-derived" className="mt-2 border-l-2 border-info/60 py-1 pl-2 text-[11px]">
              The classification signed
              {confirmed?.confirmed_at ? ` on ${confirmed.confirmed_at.slice(0, 10)}` : ""} differs from what
              today&apos;s recomputation produces from the same measurements.
              {confirmed?.override_reason
                ? " A reason was recorded at signing."
                : " No override reason was recorded, so the difference is not an intentional correction and should be reviewed."}
            </p>
          )}

          {!readOnly && (
            <div className="mt-3 border-t pt-3">
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Confirm and finalize
              </h4>
              <div className="grid gap-2 @md:grid-cols-2 @3xl:grid-cols-4">
                <div className="flex flex-col gap-0.5">
                  <label htmlFor="perio-confirm-diagnosis" className="text-[11px] font-medium text-muted-foreground">
                    Confirmed diagnosis
                  </label>
                  <select
                    id="perio-confirm-diagnosis"
                    value={diagnosis ?? ""}
                    disabled={busy}
                    onChange={(event) => setDiagnosis(event.target.value === "" ? null : (event.target.value as PerioDiagnosis))}
                    className={controlClass}
                  >
                    <option value="">{NOT_RECORDED}</option>
                    {PERIO_DIAGNOSES.map((option) => (
                      <option key={option} value={option}>
                        {humanize(option)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-0.5">
                  <label htmlFor="perio-confirm-stage" className="text-[11px] font-medium text-muted-foreground">
                    Confirmed stage
                  </label>
                  <select
                    id="perio-confirm-stage"
                    value={effectiveStage ?? ""}
                    disabled={busy || !stageable}
                    onChange={(event) => setStage(event.target.value === "" ? null : (event.target.value as PerioStage))}
                    className={controlClass}
                  >
                    <option value="">{NOT_RECORDED}</option>
                    {PERIO_STAGES.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-0.5">
                  <label htmlFor="perio-confirm-grade" className="text-[11px] font-medium text-muted-foreground">
                    Confirmed grade
                  </label>
                  <select
                    id="perio-confirm-grade"
                    value={effectiveGrade ?? ""}
                    disabled={busy || !stageable}
                    onChange={(event) => setGrade(event.target.value === "" ? null : (event.target.value as PerioGrade))}
                    className={controlClass}
                  >
                    <option value="">{NOT_RECORDED}</option>
                    {PERIO_GRADES.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-0.5">
                  <label htmlFor="perio-confirm-extent" className="text-[11px] font-medium text-muted-foreground">
                    Confirmed extent
                  </label>
                  <select
                    id="perio-confirm-extent"
                    value={effectiveExtent ?? ""}
                    disabled={busy || !stageable}
                    onChange={(event) => setExtent(event.target.value === "" ? null : (event.target.value as PerioExtent))}
                    className={controlClass}
                  >
                    <option value="">{NOT_RECORDED}</option>
                    {PERIO_EXTENTS.map((option) => (
                      <option key={option} value={option}>
                        {humanize(option)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {differs && (
                <div className="mt-2">
                  <p data-testid="perio-override-required" className="mb-1 text-[11px] text-warning">
                    Your confirmation differs from the server derivation. Record why before finalizing; the reason is
                    stored with the record.
                  </p>
                  <label htmlFor="perio-override-reason" className="text-[11px] font-medium text-muted-foreground">
                    Override reason
                  </label>
                  <textarea
                    id="perio-override-reason"
                    value={reason}
                    disabled={busy}
                    maxLength={PERIO_REASON_MAX_LENGTH}
                    onChange={(event) => setReason(event.target.value)}
                    className="mt-0.5 min-h-20 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
                  />
                </div>
              )}

              <label className="mt-2 flex min-h-11 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={acknowledged}
                  disabled={busy}
                  onChange={(event) => setAcknowledged(event.target.checked)}
                  className="size-5 rounded border-input"
                />
                I confirm this classification
              </label>

              {hasUnsavedEdits && (
                <p data-testid="perio-finalize-blocked" className="mt-2 text-[11px] text-warning">
                  {hasDeferredReadings
                    ? "A finding on this chart cannot be written yet: a periodontal site is stored by its probing depth, and one is missing. Chart the missing probing depth listed above and the finding saves with it. Saving the draft will not help, because there is nothing the save boundary can carry. Finalizing now would lock a record without that finding, and a finalized examination is corrected only by amendment."
                    : "This examination has edits that are not on the record yet. Finalizing now would lock a record without them, and a finalized examination is corrected only by amendment. Save the draft first."}
                </p>
              )}

              <Button
                type="button"
                className="mt-2 min-h-11"
                disabled={!canConfirm}
                onClick={() => {
                  if (diagnosis === null) return;
                  const confirmation: PerioConfirmationInput = { diagnosis };
                  if (effectiveStage !== null) confirmation.stage = effectiveStage;
                  if (effectiveGrade !== null) confirmation.grade = effectiveGrade;
                  if (effectiveExtent !== null) confirmation.extent = effectiveExtent;
                  if (differs) confirmation.override_reason = reason.trim();
                  void onConfirm(confirmation);
                }}
              >
                Confirm and finalize
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
