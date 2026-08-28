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
import { listProcedureDirectCostDefaults, BillingServiceError } from "@/lib/billing/service";
import type { ProcedureDirectCostDefaultRow } from "@/lib/billing/types";

import { ProcedureList } from "./procedure-list";

export const metadata: Metadata = { title: "Procedures" };

export default async function ProceduresPage() {
  let denied = false;
  let failed = false;
  let actingBranchId = "";
  let canManage = false;
  let canManageBillingDefaults = false;
  let directCostDefaultsByProcedure: Record<string, ProcedureDirectCostDefaultRow[]> = {};
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
      canManageBillingDefaults = canManage && hasPermission(state, "billing.adjust", actingBranchId);
      [procedures, specialties, providers] = await Promise.all([listProcedures({ actingBranchId }), listSpecialties({ actingBranchId }), listProviders({ actingBranchId })]);
      details = await Promise.all(procedures.map((procedure) => getProcedure(procedure.procedureId, actingBranchId)));
      if (canManageBillingDefaults) {
        const defaults = await Promise.all(procedures.map(async (procedure) => [procedure.procedureId, await listProcedureDirectCostDefaults({ branchId: actingBranchId, procedureId: procedure.procedureId, includeInactive: false })] as const));
        directCostDefaultsByProcedure = Object.fromEntries(defaults);
      }
    }
  } catch (error) {
    if (error instanceof AuthorizationError) denied = true;
    else if (error instanceof ProcedureServiceError || error instanceof ProviderServiceError || error instanceof BillingServiceError) failed = true;
    else throw error;
  }

  if (denied) return <PermissionDenied description={actingBranchId ? undefined : "An active branch is required to manage procedure configuration."} />;
  if (failed) return <div className="mx-auto w-full max-w-7xl"><PageHeader title="Procedures" description="Internal procedure configuration." /><Separator className="my-4" /><PageError description="Procedure configuration could not be loaded. Refresh to try again." /></div>;
  return <div className="mx-auto w-full max-w-7xl"><PageHeader title="Procedures" description="Maintain the internal procedure catalog and its qualification requirements. This does not create schedules, availability, resources, or public booking links." /><Separator className="my-4" /><ProcedureList procedures={procedures} details={details} actingBranchId={actingBranchId} specialties={specialties} providers={providers} canManage={canManage} canManageBillingDefaults={canManageBillingDefaults} directCostDefaultsByProcedure={directCostDefaultsByProcedure} /></div>;
}
