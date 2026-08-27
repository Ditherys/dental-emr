"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { BookingRequest, BookingRequestStatus, BookingReviewAction } from "@/lib/booking/types";

import {
  loadBookingRequestsAction,
  reviewBookingRequestAction,
} from "./actions";

type Props = {
  actingBranchId: string;
  initialRows: BookingRequest[];
};

const statusLabels: Record<BookingRequestStatus, string> = {
  SUBMITTED: "Submitted",
  UNDER_REVIEW: "Under review",
  APPROVED: "Approved",
  DECLINED: "Declined",
  CONVERTED: "Converted",
  SPAM: "Spam",
  CANCELLED: "Cancelled",
};

function statusTone(status: BookingRequestStatus) {
  switch (status) {
    case "APPROVED":
    case "CONVERTED":
      return "border-success/30 bg-success-soft text-success";
    case "DECLINED":
    case "CANCELLED":
      return "border-destructive/30 bg-destructive/10 text-destructive";
    case "UNDER_REVIEW":
      return "border-info/30 bg-info-soft text-info";
    case "SUBMITTED":
      return "border-warning/30 bg-warning-soft text-warning";
    case "SPAM":
      return "border-border bg-subtle-surface/60 text-muted-foreground";
  }
}

function StatusPill({ status }: { status: BookingRequestStatus }) {
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[0.6875rem] font-medium", statusTone(status))}>
      {statusLabels[status]}
    </span>
  );
}

