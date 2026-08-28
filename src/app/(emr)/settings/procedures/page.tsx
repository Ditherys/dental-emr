import type { Metadata } from "next";

import { PermissionDenied } from "@/components/feedback/permission-denied";
import { PageError } from "@/components/feedback/page-error";
import { PageHeader } from "@/components/layout/page-header";
import { Separator } from "@/components/ui/separator";
import { AuthorizationError, requireOrganizationAuthorizationState, requirePermission } from "@/lib/authorization";
import { hasPermission } from "@/lib/authorization/policy";
import { listProcedures, getProcedure } from "@/lib/procedures/data";
import { ProcedureServiceError } from "@/lib/procedures/service";
import { listProviders, listSpecialties } from "@/lib/providers/data";
import { ProviderServiceError } from "@/lib/providers/service";

import { ProcedureList } from "./procedure-list";

export const metadata: Metadata = { title: "Procedures" };

export default async function ProceduresPage() {
  let denied = false;
  let failed = false;
  let actingBranchId = "";
  let canManage = false;
  let procedures: Awaited<ReturnType<typeof listProcedures>> = [];
  let details: Awaited<ReturnType<typeof getProcedure>>[] = [];
  let specialties: Awaited<ReturnType<typeof listSpecialties>> = [];
  let providers: Awaited<ReturnType<typeof listProviders>> = [];

  try {
    await requirePermission({ permission: "provider.read" });
    const state = await requireOrganizationAuthorizationState();
    const actingBranch = state.activeBranches[0];
    if (!actingBranch) {
      denied = true;
    } else {
      actingBranchId = actingBranch.id;
      await requirePermission({ permission: "provider.read", branchId: actingBranchId });
      canManage = hasPermission(state, "provider.manage", actingBranchId);
      [procedures, specialties, providers] = await Promise.all([listProcedures({ actingBranchId }), listSpecialties({ actingBranchId }), listProviders({ actingBranchId })]);
      details = await Promise.all(procedures.map((procedure) => getProcedure(procedure.procedureId, actingBranchId)));
    }
  } catch (error) {
    if (error instanceof AuthorizationError) denied = true;
    else if (error instanceof ProcedureServiceError || error instanceof ProviderServiceError) failed = true;
    else throw error;
  }

  if (denied) return <PermissionDenied description={actingBranchId ? undefined : "An active branch is required to manage procedure configuration."} />;
  if (failed) return <div className="mx-auto w-full max-w-7xl"><PageHeader title="Procedures" description="Internal procedure configuration." /><Separator className="my-4" /><PageError description="Procedure configuration could not be loaded. Refresh to try again." /></div>;
  return <div className="mx-auto w-full max-w-7xl"><PageHeader title="Procedures" description="Maintain the internal procedure catalog and its qualification requirements. This does not create pricing, schedules, availability, resources, or public booking links." /><Separator className="my-4" /><ProcedureList procedures={procedures} details={details} actingBranchId={actingBranchId} specialties={specialties} providers={providers} canManage={canManage} /></div>;
}
