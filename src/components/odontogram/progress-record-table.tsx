import {
  clinicalProgressAmountLabel,
  clinicalProgressDateLabel,
  clinicalProgressEventLabel,
  clinicalProgressProcedureLabel,
  clinicalProgressTimeLabel,
  clinicalProgressToothLabel,
  type ClinicalProgressRecord,
  type ClinicalProgressRow,
} from "@/lib/odontogram/progress-record";

/**
 * The chronological clinical record, read the way a paper progress note is
 * read: oldest first, one line per recorded event, in exactly the order the
 * server returned. Nothing here groups by day, by case or by kind - a grouping
 * that reorders the sequence stops it being the record.
 *
 * No sort, no merge and no arithmetic happens in this component. The three
 * money columns are the procedure case's ledger position as computed server
 * side at read time; the caption says so, because they are deliberately not an
 * account running total.
 */

function eventTitle(row: ClinicalProgressRow): string {
  const procedure = clinicalProgressProcedureLabel(row);
  const label = clinicalProgressEventLabel(row.eventType);
  return procedure === null ? label : `${label} · ${procedure}`;
}

function DateCell({ row }: { row: ClinicalProgressRow }) {
  return (
    <time dateTime={row.occurredAt} className="whitespace-nowrap tabular-nums">
      {clinicalProgressDateLabel(row.occurredAt)}
      <span className="ml-1.5 text-muted-foreground">{clinicalProgressTimeLabel(row.occurredAt)}</span>
    </time>
  );
}

export function ProgressRecordTable({ record }: { record: ClinicalProgressRecord }): React.ReactElement {
  const { rows, financialVisible, hasMore } = record;

  return (
    <section
      aria-labelledby="progress-record-heading"
      data-testid="progress-record"
      className="overflow-hidden rounded-md border bg-card"
    >
      <div className="border-b px-3 py-2.5">
        <h3 id="progress-record-heading" className="text-sm font-semibold">
          Progress record
        </h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {financialVisible
            ? "Oldest first. Charge, paid and balance are the procedure case position derived from the billing ledger when the record was read, not an account running total."
            : "Oldest first. Your current access does not include this patient account, so no charge, payment or balance is shown."}
        </p>
        {hasMore && (
          <p className="mt-1 text-xs text-muted-foreground">
            This page is bounded; older and newer entries are not shown.
          </p>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="px-3 py-6 text-sm text-muted-foreground">
          Nothing has been recorded for this patient yet. An empty record is not an uneventful history.
        </p>
      ) : (
        <>
          <div data-testid="progress-record-table" className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[820px] text-left text-sm">
              <caption className="sr-only">
                Patient progress record, oldest first, one row per recorded clinical or ledger event.
              </caption>
              <thead className="bg-muted/30 text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">Date / time</th>
                  <th scope="col" className="px-3 py-2 font-medium">Procedure / event</th>
                  <th scope="col" className="px-3 py-2 font-medium">Tooth</th>
                  <th scope="col" className="px-3 py-2 font-medium">Provider</th>
                  {financialVisible && (
                    <>
                      <th scope="col" className="px-3 py-2 text-right font-medium">Charge</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">Paid</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">Balance</th>
                    </>
                  )}
                  <th scope="col" className="px-3 py-2 font-medium">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((row) => (
                  <tr key={row.eventId} className="align-top">
                    <td className="px-3 py-2.5"><DateCell row={row} /></td>
                    <td className="px-3 py-2.5 font-medium">{eventTitle(row)}</td>
                    <td className="px-3 py-2.5 tabular-nums text-muted-foreground">
                      {clinicalProgressToothLabel(row.toothCodes)}
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">{row.providerDisplay}</td>
                    {financialVisible && (
                      <>
                        <td className="px-3 py-2.5 text-right tabular-nums">{clinicalProgressAmountLabel(row.chargeMinor)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{clinicalProgressAmountLabel(row.paidMinor)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{clinicalProgressAmountLabel(row.balanceMinor)}</td>
                      </>
                    )}
                    <td className="max-w-md px-3 py-2.5 text-muted-foreground">{row.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Phone: the same chronology in the same order, each entry carrying
              the same information behind an explicit expand control. A native
              disclosure needs no JavaScript and stays open across a resize. */}
          <ol
            data-testid="progress-record-phone-list"
            aria-label="Progress record"
            className="divide-y md:hidden"
          >
            {rows.map((row) => (
              <li key={row.eventId}>
                <details className="group px-3 py-1.5">
                  <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 py-1.5 [&::-webkit-details-marker]:hidden">
                    <span className="min-w-0">
                      <span className="block font-medium">{eventTitle(row)}</span>
                      <span className="block text-xs text-muted-foreground">
                        {clinicalProgressDateLabel(row.occurredAt)} · {clinicalProgressTimeLabel(row.occurredAt)}
                      </span>
                    </span>
                    <span aria-hidden="true" className="shrink-0 text-xs text-muted-foreground group-open:hidden">Show</span>
                    <span aria-hidden="true" className="hidden shrink-0 text-xs text-muted-foreground group-open:inline">Hide</span>
                  </summary>
                  <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 pb-3 text-sm">
                    {clinicalProgressToothLabel(row.toothCodes) !== null && (
                      <>
                        <dt className="text-xs text-muted-foreground">Tooth</dt>
                        <dd className="tabular-nums">{clinicalProgressToothLabel(row.toothCodes)}</dd>
                      </>
                    )}
                    {row.providerDisplay !== null && (
                      <>
                        <dt className="text-xs text-muted-foreground">Provider</dt>
                        <dd>{row.providerDisplay}</dd>
                      </>
                    )}
                    {financialVisible && row.chargeMinor !== null && (
                      <>
                        <dt className="text-xs text-muted-foreground">Charge</dt>
                        <dd className="tabular-nums">{clinicalProgressAmountLabel(row.chargeMinor)}</dd>
                        <dt className="text-xs text-muted-foreground">Paid</dt>
                        <dd className="tabular-nums">{clinicalProgressAmountLabel(row.paidMinor)}</dd>
                        <dt className="text-xs text-muted-foreground">Balance</dt>
                        <dd className="tabular-nums">{clinicalProgressAmountLabel(row.balanceMinor)}</dd>
                      </>
                    )}
                    {row.description !== "" && (
                      <>
                        <dt className="text-xs text-muted-foreground">Notes</dt>
                        <dd className="break-words">{row.description}</dd>
                      </>
                    )}
                  </dl>
                </details>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}
