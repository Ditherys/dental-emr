import { TriangleAlert } from "lucide-react";
import { Fragment } from "react";

import type { MedicalRecord } from "@/lib/clinical/types";
import { cn } from "@/lib/utils";

type SafetyValue = { key: string; label: string; resolved: boolean };
type Group = { key: "conditions" | "allergies" | "medications"; label: string; values: SafetyValue[] };

/**
 * Direction-of-harm decides what the strip shows, so the rule differs per group
 * and is deliberately not blanket:
 *
 * - Medications: active only. A stopped medication read as current is a direct
 *   medication-error risk.
 * - Conditions: active only. A resolved condition read as current is misleading,
 *   and it stays reachable through More clinical actions → Medical history.
 * - Allergies: every non-voided record, with a resolved one explicitly qualified
 *   and de-emphasised. Under-warning on an allergy is the dangerous direction,
 *   so an allergy is never silently dropped.
 *
 * This is a conservative safe-direction default, not a clinical sign-off.
 */
function safetyGroups(records: readonly MedicalRecord[]): Group[] {
  const active = records.filter((record) => record.status === "active");
  const allergies = records.filter(
    (record) => record.recordType === "ALLERGY" && record.status !== "voided",
  );
  return [
    {
      key: "conditions",
      label: "Conditions",
      values: active.flatMap((record) =>
        record.recordType === "CONDITION"
          ? [{ key: record.recordId, label: record.conditionName, resolved: false }]
          : [],
      ),
    },
    {
      key: "allergies",
      label: "Allergies",
      values: allergies.flatMap((record) => {
        if (record.recordType !== "ALLERGY") return [];
        const resolved = record.status !== "active";
        const severity = record.severity ? ` (${record.severity})` : "";
        return [{
          key: record.recordId,
          label: `${record.allergen}${severity}${resolved ? " (resolved)" : ""}`,
          resolved,
        }];
      }),
    },
    {
      key: "medications",
      label: "Medications",
      values: active.flatMap((record) =>
        record.recordType === "MEDICATION"
          ? [{
              key: record.recordId,
              label: record.dose ? `${record.medicationName} ${record.dose}` : record.medicationName,
              resolved: false,
            }]
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
  const groups = safetyGroups(records);
  return (
    <section aria-label="Medical safety summary" className={cn("border-y py-3", className)}>
      <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-3">
        {groups.map((group) => {
          const alerting = group.key === "allergies" && group.values.some((value) => !value.resolved);
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
                {group.values.length === 0
                  ? "None recorded"
                  : group.values.map((value, index) => (
                      <Fragment key={value.key}>
                        {index > 0 && <span aria-hidden="true"> · </span>}
                        <span
                          className={cn(
                            "break-words",
                            value.resolved && "font-normal text-muted-foreground",
                          )}
                        >
                          {value.label}
                        </span>
                      </Fragment>
                    ))}
              </dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}
