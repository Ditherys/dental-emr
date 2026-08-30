import { describe, expect, it } from "vitest";

import {
  canCorrectExecution,
  isExecutionTerminal,
  isProcedureCaseTerminal,
  validateProcedureCaseEvent,
  validateExecutionTransition,
  validateTreatmentCompletion,
} from "./execution";

describe("treatment-plan execution rules", () => {
  it("allows only append-only procedure-case event kinds with required correction rationale", () => {
    expect(validateProcedureCaseEvent({ eventType: "TREATMENT", reason: null })).toEqual({ ok: true });
    expect(validateProcedureCaseEvent({ eventType: "FOLLOW_UP", reason: null })).toEqual({ ok: true });
    expect(validateProcedureCaseEvent({ eventType: "CORRECTION", reason: "Synthetic correction" })).toEqual({ ok: true });
    expect(validateProcedureCaseEvent({ eventType: "CORRECTION", reason: " " }).ok).toBe(false);
  });

  it("treats completed and cancelled procedure cases as terminal", () => {
    expect(isProcedureCaseTerminal("COMPLETED")).toBe(true);
    expect(isProcedureCaseTerminal("CANCELLED")).toBe(true);
    expect(isProcedureCaseTerminal("OPEN")).toBe(false);
  });
  it.each([
    ["PROPOSED", "ACCEPTED"],
    ["PROPOSED", "CANCELLED"],
    ["ACCEPTED", "IN_PROGRESS"],
    ["ACCEPTED", "CANCELLED"],
    ["IN_PROGRESS", "COMPLETED"],
    ["IN_PROGRESS", "CANCELLED"],
  ] as const)("allows %s -> %s after acknowledgment", (from, to) => {
    expect(validateExecutionTransition({ from, to, planAcknowledged: true, reason: to === "CANCELLED" ? "Cancelled" : null })).toEqual({ ok: true });
  });

  it("allows only PROPOSED before acknowledgment", () => {
    expect(validateExecutionTransition({ from: "PROPOSED", to: "ACCEPTED", planAcknowledged: false })).toEqual({
      ok: false,
      reason: "plan-not-acknowledged",
    });
  });

  it.each([
    ["PROPOSED", "IN_PROGRESS"],
    ["PROPOSED", "COMPLETED"],
    ["ACCEPTED", "COMPLETED"],
    ["COMPLETED", "CANCELLED"],
    ["CANCELLED", "PROPOSED"],
  ] as const)("rejects illegal %s -> %s", (from, to) => {
    expect(validateExecutionTransition({ from, to, planAcknowledged: true }).ok).toBe(false);
  });

  it("requires a bounded cancellation reason", () => {
    expect(validateExecutionTransition({ from: "ACCEPTED", to: "CANCELLED", planAcknowledged: true, reason: " " }).ok).toBe(false);
    expect(validateExecutionTransition({ from: "ACCEPTED", to: "CANCELLED", planAcknowledged: true, reason: "x".repeat(501) }).ok).toBe(false);
  });

  it("classifies terminal states", () => {
    expect(isExecutionTerminal("COMPLETED")).toBe(true);
    expect(isExecutionTerminal("CANCELLED")).toBe(true);
    expect(isExecutionTerminal("IN_PROGRESS")).toBe(false);
  });

  it("permits only the two accepted append-only correction edges", () => {
    expect(canCorrectExecution("ACCEPTED", "PROPOSED", "Correction")).toEqual({ ok: true });
    expect(canCorrectExecution("IN_PROGRESS", "ACCEPTED", "Correction")).toEqual({ ok: true });
    expect(canCorrectExecution("COMPLETED", "IN_PROGRESS", "Correction").ok).toBe(false);
    expect(canCorrectExecution("CANCELLED", "PROPOSED", "Correction").ok).toBe(false);
  });

  it("validates completion payload kinds and amount", () => {
    expect(validateTreatmentCompletion({ kind: "CLINICAL", amountCentavos: 125000, payload: { toothCode: "26", clinicalCode: "CROWN" } }).ok).toBe(true);
    expect(validateTreatmentCompletion({ kind: "BRIDGE", amountCentavos: -1, payload: {} }).ok).toBe(false);
    expect(validateTreatmentCompletion({ kind: "IMPLANT", amountCentavos: 1, payload: null }).ok).toBe(false);
  });
});
