"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  TREATMENT_EVENT_CODES,
  TREATMENT_ORTHODONTIC_APPLIANCES,
  TREATMENT_ORTHODONTIC_MOVEMENTS,
  TREATMENT_RESTORATION_MATERIALS,
  TREATMENT_RESTORATION_TYPES,
  TREATMENT_ROOT_CANAL_STATES,
  allowedSurfacesForToothCodes,
  findingIsResolvableBy,
  treatmentAllowsSurfaces,
  treatmentRequiresSurfaces,
  type ToothSurfaceCode,
  type TreatmentEventCode,
} from "@/lib/odontogram/clinical-codes";
import { recordTreatmentEventAction } from "@/app/(emr)/patients/[patientId]/odontogram-actions";

import { ProcedureChargeConfirmation, formatCentavos } from "./procedure-charge-confirmation";

const TREATMENT_LABELS: Readonly<Record<TreatmentEventCode, string>> = {
  RESTORATION: "Restoration",
  ROOT_CANAL: "Root canal",
  TOOTH_STATE: "Extraction",
  SEALANT: "Sealant",
  IMPLANT: "Implant",
  ORTHODONTIC: "Orthodontic",
  OTHER: "Other",
};

const SURFACE_LABELS: Readonly<Record<ToothSurfaceCode, string>> = {
  O: "Occlusal",
  I: "Incisal",
  B: "Buccal",
  L: "Lingual",
  M: "Mesial",
  D: "Distal",
  F: "Facial",
};

const LIFECYCLE_OPTIONS = [
  { value: "PERFORMED", label: "Start / performed" },
  { value: "FOLLOW_UP", label: "Follow-up / adjustment" },
  { value: "COMPLETED", label: "Complete" },
] as const;

type LifecycleIntent = (typeof LIFECYCLE_OPTIONS)[number]["value"];

export type TreatmentProcedureChoice = { procedureId: string; name: string };
export type ResolvableFinding = {
  entryId: string;
  toothCode: string;
  findingCode: string;
  label: string;
};
export type TreatmentPlanItemChoice = {
  planItemId: string;
  procedureCaseId: string;
  caseVersion: number;
  procedureId: string;
  toothCode: string;
  label: string;
};
export type ExistingProcedureCaseChoice = {
  procedureCaseId: string;
  caseVersion: number;
  procedureId: string;
  label: string;
};
export type TreatmentPaymentMethodChoice = { paymentMethodId: string; name: string };

export type TreatmentEventFormProps = {
  patientId: string;
  branchId: string;
  /** How the patient is identified on paper, for the confirmation dialog. */
  patientIdentifier: string;
  toothCodes: readonly string[];
  serviceDate: string;
  onServiceDateChange: (next: string) => void;
  procedures: readonly TreatmentProcedureChoice[];
  activeFindings: readonly ResolvableFinding[];
  planItems: readonly TreatmentPlanItemChoice[];
  openCases: readonly ExistingProcedureCaseChoice[];
  paymentMethods: readonly TreatmentPaymentMethodChoice[];
  onRecorded: () => void | Promise<void>;
};

type TreatmentDetail = Readonly<Record<string, unknown>> & { code: string };

type SubmittedFacts = {
  patientId: string;
  branchId: string;
  procedureId: string;
  planItemId: string | null;
  existingCaseId: string | null;
  expectedCaseVersion: number | null;
  eventKind: LifecycleIntent;
  serviceDate: string;
  resolvedFindingIds: string[];
  clinicalDetail: {
    toothCodes: string[];
    surfaces?: ToothSurfaceCode[];
    detail: TreatmentDetail;
    note?: string;
  };
  chargeAmountCentavos: number | null;
  immediatePayment: {
    paymentMethodId: string;
    amountCentavos: number;
    paymentDate: string;
    reference?: string;
  } | null;
  installmentSchedule: { dueDate: string; expectedCentavos: string }[] | null;
};

/**
 * The request key is a hash of the facts being submitted, never a token rotated
 * on a DOM event.
 *
 * That distinction decides whether an ambiguous failure is safe. An identical
 * payload yields the same key, so a retry replays the original write and cannot
 * confirm a second charge. A payload the clinician edited yields a different
 * key, so it genuinely writes rather than silently replaying the previous
 * amount while the form reports success. Reverting an edit returns to the
 * original key. The server independently refuses the same key carrying a
 * different payload.
 */
