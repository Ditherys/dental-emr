"use client";

import { LoaderCircle, Plus, Search } from "lucide-react";
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
import type { PatientListItem } from "@/lib/patients/types";
import type { ProviderListItem, Specialty } from "@/lib/providers/types";
import type { SpecialistRequest, SpecialistRequestStatus } from "@/lib/specialist/types";

import { searchPatientsAction } from "../patients/actions";
import {
  cancelSpecialistRequestAction,
  createSpecialistRequestAction,
  loadSpecialistRequestsAction,
  respondSpecialistRequestAction,
} from "./actions";

type Props = {
  actingBranchId: string;
  canRespond: boolean;
  initialRows: SpecialistRequest[];
  providers: ProviderListItem[];
  specialties: Specialty[];
};

const inputClass =
  "h-11 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30";

const statusLabels: Record<SpecialistRequestStatus, string> = {
  DRAFT: "Draft",
  SENT: "Sent",
  ACCEPTED: "Accepted",
  ASSIGNED: "Assigned",
  DECLINED: "Declined",
  ALTERNATE_TIME_REQUESTED: "Alternate time",
  EXPIRED: "Expired",
  CANCELLED: "Cancelled",
};

function statusTone(status: SpecialistRequestStatus) {
  switch (status) {
    case "ACCEPTED":
    case "ASSIGNED":
      return "border-success/30 bg-success-soft text-success";
    case "DECLINED":
    case "CANCELLED":
      return "border-destructive/30 bg-destructive/10 text-destructive";
    case "ALTERNATE_TIME_REQUESTED":
      return "border-warning/30 bg-warning-soft text-warning";
    case "EXPIRED":
    case "DRAFT":
      return "border-border bg-subtle-surface/60 text-muted-foreground";
    case "SENT":
      return "border-info/30 bg-info-soft text-info";
  }
}

