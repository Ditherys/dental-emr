"use client";

import type { ProgressEventDTO } from "@/lib/odontogram/progress-record";
import { sortProgressEvents } from "@/lib/odontogram/progress-record";

function dateLabel(timestamp: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Manila",
  }).format(new Date(timestamp));
}

function amountLabel(centavos: string | null): string {
  if (centavos === null) return "";
  const amount = BigInt(centavos);
  const zero = BigInt(0);
  const hundred = BigInt(100);
  const absolute = amount < zero ? -amount : amount;
  return `${amount < zero ? "−" : ""}₱${(absolute / hundred).toString()}.${(absolute % hundred).toString().padStart(2, "0")}`;
}

function eventLabel(event: ProgressEventDTO): string {
  return event.eventType[0] + event.eventType.slice(1).toLowerCase();
}

export function ProgressRecordTable({ events }: { events: readonly ProgressEventDTO[] }): React.ReactElement {
  const chronologicalEvents = sortProgressEvents(events);
  return (
    <section aria-labelledby="progress-record-heading" className="overflow-hidden rounded-md border bg-card">
      <div className="border-b px-3 py-2.5">
        <h3 id="progress-record-heading" className="text-sm font-semibold">Progress record</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">Oldest to newest clinical and case-linked activity.</p>
      </div>
      {chronologicalEvents.length === 0 ? (
        <p className="px-3 py-6 text-sm text-muted-foreground">No progress records yet.</p>
      ) : (
        <>
        <div data-testid="progress-record-table" className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-muted/30 text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">Date</th>
                <th scope="col" className="px-3 py-2 font-medium">Event / procedure</th>
                <th scope="col" className="px-3 py-2 font-medium">Tooth / surface</th>
                <th scope="col" className="px-3 py-2 font-medium">Actor / note</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Charge</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Payment</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Case balance</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {chronologicalEvents.map((event) => (
                <tr key={event.eventId} className="align-top">
                  <td className="whitespace-nowrap px-3 py-3 tabular-nums">{dateLabel(event.occurredAt)}</td>
                  <td className="px-3 py-3"><p className="font-medium">{eventLabel(event)}{event.procedureDisplay ? ` · ${event.procedureDisplay}` : ""}</p>{event.procedureCaseId && <p className="mt-0.5 text-xs text-muted-foreground">Case-linked</p>}</td>
                  <td className="px-3 py-3 text-muted-foreground">{event.toothCodes.length ? `Tooth ${event.toothCodes.join(", ")}` : "—"}{event.surfaces.length ? ` · ${event.surfaces.join(", ")}` : ""}</td>
                  <td className="px-3 py-3"><p>{event.actorDisplay}</p>{event.note && <p className="mt-0.5 max-w-md text-xs text-muted-foreground">{event.note}</p>}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{amountLabel(event.chargeCentavos)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{amountLabel(event.paymentCentavos)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{amountLabel(event.caseBalanceCentavos)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ol data-testid="progress-record-phone-list" aria-label="Progress record on phone" className="divide-y md:hidden">
          {chronologicalEvents.map((event) => (
            <li key={event.eventId} className="px-3 py-3">
              <div className="flex items-start justify-between gap-3">
                <p className="font-medium">{eventLabel(event)}{event.procedureDisplay ? ` · ${event.procedureDisplay}` : ""}</p>
                <time dateTime={event.occurredAt} className="shrink-0 text-xs tabular-nums text-muted-foreground">{dateLabel(event.occurredAt)}</time>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{event.toothCodes.length ? `Tooth ${event.toothCodes.join(", ")}` : "No tooth"}{event.surfaces.length ? ` · ${event.surfaces.join(", ")}` : ""} · {event.actorDisplay}</p>
              {event.note && <p className="mt-1 text-sm text-muted-foreground">{event.note}</p>}
              {(event.chargeCentavos !== null || event.paymentCentavos !== null || event.caseBalanceCentavos !== null) && (
                <p className="mt-1 text-xs tabular-nums text-muted-foreground">{event.chargeCentavos !== null && `Charge ${amountLabel(event.chargeCentavos)}`}{event.paymentCentavos !== null && `${event.chargeCentavos !== null ? " · " : ""}Payment ${amountLabel(event.paymentCentavos)}`}{event.caseBalanceCentavos !== null && `${event.chargeCentavos !== null || event.paymentCentavos !== null ? " · " : ""}Case balance ${amountLabel(event.caseBalanceCentavos)}`}</p>
              )}
            </li>
          ))}
        </ol>
        </>
      )}
    </section>
  );
}
