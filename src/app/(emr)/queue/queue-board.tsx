"use client";

import { LoaderCircle, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PatientPicker } from "@/components/patients/patient-picker";
import { cn } from "@/lib/utils";
import type { PatientListItem } from "@/lib/patients/types";
import type { QueueEntry, QueueStatus } from "@/lib/queue/types";

import { createWalkinAction, loadQueueAction, updateQueueStatusAction } from "./actions";

type Props = {
  actingBranchId: string;
  canManage: boolean;
  initialRows: QueueEntry[];
  providers: Array<{ id: string; name: string }>;
};

const inputClass =
  "h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-none outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25";

const statusLabels: Record<QueueEntry["status"], string> = {
  WAITING: "Waiting",
  READY: "Ready",
  CALLED: "Called",
  IN_CHAIR: "In chair",
  COMPLETED: "Completed",
  LEFT: "Left",
  CANCELLED: "Cancelled",
};

const terminalStatuses: ReadonlySet<QueueEntry["status"]> = new Set(["COMPLETED", "LEFT", "CANCELLED"]);

type Transition = { label: string; next: QueueStatus };
const transitionsByStatus: Partial<Record<QueueEntry["status"], readonly Transition[]>> = {
  WAITING: [{ label: "Ready", next: "READY" }, { label: "Cancel", next: "CANCELLED" }],
  READY: [{ label: "Call", next: "CALLED" }, { label: "Left", next: "LEFT" }],
  CALLED: [{ label: "In chair", next: "IN_CHAIR" }, { label: "Left", next: "LEFT" }],
  IN_CHAIR: [{ label: "Complete", next: "COMPLETED" }],
};

