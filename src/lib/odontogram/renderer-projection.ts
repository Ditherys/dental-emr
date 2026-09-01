/**
 * Renderer-facing view of the canonical chart projection.
 *
 * The plan calls the renderer's input a "canonical chart projection"; in this
 * repository that type already exists and is named `PatientChartProjection`
 * (`chart-projection.ts`), produced by `projectPatientChart`. This module
 * deliberately reuses it rather than introducing a second name for the same
 * data, and narrows it to exactly what an anatomical renderer needs.
 *
 * Everything here is pure. There is no DOM, React, persistence or renderer
 * dependency: a renderer consumes this output, it never writes back into it.
 */

import type { Mobility } from "./clinical-codes";
import type { ClinicalChartViewport } from "@/lib/clinical/types";
import type { PatientChartProjection } from "./chart-projection";
import { dentitionFor, type Dentition } from "./dentition";
import type { ToothBridgeRole, ToothRenderFeature, ToothRenderState } from "./feature-contract";

export type RendererToothView = "front" | "occlusal";

/** Everything an anatomical renderer may know about one tooth. */
export type RendererToothProjection = {
  fdi: number;
  dentition: Dentition;
  view: RendererToothView;
  anatomy: ToothRenderState["anatomy"];
  features: readonly ToothRenderFeature[];
  bridgeRole: ToothBridgeRole | null;
  mobility: Mobility;
  perioAlert: boolean;
};

const QUADRANT_ORDER: Readonly<Record<ClinicalChartViewport, readonly number[]>> = Object.freeze({
  FULL: [1, 2, 4, 3],
  UPPER: [1, 2],
  LOWER: [4, 3],
  QUADRANT_1: [1],
  QUADRANT_2: [2],
  QUADRANT_3: [3],
  QUADRANT_4: [4],
});

/** Primary quadrant that shares an arch side with a permanent quadrant. */
const PRIMARY_QUADRANT: Readonly<Record<number, number>> = Object.freeze({ 1: 5, 2: 6, 3: 7, 4: 8 });

/** Quadrants 1 and 4 (and their primary counterparts) read distal to mesial. */
function quadrantTeeth(quadrant: number, positions: number): readonly number[] {
  const teeth: number[] = [];
  for (let position = 1; position <= positions; position += 1) teeth.push(quadrant * 10 + position);
  const descending = quadrant === 1 || quadrant === 4 || quadrant === 5 || quadrant === 8;
  return descending ? teeth.reverse() : teeth;
}

/**
 * The bounded, ordered tooth list a viewport renders. Order is the clinical
 * chart order a dentist reads, which is also the order a bounded Shift-click
 * range walks.
 */
export function viewportFdiTeeth(
  viewport: ClinicalChartViewport,
  options: { includePrimary?: boolean } = {},
): readonly number[] {
  const teeth: number[] = [];
  for (const quadrant of QUADRANT_ORDER[viewport]) {
    teeth.push(...quadrantTeeth(quadrant, 8));
  }
  if (options.includePrimary) {
    for (const quadrant of QUADRANT_ORDER[viewport]) {
      teeth.push(...quadrantTeeth(PRIMARY_QUADRANT[quadrant], 5));
    }
  }
  return teeth;
}

/** True when the canonical projection holds any primary-dentition record. */
export function projectionHasPrimaryDentition(projection: PatientChartProjection): boolean {
  for (const fdi of projection.teeth.keys()) {
    if (dentitionFor(fdi) === "primary") return true;
  }
  return false;
}

/**
 * A tooth with no canonical record is healthy natural anatomy. Absence of data
 * is never a clinical finding, so nothing is invented here.
 */
export function projectRendererTooth(
  projection: PatientChartProjection,
  fdi: number,
  view: RendererToothView,
): RendererToothProjection {
  const state = projection.teeth.get(fdi);
  return {
    fdi,
    dentition: dentitionFor(fdi) ?? "permanent",
    view,
    anatomy: state?.anatomy ?? "NATURAL",
    features: state?.features ?? [],
    bridgeRole: state?.bridgeRole ?? null,
    mobility: state?.mobility ?? "none",
    perioAlert: state?.perioAlert ?? false,
  };
}

export function projectRendererChart(
  projection: PatientChartProjection,
  teeth: readonly number[],
  view: RendererToothView,
): ReadonlyMap<number, RendererToothProjection> {
  const out = new Map<number, RendererToothProjection>();
  for (const fdi of teeth) out.set(fdi, projectRendererTooth(projection, fdi, view));
  return out;
}
