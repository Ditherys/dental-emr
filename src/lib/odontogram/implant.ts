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

  for (const component of [...components].sort((a, b) => a.ordinal - b.ordinal)) {
    if (byId.has(component.id)) return invalid("implant component ids must be unique");
    if (ordinals.has(component.ordinal) || component.ordinal < 1) return invalid("implant ordinals must be positive and unique");
    ordinals.add(component.ordinal);

    if (component.componentKind === "FIXTURE") {
      if (component.dependsOnComponentId !== null) return invalid("fixture cannot depend on another component");
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

  return { ok: true, errors: [], value: components };
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
