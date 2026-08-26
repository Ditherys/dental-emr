"use client";

import { LoaderCircle, Plus, Search } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { AppointmentSummary, SlotRow } from "@/lib/scheduling/types";
import type { PatientListItem } from "@/lib/patients/types";

import { searchPatientsAction } from "../patients/actions";
import {
  cancelAppointmentAction,
  createAppointmentAction,
  findAvailableSlotsAction,
  loadScheduleAction,
  rescheduleAppointmentAction,
  updateAppointmentStatusAction,
} from "./actions";

type View = "day" | "week";

type Props = {
  actingBranchId: string;
  canWrite: boolean;
  initialStartsAt: string;
  initialEndsAt: string;
  initialRows: AppointmentSummary[];
  providerNames: Record<string, string>;
  procedures: Array<{ id: string; name: string }>;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const inputClass =
  "h-11 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30";

function toDatetimeLocal(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function localDayKey(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatTime(iso: string) {
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

function formatColumn(dayKey: string, isToday: boolean) {
  const [year, month, day] = dayKey.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return isToday
    ? "Today"
    : new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" }).format(date);
}

function formatHour(hour: number) {
  const suffix = hour >= 12 ? "PM" : "AM";
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display} ${suffix}`;
}

function validateTimes(startsAt: string, endsAt: string): string | null {
  if (!startsAt || !endsAt) return "Enter start and end times.";
  const startMs = Date.parse(startsAt);
  const endMs = Date.parse(endsAt);
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) return "Enter valid start and end times.";
  if (endMs <= startMs) return "End time must be after start time.";
  return null;
}

function windowFor(view: View, anchorMs: number) {
  const spanDays = view === "day" ? 1 : 7;
  return {
    startsAt: new Date(anchorMs).toISOString(),
    endsAt: new Date(anchorMs + spanDays * DAY_MS).toISOString(),
  };
}

function windowLabel(view: View, anchorMs: number) {
  const start = new Date(anchorMs);
  if (view === "day") {
    return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" }).format(start);
  }
  const end = new Date(anchorMs + 6 * DAY_MS);
  const format = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
  return `${format.format(start)} – ${format.format(end)}`;
}

const pillTones = {
  success: "border-success/30 bg-success-soft text-success",
  warning: "border-warning/30 bg-warning-soft text-warning",
  info: "border-info/30 bg-info-soft text-info",
  destructive: "border-destructive/30 bg-destructive/5 text-destructive",
} as const;

function StatusPill({ tone, children }: { tone: keyof typeof pillTones; children: ReactNode }) {
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[0.6875rem] font-medium", pillTones[tone])}>
      {children}
    </span>
  );
}

function StatusPills({ appointment }: { appointment: AppointmentSummary }) {
  const pills: Array<{ label: string; tone: keyof typeof pillTones }> = [];
  pills.push(
    appointment.confirmationStatus === "CONFIRMED"
      ? { label: "Confirmed", tone: "success" }
      : { label: "Unconfirmed", tone: "warning" },
  );
  if (appointment.schedulingStatus !== "SCHEDULED") {
    pills.push(
      appointment.schedulingStatus === "AWAITING_SPECIALIST"
        ? { label: "Awaiting specialist", tone: "info" }
        : { label: "Requested", tone: "warning" },
    );
  }
  if (appointment.encounterStatus !== "PENDING") {
    const labels: Record<AppointmentSummary["encounterStatus"], string> = {
      PENDING: "Pending",
      CHECKED_IN: "Checked in",
      IN_CHAIR: "In chair",
      COMPLETED: "Completed",
      NO_SHOW: "No-show",
      CANCELLED: "Cancelled",
    };
    const tones: Record<AppointmentSummary["encounterStatus"], keyof typeof pillTones> = {
      PENDING: "info",
      CHECKED_IN: "info",
      IN_CHAIR: "info",
      COMPLETED: "success",
      NO_SHOW: "warning",
      CANCELLED: "destructive",
    };
    pills.push({ label: labels[appointment.encounterStatus], tone: tones[appointment.encounterStatus] });
  }
  return (
    <>
      {pills.map((pill) => (
        <StatusPill key={pill.label} tone={pill.tone}>
          {pill.label}
        </StatusPill>
      ))}
    </>
  );
}

function AppointmentBlock({ appointment, onSelect }: { appointment: AppointmentSummary; onSelect(): void }) {
  const providerLabel =
    appointment.providerIds.length === 0
      ? "No provider"
      : `${appointment.providerIds.length} ${appointment.providerIds.length === 1 ? "provider" : "providers"}`;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={`View ${appointment.patientDisplayName ?? "patient"} appointment`}
      className="mb-1 block min-h-11 w-full rounded-md border border-border bg-background px-2 py-1.5 text-left outline-none hover:bg-muted focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
    >
      <span className="block truncate text-sm font-medium">{appointment.patientDisplayName ?? "Patient"}</span>
      <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
        <span className="tabular-nums">{formatTime(appointment.startsAt)}–{formatTime(appointment.endsAt)}</span>
        <span aria-hidden="true">·</span>
        <span>{providerLabel}</span>
      </span>
      <span className="mt-1 flex flex-wrap gap-1">
        <StatusPills appointment={appointment} />
      </span>
    </button>
  );
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

function CreateAppointmentDialog({
  open,
  onClose,
  actingBranchId,
  procedures,
  onMutated,
}: {
  open: boolean;
  onClose(): void;
  actingBranchId: string;
  procedures: Array<{ id: string; name: string }>;
  onMutated(): void;
}) {
  const [selectedPatient, setSelectedPatient] = useState<PatientListItem | null>(null);
  const [startsAt, setStartsAt] = useState(() => {
    const start = new Date(Math.ceil(Date.now() / (30 * 60000)) * (30 * 60000));
    return toDatetimeLocal(start);
  });
  const [endsAt, setEndsAt] = useState(() => {
    const start = new Date(Math.ceil(Date.now() / (30 * 60000)) * (30 * 60000));
    return toDatetimeLocal(new Date(start.getTime() + 30 * 60000));
  });
  const [procedureId, setProcedureId] = useState("");
  const [channel, setChannel] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function changeStart(value: string) {
    setStartsAt(value);
    if (value && endsAt && Date.parse(endsAt) <= Date.parse(value)) {
      setEndsAt(toDatetimeLocal(new Date(Date.parse(value) + 30 * 60000)));
    }
  }

  async function submit() {
    const problem = validateTimes(startsAt, endsAt);
    if (problem) return setError(problem);
    if (!selectedPatient) return setError("Select a patient.");
    setSaving(true);
    setError(null);
    try {
      const result = await createAppointmentAction({
        actingBranchId,
        patientId: selectedPatient.patientId,
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
        procedureId: procedureId || null,
        internalSchedulingNotes: notes.trim() || undefined,
        bookingChannelCode: channel || null,
      });
      if (!result.ok) {
        const fieldMessage = result.fieldErrors ? Object.values(result.fieldErrors).flat().join(" ") : null;
        return setError(fieldMessage || result.message);
      }
      onClose();
      onMutated();
    } catch {
      setError("The appointment could not be saved. Review the fields and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && !saving) onClose(); }}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New appointment</DialogTitle>
          <DialogDescription>Book an appointment for the acting branch. A provider can be assigned later.</DialogDescription>
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
            Starts at
            <input type="datetime-local" value={startsAt} onChange={(event) => changeStart(event.target.value)} className={inputClass} />
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            Ends at
            <input type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} className={inputClass} />
          </label>
          {procedures.length > 0 && (
            <label className="grid gap-1.5 text-sm font-medium">
              Procedure
              <select value={procedureId} onChange={(event) => setProcedureId(event.target.value)} className={inputClass}>
                <option value="">No procedure</option>
                {procedures.map((procedure) => (
                  <option key={procedure.id} value={procedure.id}>{procedure.name}</option>
                ))}
              </select>
            </label>
          )}
          <label className="grid gap-1.5 text-sm font-medium">
            Booking channel
            <select value={channel} onChange={(event) => setChannel(event.target.value)} className={inputClass}>
              <option value="">Not recorded</option>
              <option value="WALK_IN">Walk-in</option>
              <option value="PHONE">Phone</option>
              <option value="ONLINE">Online</option>
              <option value="PATIENT_PORTAL">Patient portal</option>
              <option value="REFERRAL">Referral</option>
              <option value="OTHER">Other</option>
            </select>
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            Internal notes
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              maxLength={4000}
              className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
            />
          </label>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" className="min-h-11" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="button" className="min-h-11" onClick={() => void submit()} disabled={saving}>
            {saving && <LoaderCircle className="animate-spin" aria-hidden="true" />}
            Save appointment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RescheduleDialog({
  open,
  onClose,
  actingBranchId,
  appointment,
  onMutated,
}: {
  open: boolean;
  onClose(): void;
  actingBranchId: string;
  appointment: AppointmentSummary;
  onMutated(): void;
}) {
  const [startsAt, setStartsAt] = useState(() => toDatetimeLocal(new Date(appointment.startsAt)));
  const [endsAt, setEndsAt] = useState(() => toDatetimeLocal(new Date(appointment.endsAt)));
  const [slots, setSlots] = useState<SlotRow[] | null>(null);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const durationMinutes = Math.max(15, Math.round((Date.parse(appointment.endsAt) - Date.parse(appointment.startsAt)) / 60000));
  const canCheckAvailability = appointment.providerIds.length > 0;

  function changeStart(value: string) {
    setStartsAt(value);
    setSlots(null);
    if (value && endsAt && Date.parse(endsAt) <= Date.parse(value)) {
      setEndsAt(toDatetimeLocal(new Date(Date.parse(value) + durationMinutes * 60000)));
    }
  }

  async function checkAvailability() {
    if (!canCheckAvailability || !startsAt) return;
    const dayStart = new Date(`${startsAt.slice(0, 10)}T00:00:00`);
    setChecking(true);
    setSlotsError(null);
    setSlots(null);
    try {
      const result = await findAvailableSlotsAction({
        actingBranchId,
        providerId: appointment.providerIds[0],
        windowStart: dayStart.toISOString(),
        windowEnd: new Date(dayStart.getTime() + DAY_MS).toISOString(),
        durationMinutes,
        maxSlots: 20,
      });
      if (!result.ok) { setSlotsError(result.message); return; }
      setSlots(result.slots);
    } catch {
      setSlotsError("Availability could not be loaded. Try again.");
    } finally {
      setChecking(false);
    }
  }

  async function submit() {
    const problem = validateTimes(startsAt, endsAt);
    if (problem) return setError(problem);
    setSaving(true);
    setError(null);
    try {
      const result = await rescheduleAppointmentAction({
        actingBranchId,
        appointmentId: appointment.appointmentId,
        expectedVersion: appointment.version,
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
      });
      if (!result.ok) return setError(result.message);
      onClose();
      onMutated();
    } catch {
      setError("The appointment could not be rescheduled. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && !saving) onClose(); }}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Reschedule appointment</DialogTitle>
          <DialogDescription>{appointment.patientDisplayName ?? "Patient"} · {durationMinutes} minutes</DialogDescription>
        </DialogHeader>
        {error && <p role="alert" className="border-y border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p>}
        <div className="grid gap-4">
          <label className="grid gap-1.5 text-sm font-medium">
            Starts at
            <input type="datetime-local" value={startsAt} onChange={(event) => changeStart(event.target.value)} className={inputClass} />
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            Ends at
            <input type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} className={inputClass} />
          </label>
          {canCheckAvailability ? (
            <div className="grid gap-2">
              <Button type="button" variant="outline" className="min-h-11" onClick={() => void checkAvailability()} disabled={checking || !startsAt}>
                {checking && <LoaderCircle className="animate-spin" aria-hidden="true" />}
                Show available slots
              </Button>
              {slotsError && <p role="alert" className="text-sm text-destructive">{slotsError}</p>}
              {slots && slots.length === 0 && <p className="text-sm text-muted-foreground">No open slots for that day.</p>}
              {slots && slots.length > 0 && (
                <ul className="flex flex-wrap gap-2" aria-label="Available slots">
                  {slots.map((slot) => (
                    <li key={slot.startsAt}>
                      <button
                        type="button"
                        onClick={() => { setStartsAt(toDatetimeLocal(new Date(slot.startsAt))); setEndsAt(toDatetimeLocal(new Date(slot.endsAt))); setSlots(null); }}
                        className="min-h-11 rounded-md border border-border px-3 text-sm outline-none hover:bg-muted focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                      >
                        {formatTime(slot.startsAt)}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No provider is assigned, so availability cannot be checked for this appointment.</p>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" className="min-h-11" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="button" className="min-h-11" onClick={() => void submit()} disabled={saving}>
            {saving && <LoaderCircle className="animate-spin" aria-hidden="true" />}
            Save new time
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CancelDialog({
  open,
  onClose,
  actingBranchId,
  appointment,
  onMutated,
}: {
  open: boolean;
  onClose(): void;
  actingBranchId: string;
  appointment: AppointmentSummary;
  onMutated(): void;
}) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const result = await cancelAppointmentAction({
        actingBranchId,
        appointmentId: appointment.appointmentId,
        expectedVersion: appointment.version,
        reason: reason.trim() || undefined,
      });
      if (!result.ok) return setError(result.message);
      onClose();
      onMutated();
    } catch {
      setError("The appointment could not be cancelled. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && !saving) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cancel appointment</DialogTitle>
          <DialogDescription>{appointment.patientDisplayName ?? "Patient"} · {formatTime(appointment.startsAt)} on {new Date(appointment.startsAt).toLocaleDateString()}</DialogDescription>
        </DialogHeader>
        {error && <p role="alert" className="border-y border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p>}
        <label className="grid gap-1.5 text-sm font-medium">
          Reason
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={500}
            placeholder="Optional reason for cancellation"
            className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
          />
        </label>
        <DialogFooter>
          <Button type="button" variant="outline" className="min-h-11" onClick={onClose} disabled={saving}>Keep appointment</Button>
          <Button type="button" variant="destructive" className="min-h-11" onClick={() => void submit()} disabled={saving}>
            {saving && <LoaderCircle className="animate-spin" aria-hidden="true" />}
            Cancel appointment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AppointmentDetailDialog({
  open,
  onClose,
  actingBranchId,
  appointment,
  canWrite,
  providerNames,
  onMutated,
  onReschedule,
  onCancel,
}: {
  open: boolean;
  onClose(): void;
  actingBranchId: string;
  appointment: AppointmentSummary;
  canWrite: boolean;
  providerNames: Record<string, string>;
  onMutated(): void;
  onReschedule(): void;
  onCancel(): void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isTerminal = appointment.encounterStatus === "CANCELLED" || appointment.encounterStatus === "COMPLETED";
  const providerLabels = appointment.providerIds.map((id) => providerNames[id]).filter(Boolean);
  const timeLabel = `${formatTime(appointment.startsAt)} – ${formatTime(appointment.endsAt)}`;

  async function runStatus(dimension: "confirmation_status" | "encounter_status", newStatus: string) {
    setSaving(true);
    setError(null);
    try {
      const result = await updateAppointmentStatusAction({
        actingBranchId,
        appointmentId: appointment.appointmentId,
        expectedVersion: appointment.version,
        dimension,
        newStatus,
      });
      if (!result.ok) return setError(result.message);
      onClose();
      onMutated();
    } catch {
      setError("The appointment could not be updated. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && !saving) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{appointment.patientDisplayName ?? "Patient"}</DialogTitle>
          <DialogDescription>{timeLabel} · {new Date(appointment.startsAt).toLocaleDateString()}</DialogDescription>
        </DialogHeader>
        {error && <p role="alert" className="border-y border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p>}
        <dl className="grid gap-2 text-sm">
          <div className="grid grid-cols-[5.5rem_1fr] gap-2">
            <dt className="text-muted-foreground">Duration</dt>
            <dd>{Math.round((Date.parse(appointment.endsAt) - Date.parse(appointment.startsAt)) / 60000)} minutes</dd>
          </div>
          <div className="grid grid-cols-[5.5rem_1fr] gap-2">
            <dt className="text-muted-foreground">Providers</dt>
            <dd>
              {appointment.providerIds.length === 0 ? "None assigned" : providerLabels.length > 0 ? providerLabels.join(", ") : `${appointment.providerIds.length} assigned`}
            </dd>
          </div>
          {appointment.procedureName && (
            <div className="grid grid-cols-[5.5rem_1fr] gap-2">
              <dt className="text-muted-foreground">Procedure</dt>
              <dd>{appointment.procedureName}</dd>
            </div>
          )}
          <div className="grid grid-cols-[5.5rem_1fr] gap-2">
            <dt className="text-muted-foreground">Status</dt>
            <dd className="flex flex-wrap gap-1"><StatusPills appointment={appointment} /></dd>
          </div>
        </dl>
        {canWrite && !isTerminal && (
          <div className="flex flex-wrap gap-2">
            {appointment.confirmationStatus === "PENDING" && (
              <Button type="button" className="min-h-11" disabled={saving} onClick={() => void runStatus("confirmation_status", "CONFIRMED")}>Confirm</Button>
            )}
            {appointment.confirmationStatus === "CONFIRMED" && (
              <Button type="button" variant="outline" className="min-h-11" disabled={saving} onClick={() => void runStatus("confirmation_status", "PENDING")}>Mark unconfirmed</Button>
            )}
            {appointment.encounterStatus === "PENDING" && (
              <Button type="button" variant="outline" className="min-h-11" disabled={saving} onClick={() => void runStatus("encounter_status", "CHECKED_IN")}>Check in</Button>
            )}
            {appointment.encounterStatus === "CHECKED_IN" && (
              <Button type="button" variant="outline" className="min-h-11" disabled={saving} onClick={() => void runStatus("encounter_status", "IN_CHAIR")}>In chair</Button>
            )}
            {appointment.encounterStatus === "IN_CHAIR" && (
              <Button type="button" variant="outline" className="min-h-11" disabled={saving} onClick={() => void runStatus("encounter_status", "COMPLETED")}>Complete</Button>
            )}
            <Button type="button" variant="outline" className="min-h-11" disabled={saving} onClick={onReschedule}>Reschedule</Button>
            <Button type="button" variant="outline" className="min-h-11" disabled={saving} onClick={onCancel}>Cancel appointment</Button>
          </div>
        )}
        {canWrite && isTerminal && (
          <p className="border-y border-border bg-subtle-surface/60 px-3 py-2 text-sm text-muted-foreground">
            This appointment is {appointment.encounterStatus === "CANCELLED" ? "cancelled" : "completed"} and can no longer be edited.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function ScheduleCalendar({
  actingBranchId,
  canWrite,
  initialStartsAt,
  initialRows,
  providerNames,
  procedures,
}: Props) {
  const [view, setView] = useState<View>("day");
  const [rows, setRows] = useState<AppointmentSummary[]>(initialRows);
  const [providerFilter, setProviderFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const [selected, setSelected] = useState<AppointmentSummary | null>(null);
  const [rescheduling, setRescheduling] = useState<AppointmentSummary | null>(null);
  const [cancelling, setCancelling] = useState<AppointmentSummary | null>(null);
  const [creating, setCreating] = useState(false);
  const skipFirstLoad = useRef(true);

  const anchorMs = Date.parse(initialStartsAt);

  useEffect(() => {
    if (skipFirstLoad.current) {
      skipFirstLoad.current = false;
      return;
    }
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    const { startsAt, endsAt } = windowFor(view, anchorMs);
    loadScheduleAction({ actingBranchId, startsAt, endsAt, providerId: providerFilter || null })
      .then((result) => {
        if (cancelled) return;
        if (result.ok) setRows(result.rows);
        else setLoadError(result.message);
      })
      .catch(() => {
        if (!cancelled) setLoadError("The schedule could not be loaded. Refresh to try again.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [view, providerFilter, reloadTick, actingBranchId, anchorMs]);

  const visibleRows = useMemo(
    () => (providerFilter ? rows.filter((row) => row.providerIds.includes(providerFilter)) : rows),
    [rows, providerFilter],
  );

  const providerOptions = useMemo(() => {
    const ids = [...new Set(rows.flatMap((row) => row.providerIds))];
    return ids.map((id) => ({ id, label: providerNames[id] ?? id }));
  }, [rows, providerNames]);

  const columnDates = useMemo(() => {
    const dates = new Set<string>();
    for (const row of visibleRows) dates.add(localDayKey(new Date(row.startsAt)));
    if (dates.size === 0) dates.add(localDayKey(new Date(anchorMs)));
    return [...dates].sort();
  }, [visibleRows, anchorMs]);

  const hourRows = useMemo(() => {
    const hours = new Set<number>();
    for (const row of visibleRows) hours.add(new Date(row.startsAt).getHours());
    return [...hours].sort((left, right) => left - right);
  }, [visibleRows]);

  function openDetail(appointment: AppointmentSummary) {
    setSelected(appointment);
  }

  function onMutated() {
    setReloadTick((tick) => tick + 1);
  }

  return (
    <section aria-labelledby="schedule-calendar-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Calendar view" className="flex overflow-hidden rounded-md border border-border">
            {(["day", "week"] as const).map((option) => (
              <Button
                key={option}
                type="button"
                variant={view === option ? "default" : "ghost"}
                className="min-h-11 rounded-none"
                onClick={() => setView(option)}
              >
                {option === "day" ? "Day" : "Week"}
              </Button>
            ))}
          </div>
          {providerOptions.length > 1 && (
            <label className="grid gap-1.5 text-sm font-medium">
              <span className="sr-only">Provider filter</span>
              <select
                value={providerFilter}
                onChange={(event) => setProviderFilter(event.target.value)}
                className="h-11 rounded-md border bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
              >
                <option value="">All providers</option>
                {providerOptions.map((provider) => (
                  <option key={provider.id} value={provider.id}>{provider.label}</option>
                ))}
              </select>
            </label>
          )}
        </div>
        {canWrite && (
          <Button type="button" className="min-h-11" onClick={() => setCreating(true)}>
            <Plus aria-hidden="true" />
            New appointment
          </Button>
        )}
      </div>
      <h2 id="schedule-calendar-title" className="mt-4 text-base font-semibold">{windowLabel(view, anchorMs)}</h2>
      {loading && <p className="mt-2 text-xs text-muted-foreground">Updating schedule…</p>}
      {loadError && <p role="alert" className="mt-3 border-y border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive">{loadError}</p>}

      <div className="mt-3 hidden overflow-x-auto border-y md:block">
        <table className="w-full text-left text-sm" aria-label="Schedule grid">
          <caption className="sr-only">Appointments by time and day in the selected window</caption>
          <thead className="bg-subtle-surface text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="px-3 py-2.5 font-medium">Time</th>
              {columnDates.map((dayKey) => (
                <th key={dayKey} scope="col" className="px-3 py-2.5 font-medium">{formatColumn(dayKey, dayKey === localDayKey(new Date()))}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {visibleRows.length === 0 ? (
              <tr>
                <td colSpan={columnDates.length + 1} className="px-3 py-6 text-sm text-muted-foreground">No appointments in this window.</td>
              </tr>
            ) : (
              hourRows.map((hour) => (
                <tr key={hour} className="align-top">
                  <th scope="row" className="w-16 px-3 py-1.5 align-top pt-3 font-mono text-xs font-medium text-muted-foreground">{formatHour(hour)}</th>
                  {columnDates.map((dayKey) => {
                    const cells = visibleRows.filter(
                      (row) => new Date(row.startsAt).getHours() === hour && localDayKey(new Date(row.startsAt)) === dayKey,
                    );
                    return (
                      <td key={dayKey} className="px-1.5 py-1.5 align-top">
                        {cells.map((appointment) => (
                          <AppointmentBlock key={appointment.appointmentId} appointment={appointment} onSelect={() => openDetail(appointment)} />
                        ))}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <ul className="mt-4 divide-y border-y md:hidden" aria-label="Appointments list">
        {visibleRows.length === 0 ? (
          <li className="px-3 py-6 text-sm text-muted-foreground">No appointments in this window.</li>
        ) : (
          columnDates.map((dayKey) => {
            const dayRows = visibleRows.filter((row) => localDayKey(new Date(row.startsAt)) === dayKey);
            if (dayRows.length === 0) return null;
            return (
              <li key={dayKey}>
                <h3 className="px-3 pt-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">{formatColumn(dayKey, dayKey === localDayKey(new Date()))}</h3>
                <div className="px-3 py-2">
                  {dayRows.map((appointment) => (
                    <AppointmentBlock key={appointment.appointmentId} appointment={appointment} onSelect={() => openDetail(appointment)} />
                  ))}
                </div>
              </li>
            );
          })
        )}
      </ul>

      {canWrite && (
        <CreateAppointmentDialog
          open={creating}
          onClose={() => setCreating(false)}
          actingBranchId={actingBranchId}
          procedures={procedures}
          onMutated={onMutated}
        />
      )}
      {selected && (
        <AppointmentDetailDialog
          open
          onClose={() => setSelected(null)}
          actingBranchId={actingBranchId}
          appointment={selected}
          canWrite={canWrite}
          providerNames={providerNames}
          onMutated={onMutated}
          onReschedule={() => { setRescheduling(selected); setSelected(null); }}
          onCancel={() => { setCancelling(selected); setSelected(null); }}
        />
      )}
      {rescheduling && (
        <RescheduleDialog
          open
          onClose={() => setRescheduling(null)}
          actingBranchId={actingBranchId}
          appointment={rescheduling}
          onMutated={onMutated}
        />
      )}
      {cancelling && (
        <CancelDialog
          open
          onClose={() => setCancelling(null)}
          actingBranchId={actingBranchId}
          appointment={cancelling}
          onMutated={onMutated}
        />
      )}
    </section>
  );
}