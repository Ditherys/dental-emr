"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CommunicationRecord, CommunicationStatus } from "@/lib/communication/types";

import {
  cancelCommunicationAction,
  loadCommunicationsAction,
  retryCommunicationAction,
} from "./actions";

type Props = {
  actingBranchId: string;
  canSend: boolean;
  initialRows: CommunicationRecord[];
};

const statusLabels: Record<CommunicationStatus, string> = {
  QUEUED: "Queued",
  SENT: "Sent",
  DELIVERED: "Delivered",
  FAILED: "Failed",
  CANCELLED: "Cancelled",
};

const channelLabels: Record<CommunicationRecord["channel"], string> = {
  EMAIL: "Email",
  SMS: "SMS",
};

const templateLabels: Record<CommunicationRecord["templateType"], string> = {
  CONFIRMATION: "Confirmation",
  REMINDER: "Reminder",
  RESCHEDULE: "Reschedule",
  CANCELLATION: "Cancellation",
};

const statusOptions: Array<{ value: CommunicationStatus | ""; label: string }> = [
  { value: "", label: "All statuses" },
  { value: "QUEUED", label: "Queued" },
  { value: "SENT", label: "Sent" },
  { value: "DELIVERED", label: "Delivered" },
  { value: "FAILED", label: "Failed" },
  { value: "CANCELLED", label: "Cancelled" },
];

function formatDateTime(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

function statusTime(record: CommunicationRecord) {
  switch (record.status) {
    case "QUEUED":
      return record.nextAttemptAt ? { label: "Next attempt", value: record.nextAttemptAt } : null;
    case "SENT":
      return record.sentAt ? { label: "Sent", value: record.sentAt } : null;
    case "DELIVERED":
      return record.deliveredAt ? { label: "Delivered", value: record.deliveredAt } : null;
    case "FAILED":
      return record.failedAt ? { label: "Failed", value: record.failedAt } : null;
    case "CANCELLED":
      return record.cancelledAt ? { label: "Cancelled", value: record.cancelledAt } : null;
  }
}

function StatusPill({ status }: { status: CommunicationStatus }) {
  const tone =
    status === "FAILED"
      ? "border-destructive/30 bg-destructive/10 text-destructive"
      : status === "QUEUED" || status === "CANCELLED"
        ? "border-border bg-subtle-surface/60 text-muted-foreground"
        : "border-info/30 bg-info-soft text-info";
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[0.6875rem] font-medium", tone)}>
      {statusLabels[status]}
    </span>
  );
}

function RowActions({ record, busy, onCancel, onRetry }: {
  record: CommunicationRecord;
  busy: boolean;
  onCancel(record: CommunicationRecord): Promise<void>;
  onRetry(record: CommunicationRecord): Promise<void>;
}) {
  if (record.status === "FAILED") {
    return (
      <Button type="button" variant="outline" className="min-h-11" disabled={busy} onClick={() => void onRetry(record)}>
        Retry
      </Button>
    );
  }
  if (record.status === "QUEUED") {
    return (
      <Button type="button" variant="outline" className="min-h-11" disabled={busy} onClick={() => void onCancel(record)}>
        Cancel
      </Button>
    );
  }
  return null;
}

function CommunicationRow({ record, canSend, busy, onCancel, onRetry }: {
  record: CommunicationRecord;
  canSend: boolean;
  busy: boolean;
  onCancel(record: CommunicationRecord): Promise<void>;
  onRetry(record: CommunicationRecord): Promise<void>;
}) {
  const time = statusTime(record);
  return (
    <tr className="border-b last:border-0">
      <td className="px-3 py-3"><StatusPill status={record.status} /></td>
      <td className="px-3 py-3">{channelLabels[record.channel]}</td>
      <td className="px-3 py-3 text-muted-foreground">{templateLabels[record.templateType]}</td>
      <td className="px-3 py-3 font-mono text-xs text-muted-foreground">{record.maskedRecipient}</td>
      <td className="px-3 py-3 tabular-nums">{record.attempts}</td>
      <td className="px-3 py-3 text-muted-foreground">
        {time ? (
          <span>
            <span className="mr-1 text-xs">{time.label}</span>
            <span className="tabular-nums">{formatDateTime(time.value)}</span>
          </span>
        ) : (
          "—"
        )}
      </td>
      {canSend && (
        <td className="px-3 py-3">
          <RowActions record={record} busy={busy} onCancel={onCancel} onRetry={onRetry} />
        </td>
      )}
    </tr>
  );
}

