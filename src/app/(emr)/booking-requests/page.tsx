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
import { BookingServiceError, listBookingRequests } from "@/lib/booking/service";

import { BookingRequestsBoard } from "./booking-requests-board";

export const metadata: Metadata = { title: "Booking requests" };

export default async function BookingRequestsPage() {
  let denied = false;
  let failed = false;
  let actingBranchId = "";
  let rows: Awaited<ReturnType<typeof listBookingRequests>> = [];

  try {
    await requireVerifiedIdentity();
    await requirePermission({ permission: "booking.review" });
    const state = await requireOrganizationAuthorizationState();
    const actingBranch = state.activeBranches[0];
    if (!actingBranch) {
      denied = true;
    } else {
      await requirePermission({ permission: "booking.review", branchId: actingBranch.id });
      actingBranchId = actingBranch.id;
      rows = await listBookingRequests({ actingBranchId, status: "SUBMITTED" });
    }
  } catch (error) {
    if (error instanceof AuthorizationError) denied = true;
    else if (error instanceof BookingServiceError) failed = true;
    else throw error;
  }

  if (denied) {
    return (
      <PermissionDenied
        description={actingBranchId ? undefined : "An active branch is required to review booking requests."}
      />
    );
  }
  if (failed) {
    return (
      <div className="mx-auto w-full max-w-7xl">
        <PageHeader title="Booking requests" description="Public website booking requests for the acting branch." />
        <Separator className="my-6" />
        <PageError description="Booking requests could not be loaded. Refresh to try again." />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl">
      <PageHeader
        title="Booking requests"
        description="Review public website bookings. Only the minimal submitted contact details are shown — never clinical information."
      />
      <Separator className="my-6" />
      <BookingRequestsBoard actingBranchId={actingBranchId} initialRows={rows} />
    </div>
  );
}