export async function deriveTreatmentRequestKey(facts: unknown): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    // Without Web Crypto there is no derivable key, so the submission is
    // refused rather than sent under a guessable or colliding one.
    throw new Error("secure request key unavailable");
  }
  const digest = await subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(facts)));
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/**
 * Today's Philippine clinical date, the same calendar day the server derives.
 *
 * A payment is received when it is received. `record_payment` stamps its own
 * receipt time and accepts no date, so the boundary requires the submitted
 * payment date to be today; sending the performed date instead would either be
 * refused or, worse, record a date the ledger does not actually carry.
 */
export function manilaToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/**
 * Pesos as a clinician types them, converted to the ledger unit.
 *
 * Returns null for anything that is not a positive amount with at most two
 * decimals, so an over-precise figure is refused at the boundary rather than
 * silently rounded into a charge nobody agreed to.
 */
export function parsePesosToCentavos(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  const centavos = Math.round(Number(trimmed) * 100);
  if (!Number.isSafeInteger(centavos) || centavos < 1 || centavos > 99999999999) return null;
  return centavos;
}

type WriteResult = Awaited<ReturnType<typeof recordTreatmentEventAction>>;

function failureMessage(result: Extract<WriteResult, { ok: false }>): string {
  if (result.code === "NOT_AUTHORIZED") {
    return "Your clinical or billing access changed. Nothing was recorded and no charge was confirmed; refresh before retrying.";
  }
  if (result.code === "INVALID_INPUT") {
    return "This treatment could not be recorded as entered. Review the performed date, the treated teeth and surfaces, the linked findings and the amount, then try again.";
  }
  if (result.code === "STALE_VERSION" || result.code === "CONFLICT") {
    return "This procedure case changed while you were working. Nothing was recorded; reopen the case and retry.";
  }
  if (result.code === "INVALID_STATE") {
    return "This procedure case is no longer open, so nothing was recorded.";
  }
  return "The treatment could not be recorded. Nothing was saved and no charge was confirmed; retry when you are ready.";
}

/**
 * The one form that records a treatment and confirms its charge.
 *
 * Everything it submits goes to a single server action backed by a single
 * database transaction, so the visit, the case, the charge, the clinical record,
 * the finding resolution and any payment either all exist or none do. The form
 * never reads state to decide what to write and never chains a second action to
 * finish the first.
 */
