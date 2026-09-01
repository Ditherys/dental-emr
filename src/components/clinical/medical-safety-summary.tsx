import { TriangleAlert } from "lucide-react";

import type { MedicalRecord } from "@/lib/clinical/types";
import { cn } from "@/lib/utils";

type Group = { key: "conditions" | "allergies" | "medications"; label: string; values: string[] };

function activeValues(records: readonly MedicalRecord[]): Group[] {
  const active = records.filter((record) => record.status !== "voided");
  return [
    {
      key: "conditions",
      label: "Conditions",
      values: active.flatMap((record) => (record.recordType === "CONDITION" ? [record.conditionName] : [])),
    },
    {
      key: "allergies",
      label: "Allergies",
      values: active.flatMap((record) =>
        record.recordType === "ALLERGY"
          ? [record.severity ? `${record.allergen} (${record.severity})` : record.allergen]
          : [],
      ),
    },
    {
      key: "medications",
      label: "Medications",
      values: active.flatMap((record) =>
        record.recordType === "MEDICATION"
          ? [record.dose ? `${record.medicationName} ${record.dose}` : record.medicationName]
          : [],
      ),
    },
  ];
}

/**
 * The clinical-safety strip. It stays visible for every chart mode and through
 * every bounded region failure, so allergies and active medications are never
 * hidden behind a tab or a retry state.
 */
export function MedicalSafetySummary({
  records,
  className,
}: {
  records: readonly MedicalRecord[];
  className?: string;
}) {
  const groups = activeValues(records);
  return (
    <section aria-label="Medical safety summary" className={cn("border-y py-3", className)}>
      <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-3">
        {groups.map((group) => {
          const alerting = group.key === "allergies" && group.values.length > 0;
          return (
            <div key={group.key} data-testid={`medical-safety-${group.key}`} className="min-w-0">
              <dt className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                {alerting && <TriangleAlert aria-hidden="true" className="size-3.5 text-destructive" />}
                {group.label}
              </dt>
              <dd
                className={cn(
                  "mt-0.5 break-words",
                  group.values.length === 0 && "text-muted-foreground",
                  alerting && "font-medium text-destructive",
                )}
              >
                {group.values.length === 0 ? "None recorded" : group.values.join(" · ")}
              </dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}
