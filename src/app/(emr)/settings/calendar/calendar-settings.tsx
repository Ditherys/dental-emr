"use client";

import { useEffect, useRef, useState } from "react";
import { Plug, RefreshCw, Unplug } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type {
  CalendarConnectionStatus,
  CalendarIntegration,
  CalendarPrivacyMode,
  CalendarSyncJob,
  CalendarSyncOperation,
  CalendarSyncStatus,
} from "@/lib/calendar/types";

import {
  connectCalendarAction,
  disconnectCalendarAction,
  enqueueCalendarSyncAction,
  loadCalendarSettingsAction,
} from "./actions";

const controlClasses =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-none outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25";

type Props = {
  actingBranchId: string;
  initialIntegrations: CalendarIntegration[];
  initialSyncJobs: CalendarSyncJob[];
};

const connectionLabels: Record<CalendarConnectionStatus, string> = {
  CONNECTED: "Connected",
  DISCONNECTED: "Disconnected",
  ERROR: "Error",
};

const privacyLabels: Record<CalendarPrivacyMode, string> = {
  HIGH_PRIVACY: "High privacy",
  BALANCED: "Balanced",
  DETAILED: "Detailed",
};

const syncStatusLabels: Record<CalendarSyncStatus, string> = {
  QUEUED: "Queued",
  PROCESSED: "Processed",
  FAILED: "Failed",
  CANCELLED: "Cancelled",
};

const operationLabels: Record<CalendarSyncOperation, string> = {
  CREATE: "Create",
  UPDATE: "Update",
  CANCEL: "Cancel",
};

function formatDateTime(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

function truncateId(value: string) {
  if (value.length <= 20) return value;
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}

function ConnectionPill({ status }: { status: CalendarConnectionStatus }) {
  const tone =
    status === "ERROR"
      ? "border-destructive/30 bg-destructive/10 text-destructive"
      : status === "CONNECTED"
        ? "border-success/30 bg-success-soft text-success"
        : "border-border bg-subtle-surface/60 text-muted-foreground";
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[0.6875rem] font-medium", tone)}>
      {connectionLabels[status]}
    </span>
  );
}

function SyncStatusPill({ status }: { status: CalendarSyncStatus }) {
  const tone =
    status === "FAILED"
      ? "border-destructive/30 bg-destructive/10 text-destructive"
      : status === "PROCESSED"
        ? "border-success/30 bg-success-soft text-success"
        : "border-border bg-subtle-surface/60 text-muted-foreground";
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[0.6875rem] font-medium", tone)}>
      {syncStatusLabels[status]}
    </span>
  );
}