export function TreatmentEventForm({
  patientId,
  branchId,
  patientIdentifier,
  toothCodes,
  serviceDate,
  onServiceDateChange,
  procedures,
  activeFindings,
  planItems,
  openCases,
  paymentMethods,
  onRecorded,
}: TreatmentEventFormProps): React.ReactElement {
  const router = useRouter();
  const [lifecycle, setLifecycle] = React.useState<LifecycleIntent>("PERFORMED");
  const [procedureId, setProcedureId] = React.useState(procedures[0]?.procedureId ?? "");
  const [treatmentCode, setTreatmentCode] = React.useState<TreatmentEventCode>("RESTORATION");
  const [surfaces, setSurfaces] = React.useState<readonly ToothSurfaceCode[]>([]);
  const [restorationType, setRestorationType] = React.useState<string>("none");
  const [material, setMaterial] = React.useState<string>("composite");
  const [marginalLeakage, setMarginalLeakage] = React.useState(false);
  const [rootCanalState, setRootCanalState] = React.useState<string>("endo-filling");
  const [appliance, setAppliance] = React.useState<string>("BRACKET");
  const [movement, setMovement] = React.useState<string>("DRIFT");
  const [controlledCode, setControlledCode] = React.useState("");
  const [findingIds, setFindingIds] = React.useState<readonly string[]>([]);
  const [planItemId, setPlanItemId] = React.useState("");
  const [caseId, setCaseId] = React.useState("");
  const [amountText, setAmountText] = React.useState("");
  const [paymentMode, setPaymentMode] = React.useState<"NONE" | "PAY_NOW">("NONE");
  const [paymentMethodId, setPaymentMethodId] = React.useState(paymentMethods[0]?.paymentMethodId ?? "");
  const [paymentAmountText, setPaymentAmountText] = React.useState("");
  const [paymentReference, setPaymentReference] = React.useState("");
  const [installmentsEnabled, setInstallmentsEnabled] = React.useState(false);
  const [installmentRows, setInstallmentRows] = React.useState<{ dueDate: string; amountText: string }[]>([
    { dueDate: "", amountText: "" },
  ]);
  const [note, setNote] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [pendingFacts, setPendingFacts] = React.useState<SubmittedFacts | null>(null);
  const [replayNotice, setReplayNotice] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);

  const lifecycleId = React.useId();
  const procedureFieldId = React.useId();
  const treatmentId = React.useId();
  const restorationTypeId = React.useId();
  const materialId = React.useId();
  const rootCanalId = React.useId();
  const applianceId = React.useId();
  const movementId = React.useId();
  const controlledCodeId = React.useId();
  const dateId = React.useId();
  const amountId = React.useId();
  const caseFieldId = React.useId();
  const planFieldId = React.useId();
  const paymentOptionId = React.useId();
  const paymentMethodFieldId = React.useId();
  const paymentAmountId = React.useId();
  const paymentReferenceId = React.useId();
  const noteId = React.useId();

  const confirmsCharge = lifecycle !== "FOLLOW_UP";
  const today = manilaToday();
  const paymentIsBackdatedTreatment = paymentMode === "PAY_NOW" && serviceDate !== "" && serviceDate !== today;
  // The status the recorded entry will carry. It is derived, not chosen: the
  // same transaction decides it from the lifecycle intent, and a second browser
  // authority for a clinical fact the server already determines would be a lie
  // waiting to happen. It is shown so the clinician can see it before writing.
  const resultStatus = lifecycle === "FOLLOW_UP" ? "In progress" : lifecycle === "COMPLETED" ? "Completed" : "Completed (case stays open)";
  const availableSurfaces = React.useMemo(
    () => allowedSurfacesForToothCodes(toothCodes),
    [toothCodes],
  );
  const selectedSurfaces = React.useMemo(
    () => availableSurfaces.filter((surface) => surfaces.includes(surface)),
    [availableSurfaces, surfaces],
  );
  const showSurfaces = treatmentAllowsSurfaces(treatmentCode);

  // Only findings on a tooth this event actually treats, and only those the
  // selected treatment plausibly resolves, are ever offered. There is no
  // "mark tooth healthy" shortcut: a finding is closed by the treatment that
  // addressed it.
  const offeredFindings = React.useMemo(
    () =>
      activeFindings.filter(
        (finding) =>
          toothCodes.includes(finding.toothCode) &&
          findingIsResolvableBy(treatmentCode, finding.findingCode),
      ),
    [activeFindings, toothCodes, treatmentCode],
  );
  const selectedFindingIds = React.useMemo(
    () => offeredFindings.filter((finding) => findingIds.includes(finding.entryId)).map((finding) => finding.entryId),
    [offeredFindings, findingIds],
  );

  const compatiblePlanItems = React.useMemo(
    () =>
      planItems.filter(
        (item) => item.procedureId === procedureId && toothCodes.includes(item.toothCode),
      ),
    [planItems, procedureId, toothCodes],
  );
  const compatibleCases = React.useMemo(
    () => openCases.filter((openCase) => openCase.procedureId === procedureId),
    [openCases, procedureId],
  );
  const selectedPlanItem = compatiblePlanItems.find((item) => item.planItemId === planItemId) ?? null;
  const selectedCase = compatibleCases.find((openCase) => openCase.procedureCaseId === caseId)
    ?? compatibleCases[0]
    ?? null;
  const procedureName = procedures.find((item) => item.procedureId === procedureId)?.name ?? "";

  function toggleSurface(surface: ToothSurfaceCode) {
    setError(null);
    setPendingFacts(null);
    setConfirmOpen(false);
    setReplayNotice(false);
    setSurfaces((current) =>
      current.includes(surface) ? current.filter((item) => item !== surface) : [...current, surface],
    );
  }

  function toggleFinding(entryId: string) {
    setError(null);
    setPendingFacts(null);
    setConfirmOpen(false);
    setReplayNotice(false);
    setFindingIds((current) =>
      current.includes(entryId) ? current.filter((item) => item !== entryId) : [...current, entryId],
    );
  }

  function buildDetail(): TreatmentDetail {
    if (treatmentCode === "RESTORATION") {
      return { code: "RESTORATION", restorationType, material, marginalLeakage };
    }
    if (treatmentCode === "ROOT_CANAL") return { code: "ROOT_CANAL", state: rootCanalState };
    if (treatmentCode === "ORTHODONTIC") return { code: "ORTHODONTIC", appliance, movement };
    if (treatmentCode === "OTHER") return { code: "OTHER", controlledCode: controlledCode.trim() };
    if (treatmentCode === "TOOTH_STATE") return { code: "TOOTH_STATE", state: "EXTRACTION_WOUND" };
    return { code: treatmentCode };
  }

  /**
   * Assembles exactly what will be sent. Key order is fixed here so the derived
   * request key is stable for identical facts.
   */
  function buildFacts(): { facts: SubmittedFacts } | { message: string } {
    if (!procedureId) return { message: "Select the procedure that was carried out." };
    if (toothCodes.length === 0) return { message: "Select at least one treated tooth." };
    if (!serviceDate) return { message: "Enter the date the treatment was performed." };

    let chargeAmountCentavos: number | null = null;
    if (confirmsCharge) {
      chargeAmountCentavos = parsePesosToCentavos(amountText);
      if (chargeAmountCentavos === null) {
        return { message: "Enter the actual cost in pesos, greater than zero, with at most two decimals." };
      }
    }

    if (showSurfaces && treatmentRequiresSurfaces(treatmentCode) && selectedSurfaces.length === 0) {
      return { message: "Select at least one treated surface for this treatment." };
    }
    if (treatmentCode === "OTHER" && controlledCode.trim() === "") {
      return { message: "Name the controlled code for this other treatment." };
    }

    let existingCaseId: string | null = null;
    let expectedCaseVersion: number | null = null;
    let submittedPlanItemId: string | null = null;

    if (selectedPlanItem && confirmsCharge) {
      // A plan item's case is opened by the plan workflow and completed through
      // the immutable-design boundary, so it always arrives as an existing case.
      if (lifecycle !== "COMPLETED") {
        return { message: "A planned treatment is recorded by completing its plan item." };
      }
      existingCaseId = selectedPlanItem.procedureCaseId;
      expectedCaseVersion = selectedPlanItem.caseVersion;
      submittedPlanItemId = selectedPlanItem.planItemId;
    } else if (lifecycle === "FOLLOW_UP") {
      if (!selectedCase) return { message: "Select the existing procedure case this follow-up belongs to." };
      existingCaseId = selectedCase.procedureCaseId;
      expectedCaseVersion = selectedCase.caseVersion;
    }

    let immediatePayment: SubmittedFacts["immediatePayment"] = null;
    if (paymentMode === "PAY_NOW") {
      if (!paymentMethodId) return { message: "Select the payment method." };
      const paymentCentavos = parsePesosToCentavos(paymentAmountText);
      if (paymentCentavos === null) {
        return { message: "Enter the payment amount in pesos, greater than zero, with at most two decimals." };
      }
      immediatePayment = {
        paymentMethodId,
        amountCentavos: paymentCentavos,
        // Received today, which is not necessarily the day the treatment was
        // performed. The UI states this whenever the two differ.
        paymentDate: today,
        ...(paymentReference.trim() ? { reference: paymentReference.trim() } : {}),
      };
    }

    let installmentSchedule: SubmittedFacts["installmentSchedule"] = null;
    if (installmentsEnabled) {
      if (!confirmsCharge) return { message: "An installment schedule belongs to the visit that confirms the charge." };
      const rows: { dueDate: string; expectedCentavos: string }[] = [];
      for (const row of installmentRows) {
        const centavos = parsePesosToCentavos(row.amountText);
        if (!row.dueDate || centavos === null) {
          return { message: "Give every installment a due date and an amount greater than zero." };
        }
        rows.push({ dueDate: row.dueDate, expectedCentavos: String(centavos) });
      }
      if (rows.length === 0) return { message: "Add at least one installment or turn the schedule off." };
      installmentSchedule = rows;
    }

    const trimmedNote = note.trim();
    return {
      facts: {
        patientId,
        branchId,
        procedureId,
        planItemId: submittedPlanItemId,
        existingCaseId,
        expectedCaseVersion,
        eventKind: lifecycle,
        serviceDate,
        resolvedFindingIds: [...selectedFindingIds],
        clinicalDetail: {
          toothCodes: [...toothCodes],
          ...(showSurfaces && selectedSurfaces.length > 0 ? { surfaces: [...selectedSurfaces] } : {}),
          detail: buildDetail(),
          ...(trimmedNote ? { note: trimmedNote } : {}),
        },
        chargeAmountCentavos,
        immediatePayment,
        installmentSchedule,
      },
    };
  }

  async function submit(facts: SubmittedFacts) {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const result = await recordTreatmentEventAction({
        ...facts,
        idempotencyKey: await deriveTreatmentRequestKey(facts),
      });
      if (!result.ok) {
        // Close the confirmation and hand the failure back to the form. The
        // facts are kept so an unmodified retry reuses the same derived key and
        // cannot confirm a second charge.
        setConfirmOpen(false);
        setError(failureMessage(result));
        return;
      }
      setConfirmOpen(false);
      setPendingFacts(null);
      setReplayNotice(result.replayed === true);
      await onRecorded();
      router.refresh();
    } catch {
      setConfirmOpen(false);
      setError("The treatment could not be recorded. Nothing was saved and no charge was confirmed; retry when you are ready.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const built = buildFacts();
    if ("message" in built) {
      setPendingFacts(null);
      setError(built.message);
      return;
    }
    setError(null);
    if (confirmsCharge) {
      // Nothing is written until the dentist confirms the amount.
      setPendingFacts(built.facts);
      setConfirmOpen(true);
      return;
    }
    await submit(built.facts);
  }

  return (
    <>
      <form className="grid gap-3" onSubmit={handleSubmit} aria-label="Record treatment performed">
        {replayNotice && (
          <p role="status" className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
            This matches a record already saved, so nothing was recorded again and no second charge was
            confirmed. Open the tooth record to review it.
          </p>
        )}

        {error && (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-destructive/40 px-3 py-2 text-xs text-destructive"
          >
            <span className="min-w-0 break-words">{error}</span>
            {pendingFacts && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="min-h-11 shrink-0"
                disabled={saving}
                onClick={() => void submit(pendingFacts)}
              >
                Retry
              </Button>
            )}
          </div>
        )}

        <label htmlFor={lifecycleId} className="grid gap-1 text-xs font-medium">
          Lifecycle
          <Select
            id={lifecycleId}
            value={lifecycle}
            onChange={(event) => {
              setLifecycle(event.target.value as LifecycleIntent);
              setPendingFacts(null);
              setConfirmOpen(false);
              setReplayNotice(false);
              setError(null);
            }}
            className="min-h-11"
          >
            {LIFECYCLE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </label>

        <label htmlFor={procedureFieldId} className="grid gap-1 text-xs font-medium">
          Procedure
          <Select
            id={procedureFieldId}
            value={procedureId}
            onChange={(event) => {
              setProcedureId(event.target.value);
              setPlanItemId("");
              setCaseId("");
              setPendingFacts(null);
              setConfirmOpen(false);
              setReplayNotice(false);
              setError(null);
            }}
            className="min-h-11"
          >
            {procedures.map((procedure) => (
              <option key={procedure.procedureId} value={procedure.procedureId}>
                {procedure.name}
              </option>
            ))}
          </Select>
        </label>

        {lifecycle === "FOLLOW_UP" && (
          <>
            <label htmlFor={caseFieldId} className="grid gap-1 text-xs font-medium">
              Procedure case
              <Select
                id={caseFieldId}
                value={selectedCase?.procedureCaseId ?? ""}
                onChange={(event) => {
                  setCaseId(event.target.value);
                  setPendingFacts(null);
                  setError(null);
                }}
                className="min-h-11"
              >
                {compatibleCases.map((openCase) => (
                  <option key={openCase.procedureCaseId} value={openCase.procedureCaseId}>
                    {openCase.label}
                  </option>
                ))}
              </Select>
            </label>
            <p className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
              This adjustment joins the existing case. Its original charge is preserved and cannot be edited
              here; a correction goes through the adjustment or void ledger.
            </p>
          </>
        )}

        {confirmsCharge && compatiblePlanItems.length > 0 && (
          <label htmlFor={planFieldId} className="grid gap-1 text-xs font-medium">
            Planned item
            <Select
              id={planFieldId}
              value={planItemId}
              onChange={(event) => {
                setPlanItemId(event.target.value);
                setPendingFacts(null);
                setError(null);
              }}
              className="min-h-11"
            >
              <option value="">Unplanned treatment</option>
              {compatiblePlanItems.map((item) => (
                <option key={item.planItemId} value={item.planItemId}>
                  {item.label}
                </option>
              ))}
            </Select>
          </label>
        )}

        <label htmlFor={treatmentId} className="grid gap-1 text-xs font-medium">
          Treatment
          <Select
            id={treatmentId}
            value={treatmentCode}
            onChange={(event) => {
              setTreatmentCode(event.target.value as TreatmentEventCode);
              setFindingIds([]);
              setPendingFacts(null);
              setConfirmOpen(false);
              setReplayNotice(false);
              setError(null);
            }}
            className="min-h-11"
          >
            {TREATMENT_EVENT_CODES.map((code) => (
              <option key={code} value={code}>
                {TREATMENT_LABELS[code]}
              </option>
            ))}
          </Select>
        </label>

        {treatmentCode === "RESTORATION" && (
          <>
            <label htmlFor={restorationTypeId} className="grid gap-1 text-xs font-medium">
              Restoration type
              <Select
                id={restorationTypeId}
                value={restorationType}
                onChange={(event) => { setRestorationType(event.target.value); setPendingFacts(null); setConfirmOpen(false); setReplayNotice(false); setError(null); }}
                className="min-h-11"
              >
                {TREATMENT_RESTORATION_TYPES.map((value) => <option key={value} value={value}>{value}</option>)}
              </Select>
            </label>
            <label htmlFor={materialId} className="grid gap-1 text-xs font-medium">
              Material
              <Select
                id={materialId}
                value={material}
                onChange={(event) => { setMaterial(event.target.value); setPendingFacts(null); setConfirmOpen(false); setReplayNotice(false); setError(null); }}
                className="min-h-11"
              >
                {TREATMENT_RESTORATION_MATERIALS.map((value) => <option key={value} value={value}>{value}</option>)}
              </Select>
            </label>
            <label className="flex min-h-11 items-center gap-2 text-xs font-medium">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={marginalLeakage}
                onChange={() => { setMarginalLeakage((current) => !current); setPendingFacts(null); setConfirmOpen(false); setReplayNotice(false); setError(null); }}
              />
              Marginal leakage observed
            </label>
          </>
        )}

        {treatmentCode === "ROOT_CANAL" && (
          <label htmlFor={rootCanalId} className="grid gap-1 text-xs font-medium">
            Canal state
            <Select
              id={rootCanalId}
              value={rootCanalState}
              onChange={(event) => { setRootCanalState(event.target.value); setPendingFacts(null); setConfirmOpen(false); setReplayNotice(false); setError(null); }}
              className="min-h-11"
            >
              {TREATMENT_ROOT_CANAL_STATES.map((value) => <option key={value} value={value}>{value}</option>)}
            </Select>
          </label>
        )}

        {treatmentCode === "ORTHODONTIC" && (
          <>
            <label htmlFor={applianceId} className="grid gap-1 text-xs font-medium">
              Appliance
              <Select
                id={applianceId}
                value={appliance}
                onChange={(event) => { setAppliance(event.target.value); setPendingFacts(null); setConfirmOpen(false); setReplayNotice(false); setError(null); }}
                className="min-h-11"
              >
                {TREATMENT_ORTHODONTIC_APPLIANCES.map((value) => <option key={value} value={value}>{value}</option>)}
              </Select>
            </label>
            <label htmlFor={movementId} className="grid gap-1 text-xs font-medium">
              Movement
              <Select
                id={movementId}
                value={movement}
                onChange={(event) => { setMovement(event.target.value); setPendingFacts(null); setConfirmOpen(false); setReplayNotice(false); setError(null); }}
                className="min-h-11"
              >
                {TREATMENT_ORTHODONTIC_MOVEMENTS.map((value) => <option key={value} value={value}>{value}</option>)}
              </Select>
            </label>
          </>
        )}

        {treatmentCode === "OTHER" && (
          <label htmlFor={controlledCodeId} className="grid gap-1 text-xs font-medium">
            Controlled code
            <Input
              id={controlledCodeId}
              type="text"
              maxLength={100}
              value={controlledCode}
              onChange={(event) => { setControlledCode(event.target.value); setPendingFacts(null); setConfirmOpen(false); setReplayNotice(false); setError(null); }}
              className="min-h-11"
            />
          </label>
        )}

        {showSurfaces && availableSurfaces.length > 0 && (
          <fieldset className="grid gap-1.5">
            <legend className="text-xs font-medium">Treated surfaces</legend>
            <div role="group" aria-label="Treated surfaces" className="flex flex-wrap gap-1.5">
              {availableSurfaces.map((surface) => (
                <label
                  key={surface}
                  className="flex min-h-11 cursor-pointer items-center gap-1.5 rounded-md border px-2.5 text-xs has-checked:border-primary has-checked:bg-primary/10"
                >
                  <input
                    type="checkbox"
                    className="size-4 accent-primary"
                    checked={surfaces.includes(surface)}
                    onChange={() => toggleSurface(surface)}
                  />
                  {SURFACE_LABELS[surface]} ({surface})
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <fieldset className="grid gap-1.5">
          <legend className="text-xs font-medium">Findings resolved by this treatment</legend>
          {offeredFindings.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No active finding on the treated teeth matches this treatment.
            </p>
          ) : (
            <div role="group" aria-label="Findings resolved by this treatment" className="grid gap-1">
              {offeredFindings.map((finding) => (
                <label
                  key={finding.entryId}
                  className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md border px-2.5 text-xs has-checked:border-primary has-checked:bg-primary/10"
                >
                  <input
                    type="checkbox"
                    className="size-4 accent-primary"
                    checked={findingIds.includes(finding.entryId)}
                    onChange={() => toggleFinding(finding.entryId)}
                  />
                  {finding.label}
                </label>
              ))}
            </div>
          )}
        </fieldset>

        <label htmlFor={dateId} className="grid gap-1 text-xs font-medium">
          Performed date
          <Input
            id={dateId}
            type="date"
            required
            value={serviceDate}
            onChange={(event) => {
              setPendingFacts(null);
              setConfirmOpen(false);
              setReplayNotice(false);
              setError(null);
              onServiceDateChange(event.target.value);
            }}
            className="min-h-11"
          />
        </label>

        {confirmsCharge && (
          <label htmlFor={amountId} className="grid gap-1 text-xs font-medium">
            Actual cost (₱)
            <Input
              id={amountId}
              type="text"
              inputMode="decimal"
              value={amountText}
              onChange={(event) => { setAmountText(event.target.value); setPendingFacts(null); setConfirmOpen(false); setReplayNotice(false); setError(null); }}
              className="min-h-11"
            />
          </label>
        )}

        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Result / current status:</span> {resultStatus}
        </p>

        <label htmlFor={paymentOptionId} className="grid gap-1 text-xs font-medium">
          Payment option
          <Select
            id={paymentOptionId}
            value={paymentMode}
            onChange={(event) => {
              setPaymentMode(event.target.value as "NONE" | "PAY_NOW");
              setPendingFacts(null);
              setConfirmOpen(false);
              setReplayNotice(false);
              setError(null);
            }}
            className="min-h-11"
          >
            <option value="NONE">No payment now</option>
            <option value="PAY_NOW">Record payment</option>
          </Select>
        </label>

        {paymentMode === "PAY_NOW" && (
          <>
            <label htmlFor={paymentMethodFieldId} className="grid gap-1 text-xs font-medium">
              Payment method
              <Select
                id={paymentMethodFieldId}
                value={paymentMethodId}
                onChange={(event) => { setPaymentMethodId(event.target.value); setPendingFacts(null); setConfirmOpen(false); setReplayNotice(false); setError(null); }}
                className="min-h-11"
              >
                {paymentMethods.map((method) => (
                  <option key={method.paymentMethodId} value={method.paymentMethodId}>{method.name}</option>
                ))}
              </Select>
            </label>
            <label htmlFor={paymentAmountId} className="grid gap-1 text-xs font-medium">
              Payment amount (₱)
              <Input
                id={paymentAmountId}
                type="text"
                inputMode="decimal"
                value={paymentAmountText}
                onChange={(event) => { setPaymentAmountText(event.target.value); setPendingFacts(null); setConfirmOpen(false); setReplayNotice(false); setError(null); }}
                className="min-h-11"
              />
            </label>
            <label htmlFor={paymentReferenceId} className="grid gap-1 text-xs font-medium">
              Payment reference (optional)
              <Input
                id={paymentReferenceId}
                type="text"
                maxLength={80}
                value={paymentReference}
                onChange={(event) => { setPaymentReference(event.target.value); setPendingFacts(null); setConfirmOpen(false); setReplayNotice(false); setError(null); }}
                className="min-h-11"
              />
            </label>
            <p className="text-xs text-muted-foreground">
              Payment date: {today}. It is allocated to this procedure case only and never changes another
              case&apos;s balance.
            </p>
            {paymentIsBackdatedTreatment && (
              <p role="status" className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
                The treatment was performed on {serviceDate}, but this payment is received today, {today}.
                The clinical record keeps the performed date and the ledger keeps the receipt date.
              </p>
            )}
          </>
        )}

        {confirmsCharge && (
          <>
            <label className="flex min-h-11 items-center gap-2 text-xs font-medium">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={installmentsEnabled}
                onChange={() => { setInstallmentsEnabled((current) => !current); setPendingFacts(null); setConfirmOpen(false); setReplayNotice(false); setError(null); }}
              />
              Schedule installments for this case
            </label>
            {installmentsEnabled && (
              <div className="grid gap-1.5">
                {installmentRows.map((row, index) => (
                  <div key={index} className="flex flex-wrap gap-1.5">
                    <Input
                      type="date"
                      aria-label={`Installment ${index + 1} due date`}
                      value={row.dueDate}
                      onChange={(event) => {
                        const next = [...installmentRows];
                        next[index] = { ...next[index], dueDate: event.target.value };
                        setInstallmentRows(next);
                        setPendingFacts(null);
                        setError(null);
                      }}
                      className="min-h-11 flex-1"
                    />
                    <Input
                      type="text"
                      inputMode="decimal"
                      aria-label={`Installment ${index + 1} amount`}
                      value={row.amountText}
                      onChange={(event) => {
                        const next = [...installmentRows];
                        next[index] = { ...next[index], amountText: event.target.value };
                        setInstallmentRows(next);
                        setPendingFacts(null);
                        setError(null);
                      }}
                      className="min-h-11 flex-1"
                    />
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="min-h-11 justify-center"
                  onClick={() => { setInstallmentRows((current) => [...current, { dueDate: "", amountText: "" }]); setPendingFacts(null); }}
                >
                  Add installment
                </Button>
                <p className="text-xs text-muted-foreground">
                  Installments are expectations. The allocation ledger remains the balance authority.
                </p>
              </div>
            )}
          </>
        )}

        <label htmlFor={noteId} className="grid gap-1 text-xs font-medium">
          Clinical note (optional)
          <Textarea
            id={noteId}
            maxLength={2000}
            value={note}
            onChange={(event) => { setNote(event.target.value); setPendingFacts(null); setConfirmOpen(false); setReplayNotice(false); setError(null); }}
            className="min-h-20"
          />
        </label>

        <Button type="submit" size="sm" className="min-h-11 justify-center" disabled={saving}>
          {confirmsCharge ? "Review charge" : saving ? "Recording…" : "Record follow-up"}
        </Button>
      </form>

      {confirmOpen && pendingFacts?.chargeAmountCentavos != null && (
        <ProcedureChargeConfirmation
          open
          patientIdentifier={patientIdentifier}
          procedureName={procedureName}
          toothCodes={pendingFacts.clinicalDetail.toothCodes}
          serviceDate={pendingFacts.serviceDate}
          amountCentavos={pendingFacts.chargeAmountCentavos}
          pending={saving}
          onConfirm={() => void submit(pendingFacts)}
          onCancel={() => { setConfirmOpen(false); setPendingFacts(null); }}
        />
      )}
    </>
  );
}

export { formatCentavos };
