"use client";

import * as React from "react";

import { bridgeConnectors, orderedBridgeUnits, type BridgeUnit } from "@/lib/odontogram/bridge";

/**
 * The visual projection of a canonical bridge relationship.
 *
 * Every unit and every connector below is derived from the ordered canonical
 * units. Nothing here is a record: the roles come from the relationship DTO, the
 * connectors are the adjacent pairs of that same ordering, and a span with fewer
 * than two units — which is not a bridge — renders nothing rather than a guess.
 * No crown overlay or icon state ever stands in for the relationship.
 */
export interface BridgeOverlayProps {
  bridgeUnits?: ReadonlyArray<{
    tooth_fdi: string;
    ordinal: number;
    role: string;
    support_kind: string;
  }>;
}

export function BridgeOverlay({ bridgeUnits }: BridgeOverlayProps): React.ReactElement | null {
  if (!bridgeUnits || bridgeUnits.length < 2) return null;

  const domainUnits: BridgeUnit[] = bridgeUnits.map((unit) => ({
    toothFdi: Number(unit.tooth_fdi),
    ordinal: unit.ordinal,
    role: unit.role === "PONTIC" ? "PONTIC" : "ABUTMENT",
    supportKind:
      unit.support_kind === "IMPLANT_COMPONENT"
        ? "IMPLANT_COMPONENT"
        : unit.support_kind === "NONE"
          ? "NONE"
          : "NATURAL_TOOTH",
    supportComponentId: null,
  }));
  const ordered = orderedBridgeUnits(domainUnits);
  const connectors = bridgeConnectors(domainUnits);

  return (
    <div
      data-testid="bridge-overlay"
      data-bridge-span={ordered.map((unit) => unit.toothFdi).join("-")}
      className="flex items-stretch gap-0 overflow-x-auto"
    >
      {ordered.map((unit, index) => (
        <React.Fragment key={unit.toothFdi}>
          {index > 0 && connectors[index - 1] && (
            <span
              aria-hidden="true"
              data-bridge-connector={`${connectors[index - 1]!.fromToothFdi}-${connectors[index - 1]!.toToothFdi}`}
              className="my-auto h-1.5 w-4 shrink-0 bg-muted-foreground/50"
            />
          )}
          <span
            data-bridge-unit={String(unit.toothFdi)}
            data-bridge-role={unit.role}
            data-bridge-support={unit.supportKind}
            className="min-h-11 min-w-11 shrink-0 rounded-sm border px-2 py-1 text-center text-xs tabular-nums data-[bridge-role=PONTIC]:border-dashed data-[bridge-role=PONTIC]:text-muted-foreground"
          >
            {unit.toothFdi}
            <span className="block text-[0.625rem] uppercase">
              {unit.role === "PONTIC" ? "pontic" : "abutment"}
            </span>
          </span>
        </React.Fragment>
      ))}
    </div>
  );
}
