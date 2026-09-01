"use client";

import { LoaderCircle } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import type { ClinicalVisitState } from "@/lib/clinical/types";

const clinicalDateFormat = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Manila",
});

function clinicalDateLabel(clinicalDate: string) {
  const parsed = new Date(`${clinicalDate}T00:00:00+08:00`);
  return Number.isNaN(parsed.getTime()) ? clinicalDate : clinicalDateFormat.format(parsed);
}

function visitStateLabel(visit: ClinicalVisitState | null) {
  if (!visit) return "Visit status unavailable";
  const suffix = [clinicalDateLabel(visit.clinicalDate), visit.providerDisplay].filter(Boolean).join(" · ");
  if (visit.status === "OPEN") return `Visit open · ${suffix}`;
  if (visit.status === "FINALIZED") return `Visit finalized · ${suffix}`;
  return `No visit started · ${suffix}`;
}

/**
 * Visit state and the visit lifecycle actions. Rendering this header never opens
 * an encounter: the visit is read on the server and only an explicit press of
 * Start visit or Resume visit reaches the managed visit lifecycle.
 */
export function ClinicalVisitHeader({
  visit,
  canWriteClinical,
  busy = false,
  onStartVisit,
  onFinalizeVisit,
  actions,
}: {
  visit: ClinicalVisitState | null;
  canWriteClinical: boolean;
  busy?: boolean;
  onStartVisit(): void;
  onFinalizeVisit(): void;
  actions?: ReactNode;
}) {
  const writable = canWriteClinical && visit !== null;
  const canStart = writable && visit.status === "NOT_STARTED";
  const canResume = writable && visit.status === "OPEN";

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
      <p data-testid="clinical-visit-state" className="min-w-0 break-words text-sm text-muted-foreground">
        {visitStateLabel(visit)}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {canStart && (
          <Button type="button" className="min-h-11" disabled={busy} onClick={onStartVisit}>
            {busy && <LoaderCircle className="animate-spin" aria-hidden="true" />}
            Start visit
          </Button>
        )}
        {canResume && (
          <>
            <Button type="button" variant="outline" className="min-h-11" disabled={busy} onClick={onStartVisit}>
              {busy && <LoaderCircle className="animate-spin" aria-hidden="true" />}
              Resume visit
            </Button>
            <Button type="button" variant="outline" className="min-h-11" disabled={busy} onClick={onFinalizeVisit}>
              Finalize visit
            </Button>
          </>
        )}
        {actions}
      </div>
    </div>
  );
}
