"use client";

import * as React from "react";

export function OdontogramHelp(): React.ReactElement {
  return (
    <details data-testid="odontogram-help" className="rounded-md border bg-card px-3 py-2 text-sm">
      <summary className="cursor-pointer font-medium">Odontogram help</summary>
      <div className="mt-2 space-y-2 text-xs text-muted-foreground">
        <p>Use Tab to enter the chart, arrow keys to move between teeth, and Home/End to jump to the first or last tooth. Enter or Space selects a tooth.</p>
        <p>Dashed markers are planned proposals; solid markers are current clinical state. Selection changes display state only. Record or amend findings from the authorized patient inspector.</p>
        <p>Touch users can tap a tooth. FDI is canonical; Universal and Palmer labels are display-only.</p>
        <p>Measured anatomy source: <a className="underline" href="https://github.com/Ditherys/React-Odontogram-Modul" target="_blank" rel="noreferrer">Ditherys/React-Odontogram-Modul</a>, pinned at <code>5e28d93</code>. <span>MIT License</span>; see <code>THIRD_PARTY_NOTICES.md</code>.</p>
      </div>
    </details>
  );
}