function formatTime(iso: string) {
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

function StatusBadge({ status }: { status: QueueEntry["status"] }) {
  const terminal = terminalStatuses.has(status);
  return (
    <span className={cn(
      "inline-flex items-center rounded-full border px-2 py-0.5 text-[0.6875rem] font-medium",
      terminal ? "border-border bg-subtle-surface/60 text-muted-foreground" : "border-info/30 bg-info-soft text-info",
    )}>
      {statusLabels[status]}
    </span>
  );
}

function providerResourceLabel(entry: QueueEntry) {
  if (entry.providerDisplayName && entry.resourceName) return `${entry.providerDisplayName} · ${entry.resourceName}`;
  return entry.providerDisplayName ?? entry.resourceName ?? "Unassigned";
}

function TransitionActions({ entry, busy, onTransition }: {
  entry: QueueEntry;
  busy: boolean;
  onTransition(entry: QueueEntry, next: QueueStatus): Promise<void>;
}) {
  const transitions = transitionsByStatus[entry.status] ?? [];
  if (transitions.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {transitions.map(({ label, next }) => (
        <Button key={next} type="button" variant="outline" className="min-h-11" disabled={busy} onClick={() => void onTransition(entry, next)}>
          {label}
        </Button>
      ))}
    </div>
  );
}

function QueueRow({ entry, canManage, busy, onTransition }: {
  entry: QueueEntry;
  canManage: boolean;
  busy: boolean;
  onTransition(entry: QueueEntry, next: QueueStatus): Promise<void>;
}) {
  return (
    <tr className="border-b last:border-0">
      <td className="px-3 py-3 font-medium">{entry.patientDisplayName ?? "Patient"}</td>
      <td className="px-3 py-3 tabular-nums">{formatTime(entry.arrivedAt)}</td>
      <td className="px-3 py-3 text-muted-foreground">{entry.chiefComplaint ?? "Not recorded"}</td>
      <td className="px-3 py-3 text-muted-foreground">{providerResourceLabel(entry)}</td>
      <td className="px-3 py-3"><StatusBadge status={entry.status} /></td>
      {canManage && (
        <td className="px-3 py-3"><TransitionActions entry={entry} busy={busy} onTransition={onTransition} /></td>
      )}
    </tr>
  );
}

function QueueListItem({ entry, canManage, busy, onTransition }: {
  entry: QueueEntry;
  canManage: boolean;
  busy: boolean;
  onTransition(entry: QueueEntry, next: QueueStatus): Promise<void>;
}) {
  return (
    <li className="py-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium">{entry.patientDisplayName ?? "Patient"}</p>
        <StatusBadge status={entry.status} />
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Arrived {formatTime(entry.arrivedAt)}{entry.chiefComplaint ? ` · ${entry.chiefComplaint}` : ""}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{providerResourceLabel(entry)}</p>
      {canManage && <div className="mt-2"><TransitionActions entry={entry} busy={busy} onTransition={onTransition} /></div>}
    </li>
  );
}

function CreateWalkinDialog({ open, onClose, actingBranchId, providers, onMutated }: {
  open: boolean;
  onClose(): void;
  actingBranchId: string;
  providers: Array<{ id: string; name: string }>;
  onMutated(): void;
}) {
  const router = useRouter();
  const [selectedPatient, setSelectedPatient] = useState<PatientListItem | null>(null);
  const [complaint, setComplaint] = useState("");
  const [providerId, setProviderId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!selectedPatient) return setError("Select a patient.");
    setSaving(true);
    setError(null);
    try {
      const result = await createWalkinAction({
        actingBranchId,
        patientId: selectedPatient.patientId,
        chiefComplaint: complaint.trim() || undefined,
        providerId: providerId || null,
      });
      if (!result.ok) return setError(result.message);
      setSelectedPatient(null);
      setComplaint("");
      setProviderId("");
      setError(null);
      onClose();
      toast.success("Walk-in added to the queue.");
      onMutated();
    } catch {
      setError("The walk-in could not be added. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && !saving) onClose(); }}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Walk-in</DialogTitle>
          <DialogDescription>Add a walk-in patient to the waiting queue for the acting branch. This creates a queue entry, not an appointment.</DialogDescription>
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
          <Button type="button" variant="outline" className="min-h-11 w-full" onClick={() => router.push("/patients/new?walkin=1")}>
            Patient not found? Register a new patient
          </Button>
          <label className="grid gap-1.5 text-sm font-medium">
            Chief complaint
            <textarea
              value={complaint}
              onChange={(event) => setComplaint(event.target.value)}
              maxLength={2000}
              placeholder="Optional reason for the visit"
              className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
            />
          </label>
          {providers.length > 0 && (
            <label className="grid gap-1.5 text-sm font-medium">
              Provider
              <select value={providerId} onChange={(event) => setProviderId(event.target.value)} className={inputClass}>
                <option value="">Unassigned</option>
                {providers.map((provider) => (
                  <option key={provider.id} value={provider.id}>{provider.name}</option>
                ))}
              </select>
            </label>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" className="min-h-11" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="button" className="min-h-11" onClick={() => void submit()} disabled={saving}>
            {saving && <LoaderCircle className="animate-spin" aria-hidden="true" />}
            Add to queue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function QueueBoard({ actingBranchId, canManage, initialRows, providers }: Props) {
  const [rows, setRows] = useState<QueueEntry[]>(initialRows);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const [creating, setCreating] = useState(false);
  const skipFirstLoad = useRef(true);

  useEffect(() => {
    if (skipFirstLoad.current) {
      skipFirstLoad.current = false;
      return;
    }
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    loadQueueAction({ actingBranchId })
      .then((result) => {
        if (cancelled) return;
        if (result.ok) setRows(result.rows);
        else setLoadError(result.message);
      })
      .catch(() => {
        if (!cancelled) setLoadError("The queue could not be loaded. Refresh to try again.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [actingBranchId, reloadTick]);

  function onMutated() {
    setReloadTick((tick) => tick + 1);
  }

  async function runTransition(entry: QueueEntry, next: QueueStatus) {
    setBusyId(entry.queueEntryId);
    setActionError(null);
    try {
      const result = await updateQueueStatusAction({
        actingBranchId,
        queueEntryId: entry.queueEntryId,
        expectedVersion: entry.version,
        newStatus: next,
      });
      if (!result.ok) return setActionError(result.message);
      setActionError(null);
      toast.success(`Marked ${entry.patientDisplayName ?? "patient"} as ${statusLabels[next].toLowerCase()}.`);
      onMutated();
    } catch {
      setActionError("The queue entry could not be updated. Try again.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section aria-labelledby="queue-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="queue-title" className="text-base font-semibold">Waiting queue</h2>
        {canManage && (
          <Button type="button" className="min-h-11" onClick={() => setCreating(true)}>
            <Plus aria-hidden="true" />
            Walk-in
          </Button>
        )}
      </div>
      {loading && <p className="mt-2 text-xs text-muted-foreground">Updating queue…</p>}
      {loadError && <p role="alert" className="mt-3 border-y border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive">{loadError}</p>}
      {actionError && <p role="alert" className="mt-3 border-y border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive">{actionError}</p>}

      <div className="mt-3 hidden overflow-x-auto border-y md:block">
        <table className="w-full text-left text-sm" aria-label="Waiting queue">
          <caption className="sr-only">Walk-in and waiting queue for the acting branch</caption>
          <thead className="bg-subtle-surface text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="px-3 py-2.5 font-medium">Patient</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Arrived</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Complaint</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Provider / resource</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Status</th>
              {canManage && <th scope="col" className="px-3 py-2.5 font-medium">Action</th>}
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={canManage ? 6 : 5} className="px-3 py-6 text-sm text-muted-foreground">No patients waiting.</td>
              </tr>
            ) : (
              rows.map((entry) => (
                <QueueRow key={entry.queueEntryId} entry={entry} canManage={canManage} busy={busyId === entry.queueEntryId} onTransition={runTransition} />
              ))
            )}
          </tbody>
        </table>
      </div>

      <ul className="mt-4 divide-y border-y md:hidden" aria-label="Waiting queue list">
        {rows.length === 0 ? (
          <li className="px-3 py-6 text-sm text-muted-foreground">No patients waiting.</li>
        ) : (
          rows.map((entry) => (
            <QueueListItem key={entry.queueEntryId} entry={entry} canManage={canManage} busy={busyId === entry.queueEntryId} onTransition={runTransition} />
          ))
        )}
      </ul>

      {canManage && (
        <CreateWalkinDialog
          open={creating}
          onClose={() => setCreating(false)}
          actingBranchId={actingBranchId}
          providers={providers}
          onMutated={onMutated}
        />
      )}
    </section>
  );
}