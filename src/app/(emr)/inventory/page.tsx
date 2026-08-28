import type { Metadata } from "next";

import { PageError } from "@/components/feedback/page-error";
import { PermissionDenied } from "@/components/feedback/permission-denied";
import { PageHeader } from "@/components/layout/page-header";
import { Separator } from "@/components/ui/separator";
import { requireVerifiedIdentity } from "@/lib/auth/identity";
import { AuthorizationError, requireOrganizationAuthorizationState, requirePermission } from "@/lib/authorization";
import { getInventoryAggregate, InventoryServiceError, listInventoryItems, listInventoryStock, listInventoryTransfers } from "@/lib/inventory/service";

import { InventoryBoard } from "./inventory-board";

export const metadata: Metadata = { title: "Inventory" };

export default async function InventoryPage() {
  let denied = false;
  let failed = false;
  let canManage = false;
  let actingBranchId = "";
  let branches: Array<{ id: string; name: string }> = [];
  let items: Awaited<ReturnType<typeof listInventoryItems>> = [];
  let stock: Awaited<ReturnType<typeof listInventoryStock>> = [];
  let aggregate: Awaited<ReturnType<typeof getInventoryAggregate>> = [];
  let transfers: Awaited<ReturnType<typeof listInventoryTransfers>> = [];

  try {
    await requireVerifiedIdentity();
    await requirePermission({ permission: "inventory.view" });
    const state = await requireOrganizationAuthorizationState();
    const actingBranch = state.activeBranches[0];
    if (!actingBranch) denied = true;
    else {
      actingBranchId = actingBranch.id;
      branches = state.activeBranches.map(({ id, name }) => ({ id, name }));
      await requirePermission({ permission: "inventory.view", branchId: actingBranchId });
      [items, stock, aggregate, transfers] = await Promise.all([
        listInventoryItems({ actingBranchId }),
        listInventoryStock({ actingBranchId }),
        getInventoryAggregate({ actingBranchId }),
        listInventoryTransfers({ actingBranchId }),
      ]);
      try {
        await requirePermission({ permission: "inventory.manage", branchId: actingBranchId });
        canManage = true;
      } catch (error) {
        if (!(error instanceof AuthorizationError)) throw error;
      }
    }
  } catch (error) {
    if (error instanceof AuthorizationError) denied = true;
    else if (error instanceof InventoryServiceError) failed = true;
    else throw error;
  }

  if (denied) return <PermissionDenied description={actingBranchId ? undefined : "An active branch is required to view inventory."} />;
  if (failed) return <div className="mx-auto w-full max-w-7xl"><PageHeader title="Inventory" description="Branch stock, transfers, and movement history." /><Separator className="my-4" /><PageError description="Inventory could not be loaded. Refresh to try again." /></div>;

  return (
    <div className="mx-auto w-full max-w-7xl">
      <PageHeader title="Inventory" description="Track consumable stock by branch, receive and issue materials, and confirm branch transfers." />
      <Separator className="my-4" />
      <InventoryBoard actingBranchId={actingBranchId} branches={branches} canManage={canManage} initialItems={items} initialStock={stock} initialAggregate={aggregate} initialTransfers={transfers} />
    </div>
  );
}
