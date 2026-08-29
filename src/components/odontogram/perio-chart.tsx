"use client";

import * as React from "react";

// Stub - perio chart for O6 scope.
// Real perio workspace lands in O10; this ensures the import graph is stable.

export interface PerioChartProps {
  examinationId?: string;
  readOnly?: boolean;
}

export function PerioChart({ examinationId, readOnly }: PerioChartProps): React.ReactElement {
  return (
    <div
      data-testid="perio-chart-stub"
      data-examination-id={examinationId ?? "none"}
      data-readonly={readOnly ? "1" : "0"}
      className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-center text-sm text-slate-600"
    >
      Perio chart placeholder {examinationId ? `(exam ${examinationId})` : "(no exam)"}
    </div>
  );
}
