"use client";

import { Plus, SlidersHorizontal } from "lucide-react";
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
import { PatientPicker } from "@/components/patients/patient-picker";
import { cn } from "@/lib/utils";
import type { PatientListItem } from "@/lib/patients/types";
import type { Recall, RecallChannel, RecallRule, RecallStatus, RetentionRow } from "@/lib/recall/types";

import {
  cancelRecallAction,
  completeRecallAction,
  createRecallAction,
  createRecallRuleAction,
  enqueueRecallReminderAction,
  linkRecallAppointmentAction,
  loadRecallRulesAction,
  loadRecallsAction,
  markRecallOptedOutAction,
  setPatientOptOutAction,
  updateRecallRuleAction,
  type EnqueueRecallReminderState,
} from "./actions";

type Props = {
  actingBranchId: string;
  branches: Array<{ id: string; name: string }>;
  canManage: boolean;
  initialRecalls: Recall[];
  initialRetention: RetentionRow[];
  initialRules: RecallRule[];
};

const inputClass =
  "h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-none outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const statusLabels: Record<RecallStatus, string> = {
  SCHEDULED: "Scheduled",
  OVERDUE: "Overdue",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  OPTED_OUT: "Opted out",
};

function statusTone(status: RecallStatus) {
  switch (status) {
    case "OVERDUE":
      return "border-destructive/30 bg-destructive/10 text-destructive";
    case "COMPLETED":
      return "border-success/30 bg-success-soft text-success";
    case "CANCELLED":
      return "border-border bg-subtle-surface/60 text-muted-foreground";
    case "OPTED_OUT":
      return "border-warning/30 bg-warning-soft text-warning";
    case "SCHEDULED":
      return "border-info/30 bg-info-soft text-info";
  }
}

function StatusPill({ status }: { status: RecallStatus }) {
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[0.6875rem] font-medium", statusTone(status))}>
      {statusLabels[status]}
    </span>
  );
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(iso));
}

function remindersLabel(recall: Recall) {
  if (recall.remindersSent === 0) return "None";
  return recall.remindersSent === 1 ? "1 sent" : `${recall.remindersSent} sent`;
}