function ConnectCalendarDialog({
  actingBranchId,
  providers,
  defaultProviderId,
  onConnected,
}: {
  actingBranchId: string;
  providers: Array<{ providerId: string; providerDisplayName: string }>;
  defaultProviderId: string;
  onConnected: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [providerId, setProviderId] = useState(defaultProviderId);
  const [calendarId, setCalendarId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openDialog(next: boolean) {
    if (next) {
      setProviderId(defaultProviderId);
      setCalendarId("");
      setError(null);
    }
    setOpen(next);
  }

  async function submit() {
    if (!providerId || !calendarId.trim()) {
      setError("Choose a provider and enter a calendar id.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await connectCalendarAction({
        actingBranchId,
        providerId,
        calendarId: calendarId.trim(),
      });
      if (!result.ok) return setError(result.message);
      setOpen(false);
      toast.success("Calendar connected.");
      onConnected();
    } catch {
      setError("The calendar could not be connected. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={openDialog}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" className="min-h-11">
          <Plug aria-hidden="true" />
          Connect
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Connect a calendar</DialogTitle>
          <DialogDescription>
            Record which provider calendar syncs to for the acting branch. Only the connection state is stored here.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
          className="space-y-4"
        >
          <label className="grid gap-1.5 text-sm font-medium">
            <span>Provider</span>
            <select
              value={providerId}
              onChange={(event) => setProviderId(event.target.value)}
              className={controlClasses}
            >
              {providers.map((provider) => (
                <option key={provider.providerId} value={provider.providerId}>
                  {provider.providerDisplayName}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            <span>Calendar id</span>
            <input
              value={calendarId}
              onChange={(event) => setCalendarId(event.target.value)}
              className={controlClasses}
            />
          </label>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="min-h-11" disabled={busy}>
            {busy ? "Connecting..." : "Connect calendar"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function IntegrationRowActions({
  actingBranchId,
  integration,
  connectableProviders,
  busy,
  onDisconnect,
  onConnected,
}: {
  actingBranchId: string;
  integration: CalendarIntegration;
  connectableProviders: Array<{ providerId: string; providerDisplayName: string }>;
  busy: boolean;
  onDisconnect(integration: CalendarIntegration): Promise<void>;
  onConnected(): void;
}) {
  if (integration.connectionStatus === "CONNECTED") {
    return (
      <Button type="button" variant="outline" className="min-h-11" disabled={busy} onClick={() => void onDisconnect(integration)}>
        <Unplug aria-hidden="true" />
        Disconnect
      </Button>
    );
  }
  return (
    <ConnectCalendarDialog
      actingBranchId={actingBranchId}
      providers={connectableProviders}
      defaultProviderId={integration.providerId}
      onConnected={onConnected}
    />
  );
}

function SyncJobRowActions({ job, busy, onResync }: {
  job: CalendarSyncJob;
  busy: boolean;
  onResync(job: CalendarSyncJob): Promise<void>;
}) {
  if (job.status !== "FAILED") return null;
  return (
    <Button type="button" variant="outline" className="min-h-11" disabled={busy} onClick={() => void onResync(job)}>
      <RefreshCw aria-hidden="true" />
      Re-sync
    </Button>
  );
}

function IntegrationRow({ actingBranchId, integration, connectableProviders, busy, onDisconnect, onConnected }: {
  actingBranchId: string;
  integration: CalendarIntegration;
  connectableProviders: Array<{ providerId: string; providerDisplayName: string }>;
  busy: boolean;
  onDisconnect(integration: CalendarIntegration): Promise<void>;
  onConnected(): void;
}) {
  return (
    <tr className="border-b last:border-0">
      <td className="px-3 py-3"><ConnectionPill status={integration.connectionStatus} /></td>
      <td className="px-3 py-3 font-medium">{integration.providerDisplayName}</td>
      <td className="px-3 py-3 text-muted-foreground">{privacyLabels[integration.privacyMode]}</td>
      <td className="px-3 py-3 font-mono text-xs text-muted-foreground">{truncateId(integration.calendarId)}</td>
      <td className="px-3 py-3 text-muted-foreground">
        {integration.lastSyncedAt ? formatDateTime(integration.lastSyncedAt) : "—"}
      </td>
      <td className="px-3 py-3">
        <IntegrationRowActions
          actingBranchId={actingBranchId}
          integration={integration}
          connectableProviders={connectableProviders}
          busy={busy}
          onDisconnect={onDisconnect}
          onConnected={onConnected}
        />
      </td>
    </tr>
  );
}

function IntegrationListItem({ actingBranchId, integration, connectableProviders, busy, onDisconnect, onConnected }: {
  actingBranchId: string;
  integration: CalendarIntegration;
  connectableProviders: Array<{ providerId: string; providerDisplayName: string }>;
  busy: boolean;
  onDisconnect(integration: CalendarIntegration): Promise<void>;
  onConnected(): void;
}) {
  return (
    <li className="py-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium">{integration.providerDisplayName}</p>
        <ConnectionPill status={integration.connectionStatus} />
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {privacyLabels[integration.privacyMode]}
        {" · "}
        <span className="font-mono">{truncateId(integration.calendarId)}</span>
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {integration.lastSyncedAt ? `Last synced ${formatDateTime(integration.lastSyncedAt)}` : "Never synced"}
      </p>
      <div className="mt-2">
        <IntegrationRowActions
          actingBranchId={actingBranchId}
          integration={integration}
          connectableProviders={connectableProviders}
          busy={busy}
          onDisconnect={onDisconnect}
          onConnected={onConnected}
        />
      </div>
    </li>
  );
}

function SyncJobRow({ job, busy, onResync }: {
  job: CalendarSyncJob;
  busy: boolean;
  onResync(job: CalendarSyncJob): Promise<void>;
}) {
  return (
    <tr className="border-b last:border-0">
      <td className="px-3 py-3 font-medium">{job.providerDisplayName}</td>
      <td className="px-3 py-3 text-muted-foreground">{operationLabels[job.operation]}</td>
      <td className="px-3 py-3"><SyncStatusPill status={job.status} /></td>
      <td className="px-3 py-3 tabular-nums">{job.attempts}</td>
      <td className="px-3 py-3 text-muted-foreground">
        {job.nextAttemptAt ? formatDateTime(job.nextAttemptAt) : "—"}
      </td>
      <td className="px-3 py-3 font-mono text-xs text-muted-foreground">
        {job.externalEventId ? truncateId(job.externalEventId) : "—"}
      </td>
      <td className="px-3 py-3">
        <SyncJobRowActions job={job} busy={busy} onResync={onResync} />
      </td>
    </tr>
  );
}

function SyncJobListItem({ job, busy, onResync }: {
  job: CalendarSyncJob;
  busy: boolean;
  onResync(job: CalendarSyncJob): Promise<void>;
}) {
  return (
    <li className="py-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium">{job.providerDisplayName} · {operationLabels[job.operation]}</p>
        <SyncStatusPill status={job.status} />
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {job.attempts} {job.attempts === 1 ? "attempt" : "attempts"}
        {" · "}
        {job.nextAttemptAt ? `Next attempt ${formatDateTime(job.nextAttemptAt)}` : "No next attempt"}
      </p>
      <p className="mt-1 font-mono text-xs text-muted-foreground">
        {job.externalEventId ? truncateId(job.externalEventId) : "—"}
      </p>
      <div className="mt-2">
        <SyncJobRowActions job={job} busy={busy} onResync={onResync} />
      </div>
    </li>
  );
}

export function CalendarSettings({ actingBranchId, initialIntegrations, initialSyncJobs }: Props) {
  const [integrations, setIntegrations] = useState<CalendarIntegration[]>(initialIntegrations);
  const [syncJobs, setSyncJobs] = useState<CalendarSyncJob[]>(initialSyncJobs);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const skipFirstLoad = useRef(true);

  const connectableProviders = integrations
    .filter((integration) => integration.connectionStatus !== "CONNECTED")
    .map(({ providerId, providerDisplayName }) => ({ providerId, providerDisplayName }));

  useEffect(() => {
    if (skipFirstLoad.current) {
      skipFirstLoad.current = false;
      return;
    }
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    loadCalendarSettingsAction({ actingBranchId })
      .then((result) => {
        if (cancelled) return;
        if (result.ok) {
          setIntegrations(result.integrations);
          setSyncJobs(result.syncJobs);
        } else {
          setLoadError(result.message);
        }
      })
      .catch(() => {
        if (!cancelled) setLoadError("The calendar settings could not be loaded. Refresh to try again.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [actingBranchId, reloadTick]);

  function onMutated() {
    setReloadTick((tick) => tick + 1);
  }

  async function runDisconnect(integration: CalendarIntegration) {
    setBusyId(integration.integrationId);
    setActionError(null);
    try {
      const result = await disconnectCalendarAction({
        actingBranchId,
        providerId: integration.providerId,
      });
      if (!result.ok) return setActionError(result.message);
      setActionError(null);
      toast.success("Calendar disconnected.");
      onMutated();
    } catch {
      setActionError("The calendar could not be disconnected. Try again.");
    } finally {
      setBusyId(null);
    }
  }

  async function runResync(job: CalendarSyncJob) {
    setBusyId(job.syncJobId);
    setActionError(null);
    try {
      const result = await enqueueCalendarSyncAction({
        actingBranchId,
        appointmentId: job.appointmentId,
        providerId: job.providerId,
        operation: "UPDATE",
      });
      if (!result.ok) return setActionError(result.message);
      setActionError(null);
      toast.success("Sync queued.");
      onMutated();
    } catch {
      setActionError("The calendar sync could not be queued. Try again.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-10">
      {actionError && <p role="alert" className="border-y border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive">{actionError}</p>}
      {loadError && <p role="alert" className="border-y border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive">{loadError}</p>}
      {loading && <p className="text-xs text-muted-foreground">Updating calendar sync…</p>}

      <section aria-labelledby="calendar-integrations-title">
        <h2 id="calendar-integrations-title" className="text-base font-semibold">Provider integrations</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Per-provider calendar connections for the acting branch. A connection
          stores connection state only; live Google sync is enabled when a
          connection is available in your environment.
        </p>

        <div className="mt-3 hidden overflow-x-auto border-y md:block">
          <table className="w-full text-left text-sm" aria-label="Provider calendar integrations">
            <caption className="sr-only">Calendar integrations for the acting branch</caption>
            <thead className="bg-subtle-surface text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2.5 font-medium">Status</th>
                <th scope="col" className="px-3 py-2.5 font-medium">Provider</th>
                <th scope="col" className="px-3 py-2.5 font-medium">Privacy</th>
                <th scope="col" className="px-3 py-2.5 font-medium">Calendar id</th>
                <th scope="col" className="px-3 py-2.5 font-medium">Last synced</th>
                <th scope="col" className="px-3 py-2.5 font-medium"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {integrations.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-sm text-muted-foreground">No calendar integrations found.</td>
                </tr>
              ) : (
                integrations.map((integration) => (
                  <IntegrationRow
                    key={integration.integrationId}
                    actingBranchId={actingBranchId}
                    integration={integration}
                    connectableProviders={connectableProviders}
                    busy={busyId === integration.integrationId}
                    onDisconnect={runDisconnect}
                    onConnected={onMutated}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>

        <ul className="mt-4 divide-y border-y md:hidden" aria-label="Provider calendar integrations list">
          {integrations.length === 0 ? (
            <li className="px-3 py-6 text-sm text-muted-foreground">No calendar integrations found.</li>
          ) : (
            integrations.map((integration) => (
              <IntegrationListItem
                key={integration.integrationId}
                actingBranchId={actingBranchId}
                integration={integration}
                connectableProviders={connectableProviders}
                busy={busyId === integration.integrationId}
                onDisconnect={runDisconnect}
                onConnected={onMutated}
              />
            ))
          )}
        </ul>
      </section>

      <section aria-labelledby="calendar-sync-jobs-title">
        <h2 id="calendar-sync-jobs-title" className="text-base font-semibold">Sync jobs</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Queued and recent EMR-to-calendar sync activity. A failed job is a warning only; the EMR appointment is never changed by a sync. Workers retry automatically with backoff until the attempt limit.
        </p>

        <div className="mt-3 hidden overflow-x-auto border-y md:block">
          <table className="w-full text-left text-sm" aria-label="Calendar sync jobs">
            <caption className="sr-only">Calendar sync jobs for the acting branch</caption>
            <thead className="bg-subtle-surface text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2.5 font-medium">Provider</th>
                <th scope="col" className="px-3 py-2.5 font-medium">Operation</th>
                <th scope="col" className="px-3 py-2.5 font-medium">Status</th>
                <th scope="col" className="px-3 py-2.5 font-medium">Attempts</th>
                <th scope="col" className="px-3 py-2.5 font-medium">Next attempt</th>
                <th scope="col" className="px-3 py-2.5 font-medium">External event id</th>
                <th scope="col" className="px-3 py-2.5 font-medium"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {syncJobs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-sm text-muted-foreground">No sync jobs found.</td>
                </tr>
              ) : (
                syncJobs.map((job) => (
                  <SyncJobRow key={job.syncJobId} job={job} busy={busyId === job.syncJobId} onResync={runResync} />
                ))
              )}
            </tbody>
          </table>
        </div>

        <ul className="mt-4 divide-y border-y md:hidden" aria-label="Calendar sync jobs list">
          {syncJobs.length === 0 ? (
            <li className="px-3 py-6 text-sm text-muted-foreground">No sync jobs found.</li>
          ) : (
            syncJobs.map((job) => (
              <SyncJobListItem key={job.syncJobId} job={job} busy={busyId === job.syncJobId} onResync={runResync} />
            ))
          )}
        </ul>
      </section>
    </div>
  );
}