function CommunicationListItem({ record, canSend, busy, onCancel, onRetry }: {
  record: CommunicationRecord;
  canSend: boolean;
  busy: boolean;
  onCancel(record: CommunicationRecord): Promise<void>;
  onRetry(record: CommunicationRecord): Promise<void>;
}) {
  const time = statusTime(record);
  return (
    <li className="py-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium">
          {channelLabels[record.channel]} · {templateLabels[record.templateType]}
        </p>
        <StatusPill status={record.status} />
      </div>
      <p className="mt-1 font-mono text-xs text-muted-foreground">{record.maskedRecipient}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        {time ? `${time.label} ${formatDateTime(time.value)}` : "—"}
        {" · "}
        {record.attempts} {record.attempts === 1 ? "attempt" : "attempts"}
      </p>
      {canSend && (
        <div className="mt-2">
          <RowActions record={record} busy={busy} onCancel={onCancel} onRetry={onRetry} />
        </div>
      )}
    </li>
  );
}

export function CommunicationsBoard({ actingBranchId, canSend, initialRows }: Props) {
  const [rows, setRows] = useState<CommunicationRecord[]>(initialRows);
  const [statusFilter, setStatusFilter] = useState<CommunicationStatus | "">("");
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const skipFirstLoad = useRef(true);

  useEffect(() => {
    if (skipFirstLoad.current) {
      skipFirstLoad.current = false;
      return;
    }
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    loadCommunicationsAction({ actingBranchId, status: statusFilter || null })
      .then((result) => {
        if (cancelled) return;
        if (result.ok) setRows(result.rows);
        else setLoadError(result.message);
      })
      .catch(() => {
        if (!cancelled) setLoadError("The communications could not be loaded. Refresh to try again.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [actingBranchId, statusFilter, reloadTick]);

  function onMutated() {
    setReloadTick((tick) => tick + 1);
  }

  async function runCancel(record: CommunicationRecord) {
    setBusyId(record.communicationId);
    setActionError(null);
    try {
      const result = await cancelCommunicationAction({
        actingBranchId,
        communicationId: record.communicationId,
        expectedVersion: record.version,
      });
      if (!result.ok) return setActionError(result.message);
      setActionError(null);
      toast.success("Communication cancelled.");
      onMutated();
    } catch {
      setActionError("The communication could not be cancelled. Try again.");
    } finally {
      setBusyId(null);
    }
  }

  async function runRetry(record: CommunicationRecord) {
    setBusyId(record.communicationId);
    setActionError(null);
    try {
      const result = await retryCommunicationAction({
        actingBranchId,
        communicationId: record.communicationId,
        expectedVersion: record.version,
      });
      if (!result.ok) return setActionError(result.message);
      setActionError(null);
      toast.success("Retry queued for delivery.");
      onMutated();
    } catch {
      setActionError("The communication could not be retried. Try again.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section aria-labelledby="communications-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="communications-title" className="text-base font-semibold">Outbound communications</h2>
        <label className="grid gap-1.5 text-sm font-medium">
          <span className="sr-only">Filter by status</span>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter((event.target.value || "") as CommunicationStatus | "")}
            className="h-11 rounded-md border bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
          >
            {statusOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
      </div>
      {loading && <p className="mt-2 text-xs text-muted-foreground">Updating communications…</p>}
      {loadError && <p role="alert" className="mt-3 border-y border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive">{loadError}</p>}
      {actionError && <p role="alert" className="mt-3 border-y border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive">{actionError}</p>}

      <div className="mt-3 hidden overflow-x-auto border-y md:block">
        <table className="w-full text-left text-sm" aria-label="Outbound communications">
          <caption className="sr-only">Communications for the acting branch</caption>
          <thead className="bg-subtle-surface text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="px-3 py-2.5 font-medium">Status</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Channel</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Template</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Recipient</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Attempts</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Time</th>
              {canSend && <th scope="col" className="px-3 py-2.5 font-medium">Action</th>}
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={canSend ? 7 : 6} className="px-3 py-6 text-sm text-muted-foreground">No communications found.</td>
              </tr>
            ) : (
              rows.map((record) => (
                <CommunicationRow key={record.communicationId} record={record} canSend={canSend} busy={busyId === record.communicationId} onCancel={runCancel} onRetry={runRetry} />
              ))
            )}
          </tbody>
        </table>
      </div>

      <ul className="mt-4 divide-y border-y md:hidden" aria-label="Outbound communications list">
        {rows.length === 0 ? (
          <li className="px-3 py-6 text-sm text-muted-foreground">No communications found.</li>
        ) : (
          rows.map((record) => (
            <CommunicationListItem key={record.communicationId} record={record} canSend={canSend} busy={busyId === record.communicationId} onCancel={runCancel} onRetry={runRetry} />
          ))
        )}
      </ul>
    </section>
  );
}