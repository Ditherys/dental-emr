import type { Metadata } from "next";

import { PermissionDenied } from "@/components/feedback/permission-denied";
import { PageError } from "@/components/feedback/page-error";
import { PageHeader } from "@/components/layout/page-header";
import { Separator } from "@/components/ui/separator";
import { requireVerifiedIdentity } from "@/lib/auth/identity";
import {
  AuthorizationError,
  requireOrganizationAuthorizationState,
  requirePermission,
} from "@/lib/authorization";
import { listAppointments } from "@/lib/scheduling/service";
import { SchedulingServiceError } from "@/lib/scheduling/service";
import { listProviders } from "@/lib/providers/data";
import { ProviderServiceError } from "@/lib/providers/service";
import { listProcedures } from "@/lib/procedures/data";
import { ProcedureServiceError } from "@/lib/procedures/service";

import { ScheduleCalendar } from "./schedule-calendar";

export const metadata: Metadata = { title: "Schedule" };

const DAY_MS = 24 * 60 * 60 * 1000;

function todayWindow() {
  const now = new Date();
  const startsAt = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return {
    startsAt: startsAt.toISOString(),
    endsAt: new Date(startsAt.getTime() + DAY_MS).toISOString(),
  };
}

export default async function SchedulePage() {
  let denied = false;
  let failed = false;
  let actingBranchId = "";
  let canWrite = false;
  let window = { startsAt: "", endsAt: "" };
  let rows: Awaited<ReturnType<typeof listAppointments>> = [];
  let providerNames: Record<string, string> = {};
  let procedures: Array<{ id: string; name: string }> = [];

  try {
    await requireVerifiedIdentity();
    await requirePermission({ permission: "appointment.read" });
    const state = await requireOrganizationAuthorizationState();
    const actingBranch = state.activeBranches[0];
    if (!actingBranch) {
      denied = true;
    } else {
      await requirePermission({ permission: "appointment.read", branchId: actingBranch.id });
      actingBranchId = actingBranch.id;
      try {
        await requirePermission({ permission: "appointment.write", branchId: actingBranch.id });
        canWrite = true;
      } catch (error) {
        if (!(error instanceof AuthorizationError)) throw error;
      }
      window = todayWindow();
      rows = await listAppointments({ actingBranchId, startsAt: window.startsAt, endsAt: window.endsAt });

      // Provider names and the procedure catalog are read-only enrichments.
      // A schedule-only role (for example dental assistant) has appointment.read
      // but no provider.read, so those lookups may be denied without failing the
      // page; the calendar then falls back to provider ids and no procedure list.
      try {
        const providers = await listProviders({ actingBranchId });
        providerNames = Object.fromEntries(providers.map((provider) => [provider.providerId, provider.displayName]));
      } catch (error) {
        if (!(error instanceof AuthorizationError) && !(error instanceof ProviderServiceError && error.code === "NOT_AUTHORIZED")) {
          throw error;
        }
      }
      try {
        const catalog = await listProcedures({ actingBranchId });
        procedures = catalog.map((procedure) => ({ id: procedure.procedureId, name: procedure.name }));
      } catch (error) {
        if (!(error instanceof AuthorizationError) && !(error instanceof ProcedureServiceError && error.code === "NOT_AUTHORIZED")) {
          throw error;
        }
      }
    }
  } catch (error) {
    if (error instanceof AuthorizationError) denied = true;
    else if (error instanceof SchedulingServiceError) failed = true;
    else throw error;
  }

  if (denied) {
    return (
      <PermissionDenied
        description={actingBranchId ? undefined : "An active branch is required to view the schedule."}
      />
    );
  }
  if (failed) {
    return (
      <div className="mx-auto w-full max-w-7xl">
        <PageHeader title="Schedule" description="Appointments by day or week for the acting branch." />
        <Separator className="my-4" />
        <PageError description="The schedule could not be loaded. Refresh to try again." />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl">
      <PageHeader title="Schedule" description="Appointments by day or week for the acting branch. Patients can be booked without a provider while awaiting a specialist." />
      <Separator className="my-4" />
      <ScheduleCalendar
        actingBranchId={actingBranchId}
        canWrite={canWrite}
        initialStartsAt={window.startsAt}
        initialEndsAt={window.endsAt}
        initialRows={rows}
        providerNames={providerNames}
        procedures={procedures}
      />
    </div>
  );
}