function CreateRecallDialog({
  open,
  onClose,
  actingBranchId,
  rules,
  onMutated,
}: {
  open: boolean;
  onClose(): void;
  actingBranchId: string;
  rules: RecallRule[];
  onMutated(): void;
}) {
  const [selectedPatient, setSelectedPatient] = useState<PatientListItem | null>(null);
  const [ruleId, setRuleId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeRules = rules.filter((rule) => rule.isActive);

  async function submit() {
    if (!selectedPatient) return setError("Select a patient.");
    if (!ruleId) return setError("Select a recall rule.");
    setSaving(true);
    setError(null);
    try {
      const result = await createRecallAction({
        actingBranchId,
        patientId: selectedPatient.patientId,
        ruleId,
        dueDate: dueDate ? new Date(dueDate).toISOString() : null,
      });
      if (!result.ok) return setError(result.message);
      onClose();
      onMutated();
      toast.success("Recall scheduled.");
    } catch {
      setError("The recall could not be created. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && !saving) onClose(); }}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Schedule a recall</DialogTitle>
          <DialogDescription>Leave the due date empty to use the rule&apos;s interval from today.</DialogDescription>
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
          <label className="grid gap-1.5 text-sm font-medium">
            Recall rule
            <select value={ruleId} onChange={(event) => setRuleId(event.target.value)} className={inputClass}>
              <option value="">Select a rule</option>
              {activeRules.map((rule) => (
                <option key={rule.ruleId} value={rule.ruleId}>
                  {rule.name} ({rule.intervalMonths} months)
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            Due date <span className="font-normal text-muted-foreground">(optional)</span>
            <input type="datetime-local" value={dueDate} onChange={(event) => setDueDate(event.target.value)} className={inputClass} />
          </label>
        </div>
        <Button type="button" size="lg" className="min-h-11" onClick={() => void submit()} disabled={saving}>
          {saving ? "Scheduling..." : "Schedule recall"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

function ReminderDialog({
  recall,
  onClose,
  actingBranchId,
  onMutated,
  onOutcome,
}: {
  recall: Recall;
  onClose(): void;
  actingBranchId: string;
  onMutated(): void;
  onOutcome(result: EnqueueRecallReminderState): void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const result = await enqueueRecallReminderAction({
        actingBranchId,
        recallId: recall.recallId,
        expectedVersion: recall.version,
      });
      if (!result.ok) return setError(result.message);
      onClose();
      onMutated();
      onOutcome(result);
    } catch {
      setError("The reminder could not be queued. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(next) => { if (!next && !saving) onClose(); }}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Enqueue reminder for {recall.patientDisplayName}</DialogTitle>
          <DialogDescription>
            Respects the patient&apos;s opt-out preference — reminders are skipped for patients who opted out, rules without a channel, or patients without a reachable contact.
          </DialogDescription>
        </DialogHeader>
        {error && <p role="alert" className="border-y border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p>}
        <p className="text-sm text-muted-foreground">
          {recall.recallRuleName} · due {formatDate(recall.dueDate)} · {remindersLabel(recall)} so far
        </p>
        <Button type="button" size="lg" className="min-h-11" onClick={() => void submit()} disabled={saving}>
          {saving ? "Queuing..." : "Queue reminder"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

function OptOutDialog({
  recall,
  onClose,
  actingBranchId,
  onMutated,
}: {
  recall: Recall;
  onClose(): void;
  actingBranchId: string;
  onMutated(): void;
}) {
  const [alsoPatient, setAlsoPatient] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const result = await markRecallOptedOutAction({
        actingBranchId,
        recallId: recall.recallId,
        expectedVersion: recall.version,
      });
      if (!result.ok) return setError(result.message);
      if (alsoPatient) {
        const prefResult = await setPatientOptOutAction({
          actingBranchId,
          patientId: recall.patientId,
          optOut: true,
        });
        if (!prefResult.ok) return setError(prefResult.message);
      }
      onClose();
      onMutated();
      toast.success(alsoPatient ? "Recall and patient opted out." : "Recall opted out.");
    } catch {
      setError("The recall could not be opted out. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(next) => { if (!next && !saving) onClose(); }}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Opt {recall.patientDisplayName}&apos;s recall out</DialogTitle>
          <DialogDescription>This recall will stop being tracked and will never receive a reminder.</DialogDescription>
        </DialogHeader>
        {error && <p role="alert" className="border-y border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p>}
        <label className="flex items-start gap-3 rounded-md border bg-subtle-surface/60 px-3 py-2.5 text-sm">
          <input
            type="checkbox"
            checked={alsoPatient}
            onChange={(event) => setAlsoPatient(event.target.checked)}
            className="mt-0.5 size-4 accent-current"
          />
          <span>
            Also opt this patient out of future recall reminders
            <span className="block text-xs text-muted-foreground">Applied clinic-wide to every recall rule.</span>
          </span>
        </label>
        <Button type="button" size="lg" variant="destructive" className="min-h-11" onClick={() => void submit()} disabled={saving}>
          {saving ? "Saving..." : "Opt this recall out"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

function LinkAppointmentDialog({
  recall,
  onClose,
  actingBranchId,
  onMutated,
}: {
  recall: Recall;
  onClose(): void;
  actingBranchId: string;
  onMutated(): void;
}) {
  const [appointmentId, setAppointmentId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const value = appointmentId.trim();
    if (!uuidPattern.test(value)) return setError("Enter a valid appointment ID.");
    setSaving(true);
    setError(null);
    try {
      const result = await linkRecallAppointmentAction({
        actingBranchId,
        recallId: recall.recallId,
        expectedVersion: recall.version,
        appointmentId: value,
      });
      if (!result.ok) return setError(result.message);
      onClose();
      onMutated();
      toast.success("Appointment linked.");
    } catch {
      setError("The appointment could not be linked. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(next) => { if (!next && !saving) onClose(); }}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Link appointment to {recall.patientDisplayName}&apos;s recall</DialogTitle>
          <DialogDescription>The booked visit stays linked to this recall so follow-up tracking stays accurate.</DialogDescription>
        </DialogHeader>
        {error && <p role="alert" className="border-y border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p>}
        <label className="grid gap-1.5 text-sm font-medium">
          Appointment ID
          <input
            value={appointmentId}
            onChange={(event) => setAppointmentId(event.target.value)}
            placeholder="Paste the appointment ID from the schedule"
            className={inputClass}
          />
        </label>
        <p className="text-xs text-muted-foreground">Copy the appointment ID from the schedule page to link the booked visit.</p>
        <Button type="button" size="lg" className="min-h-11" onClick={() => void submit()} disabled={saving}>
          {saving ? "Linking..." : "Link appointment"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

function RulesDialog({
  open,
  onClose,
  actingBranchId,
  branches,
  onMutated,
}: {
  open: boolean;
  onClose(): void;
  actingBranchId: string;
  branches: Array<{ id: string; name: string }>;
  onMutated(): void;
}) {
  const [rules, setRules] = useState<RecallRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState<RecallRule | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState("");
  const [intervalMonths, setIntervalMonths] = useState("6");
  const [channel, setChannel] = useState<RecallChannel>("EMAIL");
  const [isActive, setIsActive] = useState(true);
  const [branchId, setBranchId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadRecallRulesAction({ actingBranchId, includeInactive: true })
      .then((result) => {
        if (cancelled) return;
        if (result.ok) setRules(result.rules);
        else setLoadError(result.message);
      })
      .catch(() => {
        if (!cancelled) setLoadError("The recall rules could not be loaded. Refresh to try again.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [actingBranchId]);

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
    setName("");
    setIntervalMonths("6");
    setChannel("EMAIL");
    setIsActive(true);
    setBranchId("");
    setError(null);
  }

  function openEdit(rule: RecallRule) {
    setEditing(rule);
    setFormOpen(true);
    setName(rule.name);
    setIntervalMonths(String(rule.intervalMonths));
    setChannel(rule.channel);
    setIsActive(rule.isActive);
    setBranchId(rule.branchId ?? "");
    setError(null);
  }

  async function submit() {
    const interval = Number(intervalMonths);
    if (!name.trim()) return setError("Add a rule name.");
    if (!Number.isInteger(interval) || interval < 1 || interval > 120) return setError("Interval must be between 1 and 120 months.");
    setSaving(true);
    setError(null);
    try {
      const result = editing
        ? await updateRecallRuleAction({
            actingBranchId,
            ruleId: editing.ruleId,
            expectedVersion: editing.version,
            name: name.trim(),
            intervalMonths: interval,
            channel,
            isActive,
          })
        : await createRecallRuleAction({
            actingBranchId,
            name: name.trim(),
            intervalMonths: interval,
            channel,
            branchId: branchId || null,
          });
      if (!result.ok) return setError(result.message);
      setFormOpen(false);
      setEditing(null);
      onMutated();
      const reloaded = await loadRecallRulesAction({ actingBranchId, includeInactive: true });
      if (reloaded.ok) setRules(reloaded.rules);
      toast.success(editing ? "Recall rule updated." : "Recall rule created.");
    } catch {
      setError("The recall rule could not be saved. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && !saving) onClose(); }}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Recall rules</DialogTitle>
          <DialogDescription>Rules decide when a recall becomes due and which channel its reminders use. Clinic-wide rules apply to every branch.</DialogDescription>
        </DialogHeader>
        {loadError && <p role="alert" className="border-y border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive">{loadError}</p>}
        {loading ? (
          <p className="py-4 text-sm text-muted-foreground">Loading rules…</p>
        ) : (
          <>
            <div className="max-h-56 overflow-auto rounded-md border">
              <table className="w-full text-left text-sm" aria-label="Recall rules">
                <thead className="sticky top-0 bg-subtle-surface text-xs text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-3 py-2 font-medium">Name</th>
                    <th scope="col" className="px-3 py-2 font-medium">Interval</th>
                    <th scope="col" className="px-3 py-2 font-medium">Channel</th>
                    <th scope="col" className="px-3 py-2 font-medium">Scope</th>
                    <th scope="col" className="px-3 py-2 font-medium">Active</th>
                    <th scope="col" className="px-3 py-2 font-medium"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rules.length === 0 ? (
                    <tr><td colSpan={6} className="px-3 py-4 text-sm text-muted-foreground">No recall rules yet.</td></tr>
                  ) : (
                    rules.map((rule) => (
                      <tr key={rule.ruleId}>
                        <td className="px-3 py-2">{rule.name}</td>
                        <td className="px-3 py-2 tabular-nums">{rule.intervalMonths} mo</td>
                        <td className="px-3 py-2">{rule.channel === "NONE" ? "No channel" : rule.channel === "EMAIL" ? "Email" : "SMS"}</td>
                        <td className="px-3 py-2 text-muted-foreground">{rule.branchId ? "Branch" : "All branches"}</td>
                        <td className="px-3 py-2">{rule.isActive ? "Yes" : "No"}</td>
                        <td className="px-3 py-2">
                          <Button type="button" variant="outline" className="min-h-11" onClick={() => openEdit(rule)}>Edit</Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end">
              <Button type="button" size="lg" className="min-h-11" onClick={openCreate}>
                <Plus aria-hidden="true" /> New rule
              </Button>
            </div>
          </>
        )}
        {formOpen && (
          <div className="grid gap-4 rounded-md border bg-subtle-surface/40 p-4">
            {error && <p role="alert" className="border-y border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p>}
            <label className="grid gap-1.5 text-sm font-medium">
              Name
              <input value={name} onChange={(event) => setName(event.target.value)} maxLength={160} className={inputClass} />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1.5 text-sm font-medium">
                Interval months
                <input type="number" min={1} max={120} value={intervalMonths} onChange={(event) => setIntervalMonths(event.target.value)} className={inputClass} />
              </label>
              <label className="grid gap-1.5 text-sm font-medium">
                Channel
                <select value={channel} onChange={(event) => setChannel(event.target.value as RecallChannel)} className={inputClass}>
                  <option value="EMAIL">Email</option>
                  <option value="SMS">SMS</option>
                  <option value="NONE">No channel</option>
                </select>
              </label>
            </div>
            {editing ? (
              <label className="flex items-center gap-3 text-sm">
                <input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} className="size-4 accent-current" />
                Active
              </label>
            ) : (
              <label className="grid gap-1.5 text-sm font-medium">
                Branch <span className="font-normal text-muted-foreground">(optional, defaults to all branches)</span>
                <select value={branchId} onChange={(event) => setBranchId(event.target.value)} className={inputClass}>
                  <option value="">All branches</option>
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>{branch.name}</option>
                  ))}
                </select>
              </label>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" className="min-h-11" disabled={saving} onClick={() => { setFormOpen(false); setEditing(null); setError(null); }}>Close</Button>
              <Button type="button" size="lg" className="min-h-11" onClick={() => void submit()} disabled={saving}>
                {saving ? "Saving..." : editing ? "Save rule" : "Create rule"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function RowActions({ recall, busy, onReminder, onComplete, onCancel, onOptOut, onLink }: {
  recall: Recall;
  busy: boolean;
  onReminder(recall: Recall): void;
  onComplete(recall: Recall): void;
  onCancel(recall: Recall): void;
  onOptOut(recall: Recall): void;
  onLink(recall: Recall): void;
}) {
  if (recall.status !== "SCHEDULED" && recall.status !== "OVERDUE") return null;
  return (
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" className="min-h-11" disabled={busy} onClick={() => onReminder(recall)}>Enqueue reminder</Button>
      <Button type="button" variant="outline" className="min-h-11" disabled={busy} onClick={() => onComplete(recall)}>Complete</Button>
      <Button type="button" variant="outline" className="min-h-11" disabled={busy} onClick={() => onCancel(recall)}>Cancel</Button>
      <Button type="button" variant="outline" className="min-h-11" disabled={busy} onClick={() => onOptOut(recall)}>Opt out</Button>
      <Button type="button" variant="outline" className="min-h-11" disabled={busy} onClick={() => onLink(recall)}>Link appointment</Button>
    </div>
  );
}

function RecallRow({ recall, canManage, busy, onReminder, onComplete, onCancel, onOptOut, onLink }: {
  recall: Recall;
  canManage: boolean;
  busy: boolean;
  onReminder(recall: Recall): void;
  onComplete(recall: Recall): void;
  onCancel(recall: Recall): void;
  onOptOut(recall: Recall): void;
  onLink(recall: Recall): void;
}) {
  const overdue = recall.status === "OVERDUE";
  return (
    <tr className={cn("border-b last:border-0", overdue && "bg-destructive/5")}>
      <td className="px-3 py-3 font-medium">{recall.patientDisplayName}</td>
      <td className="px-3 py-3 text-muted-foreground">{recall.recallRuleName}</td>
      <td className={cn("px-3 py-3 tabular-nums", overdue && "font-medium text-destructive")}>{formatDate(recall.dueDate)}</td>
      <td className="px-3 py-3"><StatusPill status={recall.status} /></td>
      <td className="px-3 py-3 text-muted-foreground">{remindersLabel(recall)}</td>
      <td className="px-3 py-3 text-muted-foreground">{recall.appointmentId ? "Linked" : "—"}</td>
      <td className="px-3 py-3 tabular-nums text-muted-foreground">v{recall.version}</td>
      {canManage && (
        <td className="px-3 py-3">
          <RowActions recall={recall} busy={busy} onReminder={onReminder} onComplete={onComplete} onCancel={onCancel} onOptOut={onOptOut} onLink={onLink} />
        </td>
      )}
    </tr>
  );
}

function RecallListItem({ recall, canManage, busy, onReminder, onComplete, onCancel, onOptOut, onLink }: {
  recall: Recall;
  canManage: boolean;
  busy: boolean;
  onReminder(recall: Recall): void;
  onComplete(recall: Recall): void;
  onCancel(recall: Recall): void;
  onOptOut(recall: Recall): void;
  onLink(recall: Recall): void;
}) {
  const overdue = recall.status === "OVERDUE";
  return (
    <li className={cn("py-3", overdue && "bg-destructive/5")}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium">{recall.patientDisplayName}</p>
        <StatusPill status={recall.status} />
      </div>
      <p className={cn("mt-1 text-sm", overdue ? "font-medium text-destructive" : "text-muted-foreground")}>
        {recall.recallRuleName} · Due {formatDate(recall.dueDate)}
      </p>
      <p className="mt-1 text-xs text-muted-foreground tabular-nums">
        {recall.remindersSent === 0 ? "No reminders sent" : `${recall.remindersSent} reminder${recall.remindersSent === 1 ? "" : "s"} sent`}
        {" · "}
        {recall.appointmentId ? "Linked to appointment" : "No appointment"}
        {" · "}
        v{recall.version}
      </p>
      {canManage && (
        <div className="mt-3">
          <RowActions recall={recall} busy={busy} onReminder={onReminder} onComplete={onComplete} onCancel={onCancel} onOptOut={onOptOut} onLink={onLink} />
        </div>
      )}
    </li>
  );
}

export function RecallsBoard({ actingBranchId, branches, canManage, initialRecalls, initialRetention, initialRules }: Props) {
  const [recalls, setRecalls] = useState<Recall[]>(initialRecalls);
  const [retention, setRetention] = useState<RetentionRow[]>(initialRetention);
  const [rules, setRules] = useState<RecallRule[]>(initialRules);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [reminderTarget, setReminderTarget] = useState<Recall | null>(null);
  const [optOutTarget, setOptOutTarget] = useState<Recall | null>(null);
  const [linkTarget, setLinkTarget] = useState<Recall | null>(null);
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
    const tasks: Promise<unknown>[] = [
      loadRecallsAction({ actingBranchId })
        .then((result) => {
          if (cancelled) return;
          if (result.ok) {
            setRecalls(result.recalls);
            setRetention(result.retention);
          } else {
            setLoadError(result.message);
          }
        }),
    ];
    if (canManage) {
      tasks.push(
        loadRecallRulesAction({ actingBranchId })
          .then((result) => {
            if (cancelled) return;
            if (result.ok) setRules(result.rules);
          }),
      );
    }
    Promise.all(tasks)
      .catch(() => {
        if (!cancelled) setLoadError("The recalls could not be loaded. Refresh to try again.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [actingBranchId, canManage, reloadTick]);

  function onMutated() {
    setNotice(null);
    setReloadTick((tick) => tick + 1);
  }

  function handleReminderOutcome(result: EnqueueRecallReminderState) {
    if (result.ok && result.enqueued) {
      toast.success("Reminder queued.");
    } else if (result.ok && !result.enqueued) {
      setNotice(result.message);
    }
  }

  async function runComplete(recall: Recall) {
    setBusyId(recall.recallId);
    setActionError(null);
    try {
      const result = await completeRecallAction({
        actingBranchId,
        recallId: recall.recallId,
        expectedVersion: recall.version,
      });
      if (!result.ok) return setActionError(result.message);
      setActionError(null);
      toast.success("Recall completed.");
      onMutated();
    } catch {
      setActionError("The recall could not be completed. Try again.");
    } finally {
      setBusyId(null);
    }
  }

  async function runCancel(recall: Recall) {
    setBusyId(recall.recallId);
    setActionError(null);
    try {
      const result = await cancelRecallAction({
        actingBranchId,
        recallId: recall.recallId,
        expectedVersion: recall.version,
      });
      if (!result.ok) return setActionError(result.message);
      setActionError(null);
      toast.success("Recall cancelled.");
      onMutated();
    } catch {
      setActionError("The recall could not be cancelled. Try again.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section aria-labelledby="recalls-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="recalls-title" className="text-base font-semibold">Recall list</h2>
        {canManage && (
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="lg" className="min-h-11" onClick={() => setCreateOpen(true)}>
              <Plus aria-hidden="true" />
              New recall
            </Button>
            <Button type="button" size="lg" variant="outline" className="min-h-11" onClick={() => setRulesOpen(true)}>
              <SlidersHorizontal aria-hidden="true" />
              Manage rules
            </Button>
          </div>
        )}
      </div>
      {loading && <p className="mt-2 text-xs text-muted-foreground">Updating recalls…</p>}
      {loadError && <p role="alert" className="mt-3 border-y border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive">{loadError}</p>}
      {actionError && <p role="alert" className="mt-3 border-y border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive">{actionError}</p>}
      {notice && <p role="status" className="mt-3 border-y border-info/25 bg-info-soft px-3 py-2 text-sm text-info">{notice}</p>}

      <div className="mt-3 hidden overflow-x-auto border-y md:block">
        <table className="w-full text-left text-sm" aria-label="Recalls">
          <caption className="sr-only">Recall tracking rows for the acting branch</caption>
          <thead className="bg-subtle-surface text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="px-3 py-2.5 font-medium">Patient</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Rule</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Due date</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Status</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Reminders</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Appointment</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Version</th>
              {canManage && <th scope="col" className="px-3 py-2.5 font-medium"><span className="sr-only">Actions</span></th>}
            </tr>
          </thead>
          <tbody className="divide-y">
            {recalls.length === 0 ? (
              <tr>
                <td colSpan={canManage ? 8 : 7} className="px-3 py-6 text-sm text-muted-foreground">No recalls found.</td>
              </tr>
            ) : (
              recalls.map((recall) => (
                <RecallRow
                  key={recall.recallId}
                  recall={recall}
                  canManage={canManage}
                  busy={busyId === recall.recallId}
                  onReminder={setReminderTarget}
                  onComplete={(item) => void runComplete(item)}
                  onCancel={(item) => void runCancel(item)}
                  onOptOut={setOptOutTarget}
                  onLink={setLinkTarget}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      <ul className="mt-4 divide-y border-y md:hidden" aria-label="Recalls list">
        {recalls.length === 0 ? (
          <li className="px-3 py-6 text-sm text-muted-foreground">No recalls found.</li>
        ) : (
          recalls.map((recall) => (
            <RecallListItem
              key={recall.recallId}
              recall={recall}
              canManage={canManage}
              busy={busyId === recall.recallId}
              onReminder={setReminderTarget}
              onComplete={(item) => void runComplete(item)}
              onCancel={(item) => void runCancel(item)}
              onOptOut={setOptOutTarget}
              onLink={setLinkTarget}
            />
          ))
        )}
      </ul>

      <section aria-labelledby="retention-title" className="mt-6 rounded-md border">
        <div className="flex items-center justify-between gap-3 border-b bg-subtle-surface/60 px-3 py-2">
          <h3 id="retention-title" className="text-sm font-semibold">Retention summary</h3>
        </div>
        <div className="max-h-64 overflow-auto">
          {retention.length === 0 ? (
            <p className="px-3 py-4 text-sm text-muted-foreground">No recall activity for this branch yet.</p>
          ) : (
            <table className="w-full text-left text-sm" aria-label="Recall retention summary">
              <thead className="sticky top-0 bg-subtle-surface text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">Rule</th>
                  <th scope="col" className="px-3 py-2 font-medium">Status</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Count</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {retention.map((row, index) => (
                  <tr key={`${row.recallRuleName}-${row.status}-${index}`}>
                    <td className="px-3 py-2">{row.recallRuleName}</td>
                    <td className="px-3 py-2"><StatusPill status={row.status} /></td>
                    <td className="px-3 py-2 text-right tabular-nums">{row.recallCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {createOpen && (
        <CreateRecallDialog
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          actingBranchId={actingBranchId}
          rules={rules}
          onMutated={onMutated}
        />
      )}
      {rulesOpen && (
        <RulesDialog
          open={rulesOpen}
          onClose={() => setRulesOpen(false)}
          actingBranchId={actingBranchId}
          branches={branches}
          onMutated={onMutated}
        />
      )}
      {reminderTarget && (
        <ReminderDialog
          recall={reminderTarget}
          onClose={() => setReminderTarget(null)}
          actingBranchId={actingBranchId}
          onMutated={onMutated}
          onOutcome={handleReminderOutcome}
        />
      )}
      {optOutTarget && (
        <OptOutDialog
          recall={optOutTarget}
          onClose={() => setOptOutTarget(null)}
          actingBranchId={actingBranchId}
          onMutated={onMutated}
        />
      )}
      {linkTarget && (
        <LinkAppointmentDialog
          recall={linkTarget}
          onClose={() => setLinkTarget(null)}
          actingBranchId={actingBranchId}
          onMutated={onMutated}
        />
      )}
    </section>
  );
}