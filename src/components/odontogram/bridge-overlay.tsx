"use client";

import * as React from "react";

// Bridge connector overlay — renders strictly from Bridge DTO units.
// Connectors are derived from the ordered bridge relationship, not from crown overlays or icon state.
// No domain mutation here; geometry is a stable visual projection of the DTO.

export interface BridgeOverlayProps {
  bridgeUnits?: Array<{ tooth_fdi: string; ordinal: number; role: string; support_kind: string }>;
}

export function BridgeOverlay({ bridgeUnits }: BridgeOverlayProps): React.ReactElement | null {
  if (!bridgeUnits || bridgeUnits.length < 2) return null;
  return (
    <div
      data-testid="bridge-overlay"
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-2 top-[58%] h-2 rounded-full bg-emerald-300/60"
      title={`Bridge ${bridgeUnits.map((u) => u.tooth_fdi).join("-")}`}
    />
  );
}
