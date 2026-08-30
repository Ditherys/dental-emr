export const EXECUTION_STATES = ["PROPOSED", "ACCEPTED", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const;
export type ExecutionState = (typeof EXECUTION_STATES)[number];
export const PROCEDURE_CASE_STATUSES = ["OPEN", "COMPLETED", "CANCELLED"] as const;
export type ProcedureCaseStatus = (typeof PROCEDURE_CASE_STATUSES)[number];
export const PROCEDURE_CASE_EVENT_TYPES = ["TREATMENT", "FOLLOW_UP", "COMPLETION", "CANCELLATION", "CORRECTION"] as const;
export type ProcedureCaseEventType = (typeof PROCEDURE_CASE_EVENT_TYPES)[number];

type RuleResult = { ok: true } | { ok: false; reason: string };

const legalTransitions: Readonly<Record<ExecutionState, readonly ExecutionState[]>> = {
  PROPOSED: ["ACCEPTED", "CANCELLED"],
  ACCEPTED: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

function boundedReason(reason: string | null | undefined): boolean {
  const trimmed = reason?.trim() ?? "";
  return trimmed.length > 0 && trimmed.length <= 500;
}

export function isExecutionTerminal(state: ExecutionState): boolean {
  return state === "COMPLETED" || state === "CANCELLED";
}

export function isProcedureCaseTerminal(status: ProcedureCaseStatus): boolean {
  return status === "COMPLETED" || status === "CANCELLED";
}

export function validateProcedureCaseEvent(input: { eventType: ProcedureCaseEventType; reason?: string | null }): RuleResult {
  if (input.eventType === "CORRECTION" && !boundedReason(input.reason)) {
    return { ok: false, reason: "correction-reason-required" };
  }
  return { ok: true };
}

export function validateExecutionTransition(input: {
  from: ExecutionState;
  to: ExecutionState;
  planAcknowledged: boolean;
  reason?: string | null;
}): RuleResult {
  if (!input.planAcknowledged && input.to !== "PROPOSED") {
    return { ok: false, reason: "plan-not-acknowledged" };
  }
  if (!legalTransitions[input.from].includes(input.to)) {
    return { ok: false, reason: "illegal-transition" };
  }
  if (input.to === "CANCELLED" && !boundedReason(input.reason)) {
    return { ok: false, reason: "cancellation-reason-required" };
  }
  return { ok: true };
}

export function canCorrectExecution(
  from: ExecutionState,
  to: ExecutionState,
  reason: string | null | undefined,
): RuleResult {
  if (!boundedReason(reason)) return { ok: false, reason: "correction-reason-required" };
  if ((from === "ACCEPTED" && to === "PROPOSED") || (from === "IN_PROGRESS" && to === "ACCEPTED")) {
    return { ok: true };
  }
  return { ok: false, reason: "illegal-correction" };
}

export type TreatmentCompletionKind = "CLINICAL" | "BRIDGE" | "IMPLANT";

export function validateTreatmentCompletion(input: {
  kind: TreatmentCompletionKind;
  amountCentavos: number;
  payload: unknown;
}): RuleResult {
  if (!Number.isSafeInteger(input.amountCentavos) || input.amountCentavos < 0 || input.amountCentavos > 99_999_999_999) {
    return { ok: false, reason: "invalid-amount" };
  }
  if (input.payload === null || typeof input.payload !== "object" || Array.isArray(input.payload)) {
    return { ok: false, reason: "invalid-payload" };
  }
  return { ok: true };
}
