import type { ValidationResult } from "./validation";

export type ImplantComponentKind = "FIXTURE" | "ABUTMENT" | "CROWN" | "ATTACHMENT";
export type ImplantRecordKind = "PLAN_DESIGN" | "CURRENT";
export type ImplantProvenance = "INTERNAL" | "PREEXISTING_EXTERNAL";

export type ImplantComponentRecord = {
  id: string;
  patientId: string;
  toothFdi: number;
  ordinal: number;
  componentKind: ImplantComponentKind;
  recordKind: ImplantRecordKind;
  dependsOnComponentId: string | null;
  provenance: ImplantProvenance | null;
  sealedAt: string | null;
  voidedAt: string | null;
  supersedesComponentId: string | null;
};

function invalid(message: string): ValidationResult<never> {
  return { ok: false, errors: [{ field: "implant.chain", message }] };
}

export function validateImplantChain(
  components: readonly ImplantComponentRecord[],
): ValidationResult<readonly ImplantComponentRecord[]> {
  if (components.length === 0) return invalid("implant chain requires a component");
  const byId = new Map<string, ImplantComponentRecord>();
  const ordinals = new Set<number>();
  let fixtureCount = 0;
  const root = [...components].sort((a, b) => a.ordinal - b.ordinal)[0]!;

  for (const component of [...components].sort((a, b) => a.ordinal - b.ordinal)) {
    if (byId.has(component.id)) return invalid("implant component ids must be unique");
    if (ordinals.has(component.ordinal) || component.ordinal < 1) return invalid("implant ordinals must be positive and unique");
    if (component.patientId !== root.patientId || component.toothFdi !== root.toothFdi) {
      return invalid("implant chain components must remain at the same patient and tooth position");
    }
    ordinals.add(component.ordinal);

    if (component.componentKind === "FIXTURE") {
      if (component.dependsOnComponentId !== null) return invalid("fixture cannot depend on another component");
      fixtureCount += 1;
      if (fixtureCount > 1) return invalid("implant chain must contain exactly one fixture root");
      byId.set(component.id, component);
      continue;
    }

    const dependency = component.dependsOnComponentId === null ? undefined : byId.get(component.dependsOnComponentId);
    if (!dependency) return invalid("dependent implant component must reference an earlier component");
    if (dependency.patientId !== component.patientId || dependency.toothFdi !== component.toothFdi) {
      return invalid("implant dependencies must remain at the same patient and tooth position");
    }
    if (component.recordKind === "CURRENT" && dependency.recordKind !== "CURRENT") {
      return invalid("CURRENT components may depend only on CURRENT components");
    }
    if (component.componentKind === "ABUTMENT" && dependency.componentKind !== "FIXTURE") {
      return invalid("abutment must depend on a fixture");
    }
    if ((component.componentKind === "CROWN" || component.componentKind === "ATTACHMENT") && dependency.componentKind !== "ABUTMENT") {
      return invalid("crown or attachment must depend on an abutment");
    }
    byId.set(component.id, component);
  }

  if (fixtureCount !== 1) return invalid("implant chain must contain exactly one fixture root");
  return { ok: true, errors: [], value: components };
}

/**
 * The stage an implant has actually reached, read from the current projection.
 *
 * The chain is built one component at a time across visits, so this is the
 * furthest component the canonical record carries — never a guess from the
 * charge, the plan, or the renderer.
 */
export function currentImplantStage(
  components: readonly ImplantComponentRecord[],
): ImplantComponentKind | null {
  const ordered = [...components].sort((left, right) => right.ordinal - left.ordinal);
  return ordered[0]?.componentKind ?? null;
}

/**
 * The one component a clinician may add next. A stage is never skipped: an
 * abutment needs its fixture and a crown needs its abutment, exactly as
 * `validateImplantChain` and the database chain normalizer both require.
 */
export function nextImplantStage(
  stage: ImplantComponentKind | null,
): ImplantComponentKind | null {
  if (stage === null) return "FIXTURE";
  if (stage === "FIXTURE") return "ABUTMENT";
  if (stage === "ABUTMENT") return "CROWN";
  return null;
}

export function describeImplantStage(stage: ImplantComponentKind | null): string {
  if (stage === null) return "No implant recorded";
  if (stage === "FIXTURE") return "Fixture placed";
  if (stage === "ABUTMENT") return "Abutment connected";
  if (stage === "CROWN") return "Crown seated";
  return "Attachment seated";
}

export function currentImplantProjection(
  components: readonly ImplantComponentRecord[],
): ImplantComponentRecord[] {
  const supersededIds = new Set(
    components.map((component) => component.supersedesComponentId).filter((id): id is string => id !== null),
  );
  return components
    .filter(
      (component) =>
        component.recordKind === "CURRENT" &&
        component.sealedAt !== null &&
        component.voidedAt === null &&
        !supersededIds.has(component.id),
    )
    .sort((a, b) => a.ordinal - b.ordinal);
}
