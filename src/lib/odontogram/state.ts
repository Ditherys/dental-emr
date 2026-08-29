/**
 * Renderer-independent patient chart projection.
 *
 * The canonical EMR data model is a list of clinical entries (findings,
 * treatments, legacy markers, planned/legacy unlinked rows). This module
 * projects that list into the shapes the renderer and the workspace
 * inspector consume: a per-tooth map of (surface -> active entry summary),
 * and a per-tooth grouping of (surface -> entries) for the history view.
 *
 * No DOM, React, persistence, or storage imports are permitted in this
 * module. The output is plain JSON-serializable data.
 */

import { FIVE_ANATOMIC_SURFACES, type Surface } from "./clinical-codes";

export type ClinicalEntryKind = "FINDING" | "TREATMENT" | "LEGACY_MARKER";
export type ClinicalStatus = "ACTIVE" | "PLANNED" | "COMPLETED" | "REFERRED";

export interface ClinicalEntry {
  entryId: string;
  patientId: string;
  toothFdi: number;
  kind: ClinicalEntryKind;
  clinicalCode: string;
  surfaces: readonly Surface[];
  status: ClinicalStatus;
  recordedAt: string;
  voidedAt: string | null;
  supersededByEntryId: string | null;
}

export interface CurrentEntryCell {
  clinicalCode: string;
  kind: ClinicalEntryKind;
  status: ClinicalStatus;
  surfaces: readonly Surface[];
  recordedAt: string;
}

export type CurrentProjection = Map<number, Map<Surface, CurrentEntryCell>>;
export type ToothGrouping = Map<number, Map<Surface, ClinicalEntry[]>>;

export function isEntryCurrentlyActive(entry: ClinicalEntry): boolean {
  if (entry.voidedAt !== null) return false;
  if (entry.supersededByEntryId !== null) return false;
  return true;
}

export function flattenEntrySurfaces(surfaces: readonly Surface[]): Surface[] {
  if (surfaces.length === 0) return [];
  const out: Surface[] = [];
  const seen = new Set<Surface>();
  if (surfaces.includes("FULL")) {
    for (const s of FIVE_ANATOMIC_SURFACES) {
      if (!seen.has(s)) {
        out.push(s);
        seen.add(s);
      }
    }
    return out;
  }
  for (const s of surfaces) {
    if (!seen.has(s)) {
      out.push(s);
      seen.add(s);
    }
  }
  return out;
}

function ensureSurfaceMap(projection: Map<number, Map<Surface, unknown>>, tooth: number) {
  let m = projection.get(tooth);
  if (!m) {
    m = new Map<Surface, unknown>();
    projection.set(tooth, m);
  }
  return m;
}

export function projectPerToothEntries(entries: readonly ClinicalEntry[]): ToothGrouping {
  const projection: ToothGrouping = new Map();
  for (const entry of entries) {
    if (!isEntryCurrentlyActive(entry)) continue;
    const surfaces = flattenEntrySurfaces(entry.surfaces);
    if (surfaces.length === 0) continue;
    const toothMap = ensureSurfaceMap(projection, entry.toothFdi) as Map<Surface, ClinicalEntry[]>;
    for (const surface of surfaces) {
      const list = toothMap.get(surface);
      if (list) {
        list.push(entry);
      } else {
        toothMap.set(surface, [entry]);
      }
    }
  }
  return projection;
}

export function buildCurrentProjection(entries: readonly ClinicalEntry[]): CurrentProjection {
  const grouping = projectPerToothEntries(entries);
  const projection: CurrentProjection = new Map();
  for (const [tooth, surfaceMap] of grouping) {
    const cellMap = ensureSurfaceMap(projection, tooth) as Map<Surface, CurrentEntryCell>;
    for (const [surface, list] of surfaceMap) {
      if (list.length === 0) continue;
      const head = list[0]!;
      cellMap.set(surface, {
        clinicalCode: head.clinicalCode,
        kind: head.kind,
        status: head.status,
        surfaces: head.surfaces,
        recordedAt: head.recordedAt,
      });
    }
  }
  return projection;
}
