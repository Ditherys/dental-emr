import { validateBridgeSpan, type ValidationResult } from "./validation";

export type BridgeUnitRole = "ABUTMENT" | "PONTIC";
export type BridgeUnitSupportKind = "NATURAL_TOOTH" | "IMPLANT_COMPONENT" | "NONE";
export type BridgeSupportMode = "NATURAL_TOOTH" | "IMPLANT_COMPONENT" | "MIXED";

export type BridgeUnit = {
  toothFdi: number;
  ordinal: number;
  role: BridgeUnitRole;
  supportKind: BridgeUnitSupportKind;
  supportComponentId: string | null;
};

export type BridgeRecord = {
  id: string;
  recordKind: "PLAN_DESIGN" | "CURRENT";
  sealedAt: string | null;
  voidedAt: string | null;
  supersedesBridgeId: string | null;
};

function invalid(message: string): ValidationResult<never> {
  return { ok: false, errors: [{ field: "bridge.units", message }] };
}

export function validateBridgeUnits(units: readonly BridgeUnit[]): ValidationResult<readonly BridgeUnit[]> {
  if (units.length < 2) return invalid("bridge requires at least two units");
  const span = validateBridgeSpan(units.map((unit) => unit.toothFdi));
  if (!span.ok) return { ok: false, errors: span.errors };

  const ordinals = [...units].map((unit) => unit.ordinal).sort((a, b) => a - b);
  if (ordinals.some((ordinal, index) => ordinal !== index + 1)) {
    return invalid("bridge unit ordinals must be unique and contiguous from one");
  }

  for (const unit of units) {
    if (unit.role === "PONTIC") {
      if (unit.supportKind !== "NONE" || unit.supportComponentId !== null) {
        return invalid("pontic units cannot have support components");
      }
      continue;
    }
    if (unit.supportKind === "NONE") return invalid("abutment units require natural or implant support");
    if ((unit.supportKind === "IMPLANT_COMPONENT") !== (unit.supportComponentId !== null)) {
      return invalid("implant-supported abutments require exactly one support component");
    }
  }

  return { ok: true, errors: [], value: units };
}

export function deriveBridgeSupportMode(units: readonly BridgeUnit[]): BridgeSupportMode {
  const abutmentSupport = new Set(
    units.filter((unit) => unit.role === "ABUTMENT").map((unit) => unit.supportKind),
  );
  if (abutmentSupport.has("NATURAL_TOOTH") && abutmentSupport.has("IMPLANT_COMPONENT")) return "MIXED";
  return abutmentSupport.has("IMPLANT_COMPONENT") ? "IMPLANT_COMPONENT" : "NATURAL_TOOTH";
}

/** A bridge's units in their canonical ordinal order, never arrival order. */
export function orderedBridgeUnits(units: readonly BridgeUnit[]): BridgeUnit[] {
  return [...units].sort((left, right) => left.ordinal - right.ordinal);
}

/**
 * The visual connector between two adjacent units.
 *
 * A connector is a projection of the canonical relationship, not a record of
 * its own: it exists only between consecutive canonical units, and a span with
 * a single unit — which is not a bridge — has none.
 */
export type BridgeConnector = { fromToothFdi: number; toToothFdi: number };

export function bridgeConnectors(units: readonly BridgeUnit[]): BridgeConnector[] {
  const ordered = orderedBridgeUnits(units);
  const connectors: BridgeConnector[] = [];
  for (let index = 1; index < ordered.length; index += 1) {
    connectors.push({ fromToothFdi: ordered[index - 1]!.toothFdi, toToothFdi: ordered[index]!.toothFdi });
  }
  return connectors;
}

/** The one line a chart reader needs: which teeth, how many, and their roles. */
export function bridgeSpanSummary(units: readonly BridgeUnit[]): string {
  const ordered = orderedBridgeUnits(units);
  if (ordered.length === 0) return "No bridge recorded";
  const abutments = ordered.filter((unit) => unit.role === "ABUTMENT").length;
  const pontics = ordered.length - abutments;
  const span =
    ordered.length === 1
      ? String(ordered[0]!.toothFdi)
      : `${ordered[0]!.toothFdi}–${ordered[ordered.length - 1]!.toothFdi}`;
  const roles = [
    `${abutments} ${abutments === 1 ? "abutment" : "abutments"}`,
    `${pontics} ${pontics === 1 ? "pontic" : "pontics"}`,
  ].join(", ");
  return `${span} · ${ordered.length} units · ${roles}`;
}

export function currentBridgeProjection(records: readonly BridgeRecord[]): BridgeRecord[] {
  const supersededIds = new Set(
    records.map((record) => record.supersedesBridgeId).filter((id): id is string => id !== null),
  );
  return records.filter(
    (record) =>
      record.recordKind === "CURRENT" &&
      record.sealedAt !== null &&
      record.voidedAt === null &&
      !supersededIds.has(record.id),
  );
}