function formatDateTime(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

function windowLabel(request: BookingRequest) {
  if (!request.requestedStartsAt) return "No preferred time";
  if (!request.requestedEndsAt) return formatDateTime(request.requestedStartsAt);
  return `${formatDateTime(request.requestedStartsAt)} – ${formatDateTime(request.requestedEndsAt)}`;
}

function isActionable(status: BookingRequestStatus) {
  return status === "SUBMITTED" || status === "UNDER_REVIEW";
}

function ReviewDialog({
  request,
  onClose,
  actingBranchId,
  onMutated,
}: {
  request: BookingRequest;
  onClose(): void;
  actingBranchId: string;
  onMutated(): void;
}) {
  const [action, setAction] = useState<BookingReviewAction>("APPROVE");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const result = await reviewBookingRequestAction({
        actingBranchId,
        requestId: request.requestId,
        expectedVersion: request.version,
        action,
        reason: reason.trim() || null,
      });
      if (!result.ok) return setError(result.message);
      onClose();
      onMutated();
      toast.success(action === "APPROVE" ? "Booking request approved." : action === "DECLINE" ? "Booking request declined." : "Booking request marked as spam.");
    } catch {
      setError("The booking request could not be reviewed. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(next) => { if (!next && !saving) onClose(); }}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Review booking request</DialogTitle>
          <DialogDescription>
            Only the minimal submitted contact details are shown. Approving an instant booking converts it to a real appointment.
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-md border bg-subtle-surface/60 px-3 py-2 text-sm">
          <p className="font-medium">{request.firstName} {request.lastName}</p>
          <p className="mt-0.5 text-muted-foreground">{request.mobile}{request.email ? ` · ${request.email}` : ""}</p>
          <p className="mt-0.5 text-muted-foreground">{request.requestedProcedureName ?? "Unknown procedure"}{request.requestedProviderDisplayName ? ` · ${request.requestedProviderDisplayName}` : ""}</p>
          <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">{windowLabel(request)}</p>
        </div>
        {error && <p role="alert" className="border-y border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p>}
        <div className="grid gap-4">
          <div className="flex flex-wrap gap-2">
            {(["APPROVE", "DECLINE", "SPAM"] as const).map((option) => (
              <Button
                key={option}
                type="button"
                variant={action === option ? "default" : "outline"}
                className="min-h-11"
                onClick={() => setAction(option)}
              >
                {option === "APPROVE" ? "Approve" : option === "DECLINE" ? "Decline" : "Mark as spam"}
              </Button>
            ))}
          </div>
          <label className="grid gap-1.5 text-sm font-medium">
            Reason <span className="font-normal text-muted-foreground">(optional)</span>
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={3}
              maxLength={500}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
            />
          </label>
        </div>
        <Button type="button" size="lg" className="min-h-11" onClick={() => void submit()} disabled={saving}>
          {saving ? "Submitting..." : "Confirm review"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

function RequestRow({ request, onReview }: {
  request: BookingRequest;
  onReview(request: BookingRequest): void;
}) {
  return (
    <tr className="border-b last:border-0">
      <td className="px-3 py-3"><StatusPill status={request.status} /></td>
      <td className="px-3 py-3 font-medium">{request.firstName} {request.lastName}</td>
      <td className="px-3 py-3 text-muted-foreground">
        <p>{request.mobile}</p>
        {request.email && <p className="text-xs">{request.email}</p>}
      </td>
      <td className="px-3 py-3 text-muted-foreground">{request.requestedProcedureName ?? "Unknown procedure"}</td>
      <td className="px-3 py-3 text-muted-foreground">{request.requestedProviderDisplayName ?? "Any available provider"}</td>
      <td className="px-3 py-3 tabular-nums text-muted-foreground">{windowLabel(request)}</td>
      <td className="px-3 py-3">
        {isActionable(request.status) && (
          <Button type="button" variant="outline" className="min-h-11" onClick={() => onReview(request)}>
            Review
          </Button>
        )}
      </td>
    </tr>
  );
}

function RequestListItem({ request, onReview }: {
  request: BookingRequest;
  onReview(request: BookingRequest): void;
}) {
  return (
    <li className="py-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium">{request.firstName} {request.lastName}</p>
        <StatusPill status={request.status} />
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{request.mobile}{request.email ? ` · ${request.email}` : ""}</p>
      <p className="mt-1 text-sm text-muted-foreground">
        {request.requestedProcedureName ?? "Unknown procedure"}
        {" · "}
        {request.requestedProviderDisplayName ?? "Any available provider"}
      </p>
      <p className="mt-1 text-xs text-muted-foreground tabular-nums">{windowLabel(request)}</p>
      {isActionable(request.status) && (
        <div className="mt-3">
          <Button type="button" variant="outline" className="min-h-11" onClick={() => onReview(request)}>
            Review
          </Button>
        </div>
      )}
    </li>
  );
}

export function BookingRequestsBoard({ actingBranchId, initialRows }: Props) {
  const [rows, setRows] = useState<BookingRequest[]>(initialRows);
  const [statusFilter, setStatusFilter] = useState<BookingRequestStatus | "">("SUBMITTED");
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reviewTarget, setReviewTarget] = useState<BookingRequest | null>(null);
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
    loadBookingRequestsAction({ actingBranchId, status: statusFilter || null })
      .then((result) => {
        if (cancelled) return;
        if (result.ok) setRows(result.rows);
        else setLoadError(result.message);
      })
      .catch(() => {
        if (!cancelled) setLoadError("The booking requests could not be loaded. Refresh to try again.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [actingBranchId, statusFilter, reloadTick]);

  function onMutated() {
    setReloadTick((tick) => tick + 1);
  }

  const statusOptions: Array<{ value: BookingRequestStatus | ""; label: string }> = [
    { value: "", label: "All statuses" },
    ...Object.entries(statusLabels).map(([value, label]) => ({ value: value as BookingRequestStatus, label })),
  ];

  return (
    <section aria-labelledby="booking-requests-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="booking-requests-title" className="text-base font-semibold">Booking requests</h2>
        <label className="grid gap-1.5 text-sm font-medium">
          <span className="sr-only">Filter by status</span>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter((event.target.value || "") as BookingRequestStatus | "")}
            className="h-11 rounded-md border bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
          >
            {statusOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
      </div>
      {loading && <p className="mt-2 text-xs text-muted-foreground">Updating booking requests…</p>}
      {loadError && <p role="alert" className="mt-3 border-y border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive">{loadError}</p>}

      <div className="mt-3 hidden overflow-x-auto border-y md:block">
        <table className="w-full text-left text-sm" aria-label="Booking requests">
          <caption className="sr-only">Public website booking requests for the acting branch</caption>
          <thead className="bg-subtle-surface text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="px-3 py-2.5 font-medium">Status</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Name</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Contact</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Procedure</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Requested provider</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Requested window</th>
              <th scope="col" className="px-3 py-2.5 font-medium"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-sm text-muted-foreground">No booking requests found.</td>
              </tr>
            ) : (
              rows.map((request) => (
                <RequestRow key={request.requestId} request={request} onReview={setReviewTarget} />
              ))
            )}
          </tbody>
        </table>
      </div>

      <ul className="mt-4 divide-y border-y md:hidden" aria-label="Booking requests list">
        {rows.length === 0 ? (
          <li className="px-3 py-6 text-sm text-muted-foreground">No booking requests found.</li>
        ) : (
          rows.map((request) => (
            <RequestListItem key={request.requestId} request={request} onReview={setReviewTarget} />
          ))
        )}
      </ul>

      {reviewTarget && (
        <ReviewDialog
          request={reviewTarget}
          onClose={() => setReviewTarget(null)}
          actingBranchId={actingBranchId}
          onMutated={onMutated}
        />
      )}
    </section>
  );
}