function StatusPill({ status }: { status: SpecialistRequestStatus }) {
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

function windowLabel(request: SpecialistRequest) {
  if (!request.requestedStartsAt) return "Any time";
  if (!request.requestedEndsAt) return formatDateTime(request.requestedStartsAt);
  return `${formatDateTime(request.requestedStartsAt)} – ${formatDateTime(request.requestedEndsAt)}`;
}

function channelLabel(channel: SpecialistRequest["requestChannel"]) {
  return channel === "EMAIL" ? "Email" : "SMS";
}

function validateWindow(startsAt: string, endsAt: string, required = false): string | null {
  if (!startsAt && !endsAt) return required ? "Provide both a start and an end time for the requested window." : null;
  if (!startsAt || !endsAt) return "Provide both a start and an end time for the requested window.";
  if (Date.parse(endsAt) <= Date.parse(startsAt)) return "The end time must be after the start time.";
  return null;
}

function PatientPicker({ actingBranchId, onSelect }: { actingBranchId: string; onSelect(patient: PatientListItem): void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PatientListItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runSearch() {
    setSearching(true);
    setError(null);
    try {
      const result = await searchPatientsAction({
        actingBranchId,
        query: query.trim() || undefined,
        status: "active",
        sort: "name_asc",
        page: 1,
        pageSize: 20,
      });
      if (!result.ok) {
        setResults([]);
        setError(result.code === "NOT_AUTHORIZED" ? "Your access does not allow searching patients." : "Patients could not be searched. Try again.");
        return;
      }
      setResults(result.rows);
      if (result.rows.length === 0) setError("No patients match that search.");
    } catch {
      setResults([]);
      setError("Patients could not be searched. Try again.");
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="grid gap-1.5">
      <span className="text-sm font-medium">Patient</span>
      <div className="flex gap-2">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void runSearch(); } }}
          placeholder="Name or patient number"
          className={inputClass}
        />
        <Button type="button" variant="outline" className="min-h-11 shrink-0" onClick={() => void runSearch()} disabled={searching}>
          {searching ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Search aria-hidden="true" />}
          <span className="sr-only">Search</span>
        </Button>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {results.length > 0 && (
        <ul className="divide-y rounded-md border" aria-label="Patient search results">
          {results.map((patient) => (
            <li key={patient.patientId}>
              <button
                type="button"
                onClick={() => { onSelect(patient); setResults([]); setQuery(""); }}
                className="flex min-h-11 w-full items-center justify-between gap-3 px-3 py-2 text-left outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/30"
              >
                <span className="truncate font-medium">{patient.displayName}</span>
                <span className="shrink-0 font-mono text-xs text-muted-foreground">{patient.patientNumber}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CreateRequestDialog({
  open,
  onClose,
  actingBranchId,
  providers,
  specialties,
  onMutated,
}: {
  open: boolean;
  onClose(): void;
  actingBranchId: string;
  providers: ProviderListItem[];
  specialties: Specialty[];
  onMutated(): void;
}) {
  const [selectedPatient, setSelectedPatient] = useState<PatientListItem | null>(null);
  const [specialtyId, setSpecialtyId] = useState("");
  const [providerId, setProviderId] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [caseSummary, setCaseSummary] = useState("");
  const [channel, setChannel] = useState<"EMAIL" | "SMS">("EMAIL");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const problem = validateWindow(startsAt, endsAt);
    if (problem) return setError(problem);
    if (!selectedPatient) return setError("Select a patient.");
    if (!caseSummary.trim()) return setError("Add a short, non-clinical case summary.");
    setSaving(true);
    setError(null);
    try {
      const result = await createSpecialistRequestAction({
        actingBranchId,
        patientId: selectedPatient.patientId,
        requiredSpecialtyId: specialtyId || null,
        requestedProviderId: providerId || null,
        requestedStartsAt: startsAt ? new Date(startsAt).toISOString() : null,
        requestedEndsAt: endsAt ? new Date(endsAt).toISOString() : null,
        caseSummary: caseSummary.trim(),
        requestChannel: channel,
      });
      if (!result.ok) return setError(result.message);
      onClose();
      onMutated();
      toast.success("Specialist request sent.");
    } catch {
      setError("The specialist request could not be created. Try again.");
    } finally {
      setSaving(false);
    }
  }

  const activeProviders = providers.filter((provider) => provider.status === "active");
  const activeSpecialties = specialties.filter((specialty) => specialty.isActive);

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && !saving) onClose(); }}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Request specialist availability</DialogTitle>
          <DialogDescription>Shares only the minimal case summary with the requested provider. Never include clinical history.</DialogDescription>
        </DialogHeader>
        {error && <p role="alert" className="border-y border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p>}
        <div className="grid gap-4">
          <PatientPicker actingBranchId={actingBranchId} onSelect={setSelectedPatient} />
          {selectedPatient && (
            <p className="flex items-center justify-between gap-3 rounded-md border bg-subtle-surface/60 px-3 py-2 text-sm">
              <span className="truncate font-medium">{selectedPatient.displayName}</span>
              <Button type="button" variant="ghost" className="min-h-11 shrink-0" onClick={() => setSelectedPatient(null)}>Change</Button>
            </p>
          )}
          {activeSpecialties.length > 0 && (
            <label className="grid gap-1.5 text-sm font-medium">
              Specialty <span className="font-normal text-muted-foreground">(optional)</span>
              <select value={specialtyId} onChange={(event) => setSpecialtyId(event.target.value)} className={inputClass}>
                <option value="">Any specialty</option>
                {activeSpecialties.map((specialty) => (
                  <option key={specialty.specialtyId} value={specialty.specialtyId}>{specialty.name}</option>
                ))}
              </select>
            </label>
          )}
          {activeProviders.length > 0 && (
            <label className="grid gap-1.5 text-sm font-medium">
              Requested provider <span className="font-normal text-muted-foreground">(optional)</span>
              <select value={providerId} onChange={(event) => setProviderId(event.target.value)} className={inputClass}>
                <option value="">Any available specialist</option>
                {activeProviders.map((provider) => (
                  <option key={provider.providerId} value={provider.providerId}>{provider.displayName}</option>
                ))}
              </select>
            </label>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm font-medium">
              Requested from
              <input type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} className={inputClass} />
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              Requested to
              <input type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} className={inputClass} />
            </label>
          </div>
          <label className="grid gap-1.5 text-sm font-medium">
            Contact channel
            <select value={channel} onChange={(event) => setChannel(event.target.value as "EMAIL" | "SMS")} className={inputClass}>
              <option value="EMAIL">Email</option>
              <option value="SMS">SMS</option>
            </select>
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            Case summary
            <textarea
              value={caseSummary}
              onChange={(event) => setCaseSummary(event.target.value)}
              rows={3}
              maxLength={1000}
              placeholder="e.g. Needs an extraction assessment and possible referral."
              className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
            />
            <span className="text-xs text-muted-foreground">{caseSummary.length}/1000 characters</span>
          </label>
        </div>
        <Button type="button" size="lg" className="min-h-11" onClick={() => void submit()} disabled={saving}>
          {saving ? "Sending..." : "Send request"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

function RespondDialog({
  request,
  onClose,
  actingBranchId,
  onMutated,
}: {
  request: SpecialistRequest;
  onClose(): void;
  actingBranchId: string;
  onMutated(): void;
}) {
  const [action, setAction] = useState<"ACCEPT" | "DECLINE" | "ALTERNATE_TIME">("ACCEPT");
  const [message, setMessage] = useState("");
  const [alternateStartsAt, setAlternateStartsAt] = useState("");
  const [alternateEndsAt, setAlternateEndsAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (action === "ALTERNATE_TIME") {
      const problem = validateWindow(alternateStartsAt, alternateEndsAt, true);
      if (problem) return setError(problem);
    }
    setSaving(true);
    setError(null);
    try {
      const result = await respondSpecialistRequestAction({
        actingBranchId,
        requestId: request.requestId,
        expectedVersion: request.version,
        action,
        message: message.trim() || null,
        alternateStartsAt: action === "ALTERNATE_TIME" ? new Date(alternateStartsAt).toISOString() : null,
        alternateEndsAt: action === "ALTERNATE_TIME" ? new Date(alternateEndsAt).toISOString() : null,
      });
      if (!result.ok) return setError(result.message);
      onClose();
      onMutated();
      toast.success("Response sent.");
    } catch {
      setError("The specialist request could not be responded to. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(next) => { if (!next && !saving) onClose(); }}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Respond to {request.patientDisplayName}&apos;s request</DialogTitle>
          <DialogDescription>Only the assigned provider or an organization administrator can respond.</DialogDescription>
        </DialogHeader>
        {error && <p role="alert" className="border-y border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p>}
        <div className="grid gap-4">
          <div className="flex flex-wrap gap-2">
            {(["ACCEPT", "DECLINE", "ALTERNATE_TIME"] as const).map((option) => (
              <Button
                key={option}
                type="button"
                variant={action === option ? "default" : "outline"}
                className="min-h-11"
                onClick={() => setAction(option)}
              >
                {option === "ACCEPT" ? "Accept" : option === "DECLINE" ? "Decline" : "Alternate time"}
              </Button>
            ))}
          </div>
          {action === "ALTERNATE_TIME" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1.5 text-sm font-medium">
                Alternate from
                <input type="datetime-local" value={alternateStartsAt} onChange={(event) => setAlternateStartsAt(event.target.value)} className={inputClass} />
              </label>
              <label className="grid gap-1.5 text-sm font-medium">
                Alternate to
                <input type="datetime-local" value={alternateEndsAt} onChange={(event) => setAlternateEndsAt(event.target.value)} className={inputClass} />
              </label>
            </div>
          )}
          <label className="grid gap-1.5 text-sm font-medium">
            Message <span className="font-normal text-muted-foreground">(optional)</span>
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              rows={3}
              maxLength={1000}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
            />
          </label>
        </div>
        <Button type="button" size="lg" className="min-h-11" onClick={() => void submit()} disabled={saving}>
          {saving ? "Sending..." : "Send response"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

function RowActions({ request, busy, onRespond, onCancel }: {
  request: SpecialistRequest;
  busy: boolean;
  onRespond(request: SpecialistRequest): void;
  onCancel(request: SpecialistRequest): void;
}) {
  if (request.status !== "SENT" && request.status !== "ALTERNATE_TIME_REQUESTED") return null;
  return (
    <div className="flex flex-wrap justify-end gap-2">
      <Button type="button" variant="outline" className="min-h-11" disabled={busy} onClick={() => onRespond(request)}>Respond</Button>
      <Button type="button" variant="outline" className="min-h-11" disabled={busy} onClick={() => onCancel(request)}>Cancel</Button>
    </div>
  );
}

function RequestRow({ request, canRespond, busy, onRespond, onCancel }: {
  request: SpecialistRequest;
  canRespond: boolean;
  busy: boolean;
  onRespond(request: SpecialistRequest): void;
  onCancel(request: SpecialistRequest): void;
}) {
  return (
    <tr className="border-b last:border-0">
      <td className="px-3 py-3"><StatusPill status={request.status} /></td>
      <td className="px-3 py-3 font-medium">{request.patientDisplayName}</td>
      <td className="px-3 py-3 text-muted-foreground">{request.requiredSpecialtyName ?? "Any specialty"}</td>
      <td className="px-3 py-3 text-muted-foreground">{request.requestedProviderDisplayName ?? "Any available specialist"}</td>
      <td className="px-3 py-3 tabular-nums">{windowLabel(request)}</td>
      <td className="px-3 py-3 text-muted-foreground">{channelLabel(request.requestChannel)}</td>
      <td className="max-w-72 px-3 py-3">
        <p className="line-clamp-2 text-muted-foreground" title={request.caseSummary}>{request.caseSummary}</p>
        {request.responseMessage && <p className="mt-1 text-xs text-muted-foreground">Response: {request.responseMessage}</p>}
      </td>
      {canRespond && (
        <td className="px-3 py-3">
          <RowActions request={request} busy={busy} onRespond={onRespond} onCancel={onCancel} />
        </td>
      )}
    </tr>
  );
}

function RequestListItem({ request, canRespond, busy, onRespond, onCancel }: {
  request: SpecialistRequest;
  canRespond: boolean;
  busy: boolean;
  onRespond(request: SpecialistRequest): void;
  onCancel(request: SpecialistRequest): void;
}) {
  return (
    <li className="py-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium">{request.patientDisplayName}</p>
        <StatusPill status={request.status} />
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {request.requiredSpecialtyName ?? "Any specialty"}
        {" · "}
        {request.requestedProviderDisplayName ?? "Any available specialist"}
        {" · "}
        {channelLabel(request.requestChannel)}
      </p>
      <p className="mt-1 text-xs text-muted-foreground tabular-nums">{windowLabel(request)}</p>
      <p className="mt-2 text-sm">{request.caseSummary}</p>
      {request.responseMessage && <p className="mt-1 text-xs text-muted-foreground">Response: {request.responseMessage}</p>}
      {canRespond && (
        <div className="mt-3">
          <RowActions request={request} busy={busy} onRespond={onRespond} onCancel={onCancel} />
        </div>
      )}
    </li>
  );
}

export function SpecialistsBoard({ actingBranchId, canRespond, initialRows, providers, specialties }: Props) {
  const [rows, setRows] = useState<SpecialistRequest[]>(initialRows);
  const [statusFilter, setStatusFilter] = useState<SpecialistRequestStatus | "">("");
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [respondTarget, setRespondTarget] = useState<SpecialistRequest | null>(null);
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
    loadSpecialistRequestsAction({ actingBranchId, status: statusFilter || null })
      .then((result) => {
        if (cancelled) return;
        if (result.ok) setRows(result.rows);
        else setLoadError(result.message);
      })
      .catch(() => {
        if (!cancelled) setLoadError("The specialist requests could not be loaded. Refresh to try again.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [actingBranchId, statusFilter, reloadTick]);

  function onMutated() {
    setReloadTick((tick) => tick + 1);
  }

  async function runCancel(request: SpecialistRequest) {
    setBusyId(request.requestId);
    setActionError(null);
    try {
      const result = await cancelSpecialistRequestAction({
        actingBranchId,
        requestId: request.requestId,
        expectedVersion: request.version,
      });
      if (!result.ok) return setActionError(result.message);
      setActionError(null);
      toast.success("Specialist request cancelled.");
      onMutated();
    } catch {
      setActionError("The specialist request could not be cancelled. Try again.");
    } finally {
      setBusyId(null);
    }
  }

  const statusOptions: Array<{ value: SpecialistRequestStatus | ""; label: string }> = [
    { value: "", label: "All statuses" },
    ...Object.entries(statusLabels).map(([value, label]) => ({ value: value as SpecialistRequestStatus, label })),
  ];

  return (
    <section aria-labelledby="specialists-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="specialists-title" className="text-base font-semibold">Specialist requests</h2>
        <div className="flex flex-wrap items-center gap-2">
          <label className="grid gap-1.5 text-sm font-medium">
            <span className="sr-only">Filter by status</span>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter((event.target.value || "") as SpecialistRequestStatus | "")}
              className="h-11 rounded-md border bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
            >
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <Button type="button" size="lg" className="min-h-11" onClick={() => setCreateOpen(true)}>
            <Plus aria-hidden="true" />
            Request availability
          </Button>
        </div>
      </div>
      {loading && <p className="mt-2 text-xs text-muted-foreground">Updating specialist requests…</p>}
      {loadError && <p role="alert" className="mt-3 border-y border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive">{loadError}</p>}
      {actionError && <p role="alert" className="mt-3 border-y border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive">{actionError}</p>}

      <div className="mt-3 hidden overflow-x-auto border-y md:block">
        <table className="w-full text-left text-sm" aria-label="Specialist requests">
          <caption className="sr-only">Specialist availability requests for the acting branch</caption>
          <thead className="bg-subtle-surface text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="px-3 py-2.5 font-medium">Status</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Patient</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Specialty</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Requested provider</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Requested window</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Channel</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Case summary</th>
              {canRespond && <th scope="col" className="px-3 py-2.5 font-medium"><span className="sr-only">Actions</span></th>}
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={canRespond ? 8 : 7} className="px-3 py-6 text-sm text-muted-foreground">No specialist requests found.</td>
              </tr>
            ) : (
              rows.map((request) => (
                <RequestRow key={request.requestId} request={request} canRespond={canRespond} busy={busyId === request.requestId} onRespond={setRespondTarget} onCancel={(item) => void runCancel(item)} />
              ))
            )}
          </tbody>
        </table>
      </div>

      <ul className="mt-4 divide-y border-y md:hidden" aria-label="Specialist requests list">
        {rows.length === 0 ? (
          <li className="px-3 py-6 text-sm text-muted-foreground">No specialist requests found.</li>
        ) : (
          rows.map((request) => (
            <RequestListItem key={request.requestId} request={request} canRespond={canRespond} busy={busyId === request.requestId} onRespond={setRespondTarget} onCancel={(item) => void runCancel(item)} />
          ))
        )}
      </ul>

      {createOpen && (
        <CreateRequestDialog
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          actingBranchId={actingBranchId}
          providers={providers}
          specialties={specialties}
          onMutated={onMutated}
        />
      )}
      {respondTarget && (
        <RespondDialog
          request={respondTarget}
          onClose={() => setRespondTarget(null)}
          actingBranchId={actingBranchId}
          onMutated={onMutated}
        />
      )}
    </section>
  );
}