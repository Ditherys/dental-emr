"use client";

import { ArrowRightLeft, History, Plus, Settings2 } from "lucide-react";
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
import type {
  InventoryAggregate,
  InventoryCategory,
  InventoryItem,
  InventoryMovement,
  InventoryStockRow,
  InventoryTransfer,
  InventoryTransferStatus,
} from "@/lib/inventory/types";
import { cn } from "@/lib/utils";

import {
  adjustStockAction,
  cancelTransferAction,
  confirmTransferAction,
  createItemAction,
  createTransferAction,
  issueStockAction,
  listMovementsAction,
  loadInventoryAction,
  receiveStockAction,
  updateItemAction,
} from "./actions";

type Props = {
  actingBranchId: string;
  branches: Array<{ id: string; name: string }>;
  canManage: boolean;
  initialItems: InventoryItem[];
  initialStock: InventoryStockRow[];
  initialAggregate: InventoryAggregate[];
  initialTransfers: InventoryTransfer[];
};
const inputClass =
  "h-11 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30";

function branchName(branches: Props["branches"], id: string) {
  return branches.find((branch) => branch.id === id)?.name ?? "Unknown branch";
}
function formatDate(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(iso));
}
function transferTone(status: InventoryTransferStatus) {
  return status === "RECEIVED"
    ? "border-success/30 bg-success-soft text-success"
    : status === "CANCELLED"
      ? "border-border bg-subtle-surface text-muted-foreground"
      : "border-info/30 bg-info-soft text-info";
}
function TransferPill({ status }: { status: InventoryTransferStatus }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-2 py-0.5 text-[0.6875rem] font-medium",
        transferTone(status),
      )}
    >
      {status === "PENDING_RECEIPT"
        ? "Pending receipt"
        : status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  );
}
function LowStockPill() {
  return (
    <span className="inline-flex rounded-full border border-destructive/30 bg-destructive/10 px-2 py-0.5 text-[0.6875rem] font-medium text-destructive">
      Low stock
    </span>
  );
}

function ItemDialog({
  item,
  onClose,
  actingBranchId,
  onMutated,
}: {
  item: InventoryItem | null | undefined;
  onClose(): void;
  actingBranchId: string;
  onMutated(): void;
}) {
  const [name, setName] = useState(item?.name ?? "");
  const [code, setCode] = useState(item?.code ?? "");
  const [category, setCategory] = useState<InventoryCategory>(
    item?.category ?? "CONSUMABLE",
  );
  const [unit, setUnit] = useState(item?.unit ?? "");
  const [reorder, setReorder] = useState(String(item?.reorderLevel ?? 0));
  const [lotTracking, setLotTracking] = useState(item?.lotTracking ?? false);
  const [isActive, setIsActive] = useState(item?.isActive ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit() {
    const reorderLevel = Number(reorder);
    if (
      !name.trim() ||
      !unit.trim() ||
      (!item && !/^[A-Z][A-Z0-9_]*$/.test(code))
    )
      return setError(
        "Complete the required item fields. Codes use uppercase letters, numbers, and underscores.",
      );
    if (!Number.isInteger(reorderLevel) || reorderLevel < 0)
      return setError("Reorder level must be zero or more.");
    setSaving(true);
    setError(null);
    try {
      const result = item
        ? await updateItemAction({
            actingBranchId,
            itemId: item.itemId,
            expectedVersion: item.version,
            name: name.trim(),
            category,
            unit: unit.trim(),
            reorderLevel,
            lotTracking,
            isActive,
          })
        : await createItemAction({
            actingBranchId,
            code,
            name: name.trim(),
            category,
            unit: unit.trim(),
            reorderLevel,
            lotTracking,
          });
      if (!result.ok) return setError(result.message);
      toast.success(
        item ? "Inventory item updated." : "Inventory item created.",
      );
      onClose();
      onMutated();
    } catch {
      setError("The inventory item could not be saved.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !saving) onClose();
      }}
    >
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {item ? "Edit inventory item" : "New inventory item"}
          </DialogTitle>
          <DialogDescription>
            Consumables carry branch stock. Equipment remains separate from
            schedulable resources.
          </DialogDescription>
        </DialogHeader>
        {error && (
          <p
            role="alert"
            className="border-y border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        )}
        <div className="grid gap-4">
          {!item && (
            <label className="grid gap-1.5 text-sm font-medium">
              Code
              <input
                aria-label="Code"
                value={code}
                onChange={(event) => setCode(event.target.value.toUpperCase())}
                maxLength={80}
                className={inputClass}
              />
            </label>
          )}
          <label className="grid gap-1.5 text-sm font-medium">
            Name
            <input
              aria-label="Name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={160}
              className={inputClass}
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm font-medium">
              Category
              <select
                aria-label="Category"
                value={category}
                onChange={(event) =>
                  setCategory(event.target.value as InventoryCategory)
                }
                className={inputClass}
              >
                <option value="CONSUMABLE">Consumable stock</option>
                <option value="EQUIPMENT">Equipment catalog</option>
              </select>
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              Unit
              <input
                aria-label="Unit"
                value={unit}
                onChange={(event) => setUnit(event.target.value)}
                maxLength={40}
                className={inputClass}
              />
            </label>
          </div>
          <label className="grid gap-1.5 text-sm font-medium">
            Reorder level
            <input
              aria-label="Reorder level"
              type="number"
              min={0}
              value={reorder}
              onChange={(event) => setReorder(event.target.value)}
              className={inputClass}
            />
          </label>
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={lotTracking}
              onChange={(event) => setLotTracking(event.target.checked)}
              className="size-4 accent-current"
            />
            Track lot and expiry on receipts
          </label>
          {item && (
            <label className="flex min-h-11 items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(event) => setIsActive(event.target.checked)}
                className="size-4 accent-current"
              />
              Active
            </label>
          )}
        </div>
        <Button
          type="button"
          size="lg"
          className="min-h-11"
          disabled={saving}
          onClick={() => void submit()}
        >
          {saving ? "Saving..." : item ? "Save item" : "Create item"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

function StockDialog({
  mode,
  stock,
  item,
  actingBranchId,
  onClose,
  onMutated,
}: {
  mode: "receive" | "adjust" | "issue";
  stock: InventoryStockRow;
  item: InventoryItem;
  actingBranchId: string;
  onClose(): void;
  onMutated(): void;
}) {
  const [quantity, setQuantity] = useState(mode === "adjust" ? "" : "1");
  const [reason, setReason] = useState("");
  const [lotNumber, setLotNumber] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit() {
    const value = Number(quantity);
    if (
      !Number.isInteger(value) ||
      (mode === "adjust" ? value === 0 : value <= 0)
    )
      return setError("Enter a valid whole-number quantity.");
    if (mode !== "receive" && !reason.trim())
      return setError(
        mode === "adjust"
          ? "Add a reason for this stock change."
          : "Add a reason for this stock issue.",
      );
    setSaving(true);
    setError(null);
    try {
      const result =
        mode === "receive"
          ? await receiveStockAction({
              actingBranchId,
              itemId: stock.itemId,
              quantity: value,
              lotNumber: lotNumber.trim() || null,
              expiryDate: expiryDate || null,
            })
          : mode === "adjust"
            ? await adjustStockAction({
                actingBranchId,
                itemId: stock.itemId,
                expectedVersion: stock.version,
                quantityDelta: value,
                reason: reason.trim(),
              })
            : await issueStockAction({
                actingBranchId,
                itemId: stock.itemId,
                expectedVersion: stock.version,
                quantity: value,
                reason: reason.trim(),
              });
      if (!result.ok) return setError(result.message);
      toast.success(
        mode === "receive"
          ? "Stock received."
          : mode === "adjust"
            ? "Stock adjusted."
            : "Stock issued.",
      );
      onClose();
      onMutated();
    } catch {
      setError("The stock movement could not be recorded.");
    } finally {
      setSaving(false);
    }
  }
  const title =
    mode === "receive"
      ? "Receive stock"
      : mode === "adjust"
        ? "Adjust stock"
        : "Issue stock";
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !saving) onClose();
      }}
    >
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {title}: {stock.itemName}
          </DialogTitle>
          <DialogDescription>
            {stock.quantityOnHand} {item.unit} currently on hand at this branch.
          </DialogDescription>
        </DialogHeader>
        {error && (
          <p
            role="alert"
            className="border-y border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        )}
        <div className="grid gap-4">
          <label className="grid gap-1.5 text-sm font-medium">
            {mode === "adjust" ? "Quantity change" : "Quantity"}
            <input
              aria-label={mode === "adjust" ? "Quantity change" : "Quantity"}
              type="number"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              className={inputClass}
            />
          </label>
          {mode === "receive" && item.lotTracking && (
            <>
              <label className="grid gap-1.5 text-sm font-medium">
                Lot number{" "}
                <span className="font-normal text-muted-foreground">
                  (optional)
                </span>
                <input
                  aria-label="Lot number"
                  value={lotNumber}
                  onChange={(event) => setLotNumber(event.target.value)}
                  maxLength={100}
                  className={inputClass}
                />
              </label>
              <label className="grid gap-1.5 text-sm font-medium">
                Expiry date{" "}
                <span className="font-normal text-muted-foreground">
                  (optional)
                </span>
                <input
                  aria-label="Expiry date"
                  type="date"
                  value={expiryDate}
                  onChange={(event) => setExpiryDate(event.target.value)}
                  className={inputClass}
                />
              </label>
            </>
          )}
          {mode !== "receive" && (
            <label className="grid gap-1.5 text-sm font-medium">
              Reason
              <textarea
                aria-label="Reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                maxLength={500}
                rows={3}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
              />
            </label>
          )}
        </div>
        <Button
          type="button"
          size="lg"
          className="min-h-11"
          disabled={saving}
          onClick={() => void submit()}
        >
          {saving
            ? "Saving..."
            : mode === "receive"
              ? "Receive stock"
              : mode === "adjust"
                ? "Apply adjustment"
                : "Issue stock"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

function TransferDialog({
  actingBranchId,
  branches,
  items,
  onClose,
  onMutated,
}: {
  actingBranchId: string;
  branches: Props["branches"];
  items: InventoryItem[];
  onClose(): void;
  onMutated(): void;
}) {
  const [itemId, setItemId] = useState("");
  const [destination, setDestination] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit() {
    const count = Number(quantity);
    if (!itemId || !destination || !Number.isInteger(count) || count <= 0)
      return setError(
        "Select an item and destination and enter a valid quantity.",
      );
    setSaving(true);
    setError(null);
    try {
      const result = await createTransferAction({
        actingBranchId,
        sourceBranchId: actingBranchId,
        destinationBranchId: destination,
        itemId,
        quantity: count,
        reason: reason.trim() || null,
      });
      if (!result.ok) return setError(result.message);
      toast.success(
        "Transfer sent. Destination stock will change only after receipt confirmation.",
      );
      onClose();
      onMutated();
    } catch {
      setError("The transfer could not be created.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !saving) onClose();
      }}
    >
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New branch transfer</DialogTitle>
          <DialogDescription>
            Source stock is reserved now. Destination stock changes only when
            that branch confirms receipt.
          </DialogDescription>
        </DialogHeader>
        {error && (
          <p
            role="alert"
            className="border-y border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        )}
        <div className="grid gap-4">
          <label className="grid gap-1.5 text-sm font-medium">
            Item
            <select
              aria-label="Transfer item"
              value={itemId}
              onChange={(event) => setItemId(event.target.value)}
              className={inputClass}
            >
              <option value="">Select item</option>
              {items
                .filter(
                  (item) => item.category === "CONSUMABLE" && item.isActive,
                )
                .map((item) => (
                  <option key={item.itemId} value={item.itemId}>
                    {item.code} · {item.name}
                  </option>
                ))}
            </select>
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            Destination branch
            <select
              aria-label="Destination branch"
              value={destination}
              onChange={(event) => setDestination(event.target.value)}
              className={inputClass}
            >
              <option value="">Select branch</option>
              {branches
                .filter((branch) => branch.id !== actingBranchId)
                .map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
            </select>
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            Quantity
            <input
              aria-label="Transfer quantity"
              type="number"
              min={1}
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              className={inputClass}
            />
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            Reason{" "}
            <span className="font-normal text-muted-foreground">
              (optional)
            </span>
            <textarea
              aria-label="Transfer reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={500}
              rows={2}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </label>
        </div>
        <Button
          type="button"
          size="lg"
          className="min-h-11"
          disabled={saving}
          onClick={() => void submit()}
        >
          {saving ? "Sending..." : "Send transfer"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

function CancelTransferDialog({
  transfer,
  actingBranchId,
  onClose,
  onMutated,
}: {
  transfer: InventoryTransfer;
  actingBranchId: string;
  onClose(): void;
  onMutated(): void;
}) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit() {
    if (!reason.trim()) return setError("Add a cancellation reason.");
    setSaving(true);
    setError(null);
    try {
      const result = await cancelTransferAction({
        actingBranchId,
        transferId: transfer.transferId,
        expectedVersion: transfer.version,
        reason: reason.trim(),
      });
      if (!result.ok) return setError(result.message);
      toast.success("Transfer cancelled and source stock restored.");
      onClose();
      onMutated();
    } catch {
      setError("The transfer could not be cancelled.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !saving) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cancel transfer</DialogTitle>
          <DialogDescription>
            This restores the quantity to the source branch and records a
            reasoned movement.
          </DialogDescription>
        </DialogHeader>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <label className="grid gap-1.5 text-sm font-medium">
          Cancellation reason
          <textarea
            aria-label="Cancellation reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={500}
            rows={3}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          />
        </label>
        <Button
          type="button"
          variant="destructive"
          className="min-h-11"
          disabled={saving}
          onClick={() => void submit()}
        >
          {saving ? "Cancelling..." : "Cancel transfer"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

function StockActions({
  row,
  disabled,
  onMode,
}: {
  row: InventoryStockRow;
  disabled: boolean;
  onMode(mode: "receive" | "adjust" | "issue", row: InventoryStockRow): void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        type="button"
        variant="outline"
        className="min-h-11"
        disabled={disabled}
        onClick={() => onMode("receive", row)}
      >
        Receive
      </Button>
      <Button
        type="button"
        variant="outline"
        className="min-h-11"
        disabled={disabled}
        onClick={() => onMode("adjust", row)}
      >
        Adjust
      </Button>
      <Button
        type="button"
        variant="outline"
        className="min-h-11"
        disabled={disabled}
        onClick={() => onMode("issue", row)}
      >
        Issue
      </Button>
    </div>
  );
}

export function InventoryBoard({
  actingBranchId,
  branches,
  canManage,
  initialItems,
  initialStock,
  initialAggregate,
  initialTransfers,
}: Props) {
  const [items, setItems] = useState(initialItems);
  const [stock, setStock] = useState(initialStock);
  const [aggregate, setAggregate] = useState(initialAggregate);
  const [transfers, setTransfers] = useState(initialTransfers);
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [movementsLoaded, setMovementsLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const skipFirst = useRef(true);
  const [itemTarget, setItemTarget] = useState<
    InventoryItem | null | undefined
  >(undefined);
  const [stockTarget, setStockTarget] = useState<{
    mode: "receive" | "adjust" | "issue";
    row: InventoryStockRow;
  } | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<InventoryTransfer | null>(
    null,
  );
  const [busyId, setBusyId] = useState<string | null>(null);
  useEffect(() => {
    if (skipFirst.current) {
      skipFirst.current = false;
      return;
    }
    let cancelled = false;
    setLoading(true);
    loadInventoryAction({ actingBranchId })
      .then((result) => {
        if (cancelled) return;
        if (result.ok) {
          setItems(result.items);
          setStock(result.stock);
          setAggregate(result.aggregate);
          setTransfers(result.transfers);
        } else setError(result.message);
      })
      .catch(() => {
        if (!cancelled) setError("Inventory could not be refreshed.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [actingBranchId, reloadTick]);
  function onMutated() {
    setError(null);
    setReloadTick((value) => value + 1);
  }
  const stockByItem = new Map(stock.map((row) => [row.itemId, row]));
  const displayStock = items
    .filter((item) => item.category === "CONSUMABLE" && item.isActive)
    .map(
      (item) =>
        stockByItem.get(item.itemId) ?? {
          itemId: item.itemId,
          itemCode: item.code,
          itemName: item.name,
          branchId: actingBranchId,
          quantityOnHand: 0,
          reorderLevelOverride: null,
          reorderLevel: item.reorderLevel,
          lowStock: item.reorderLevel > 0,
          version: 1,
        },
    );
  async function confirm(transfer: InventoryTransfer) {
    setBusyId(transfer.transferId);
    setError(null);
    try {
      const result = await confirmTransferAction({
        actingBranchId,
        transferId: transfer.transferId,
        expectedVersion: transfer.version,
      });
      if (!result.ok) return setError(result.message);
      toast.success("Transfer receipt confirmed.");
      onMutated();
    } catch {
      setError("The transfer receipt could not be confirmed.");
    } finally {
      setBusyId(null);
    }
  }
  function transferActions(transfer: InventoryTransfer) {
    return (
      <div className="flex flex-wrap gap-2">
        {transfer.status === "SENT" &&
          transfer.destinationBranchId === actingBranchId && (
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              disabled={busyId === transfer.transferId}
              onClick={() => void confirm(transfer)}
            >
              Confirm receipt
            </Button>
          )}
        {transfer.status === "SENT" &&
          transfer.sourceBranchId === actingBranchId && (
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              disabled={busyId === transfer.transferId}
              onClick={() => setCancelTarget(transfer)}
            >
              Cancel
            </Button>
          )}
      </div>
    );
  }
  async function loadMovements() {
    setLoading(true);
    const result = await listMovementsAction({ actingBranchId, itemId: null });
    if (result.ok) {
      setMovements(result.movements);
      setMovementsLoaded(true);
    } else setError(result.message);
    setLoading(false);
  }
  return (
    <div className="space-y-8">
      <section aria-labelledby="stock-title">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="stock-title" className="text-base font-semibold">
              Branch stock balances
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {branchName(branches, actingBranchId)} · negative stock is
              blocked.
            </p>
          </div>
          {canManage && (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="lg"
                className="min-h-11"
                onClick={() => setItemTarget(null)}
              >
                <Plus aria-hidden="true" />
                New item
              </Button>
              <Button
                type="button"
                size="lg"
                variant="outline"
                className="min-h-11"
                onClick={() => setTransferOpen(true)}
              >
                <ArrowRightLeft aria-hidden="true" />
                New transfer
              </Button>
            </div>
          )}
        </div>
        {loading && (
          <p className="mt-2 text-xs text-muted-foreground">
            Updating inventory...
          </p>
        )}
        {error && (
          <p
            role="alert"
            className="mt-3 border-y border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        )}
        <div className="mt-3 hidden overflow-x-auto border-y md:block">
          <table
            className="w-full text-left text-sm"
            aria-label="Branch stock balances"
          >
            <thead className="bg-subtle-surface text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2.5 font-medium">Item</th>
                <th className="px-3 py-2.5 font-medium">Unit</th>
                <th className="px-3 py-2.5 font-medium">On hand</th>
                <th className="px-3 py-2.5 font-medium">Reorder at</th>
                <th className="px-3 py-2.5 font-medium">State</th>
                {canManage && (
                  <th className="px-3 py-2.5 font-medium">Actions</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y">
              {displayStock.length === 0 ? (
                <tr>
                  <td
                    colSpan={canManage ? 6 : 5}
                    className="px-3 py-6 text-muted-foreground"
                  >
                    No consumable stock items.
                  </td>
                </tr>
              ) : (
                displayStock.map((row) => {
                  const item = items.find(
                    (entry) => entry.itemId === row.itemId,
                  )!;
                  return (
                    <tr
                      key={row.itemId}
                      className={cn(row.lowStock && "bg-destructive/5")}
                    >
                      <td className="px-3 py-3">
                        <span className="font-medium">{row.itemName}</span>
                        <span className="ml-2 font-mono text-xs text-muted-foreground">
                          {row.itemCode}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-muted-foreground">
                        {item.unit}
                      </td>
                      <td className="px-3 py-3 font-medium tabular-nums">
                        {row.quantityOnHand}
                      </td>
                      <td className="px-3 py-3 tabular-nums text-muted-foreground">
                        {row.reorderLevelOverride ?? row.reorderLevel}
                      </td>
                      <td className="px-3 py-3">
                        {row.lowStock ? <LowStockPill /> : "In range"}
                      </td>
                      {canManage && (
                        <td className="px-3 py-3">
                          <StockActions
                            row={row}
                            disabled={loading}
                            onMode={(mode, target) =>
                              setStockTarget({ mode, row: target })
                            }
                          />
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <ul
          className="mt-4 divide-y border-y md:hidden"
          aria-label="Branch stock list"
        >
          {displayStock.length === 0 ? (
            <li className="px-3 py-6 text-sm text-muted-foreground">
              No consumable stock items.
            </li>
          ) : (
            displayStock.map((row) => {
              const item = items.find((entry) => entry.itemId === row.itemId)!;
              return (
                <li
                  key={row.itemId}
                  className={cn("py-3", row.lowStock && "bg-destructive/5")}
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-medium">
                      {row.itemName}{" "}
                      <span className="font-mono text-xs text-muted-foreground">
                        {row.itemCode}
                      </span>
                    </p>
                    {row.lowStock && <LowStockPill />}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {row.quantityOnHand} {item.unit} on hand · reorder at{" "}
                    {row.reorderLevelOverride ?? row.reorderLevel}
                  </p>
                  {canManage && (
                    <div className="mt-3">
                      <StockActions
                        row={row}
                        disabled={loading}
                        onMode={(mode, target) =>
                          setStockTarget({ mode, row: target })
                        }
                      />
                    </div>
                  )}
                </li>
              );
            })
          )}
        </ul>
      </section>
      <section aria-labelledby="catalog-title">
        <div className="flex items-center gap-2">
          <Settings2 className="size-4" aria-hidden="true" />
          <h2 id="catalog-title" className="text-base font-semibold">
            Item catalog
          </h2>
        </div>
        <div className="mt-3 hidden overflow-x-auto rounded-md border md:block">
          <table
            className="w-full text-left text-sm"
            aria-label="Inventory item catalog"
          >
            <thead className="bg-subtle-surface text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Code</th>
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Category</th>
                <th className="px-3 py-2 font-medium">Unit</th>
                <th className="px-3 py-2 font-medium">Lot tracking</th>
                {canManage && <th className="px-3 py-2 font-medium">Action</th>}
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.map((item) => (
                <tr key={item.itemId}>
                  <td className="px-3 py-2 font-mono text-xs">{item.code}</td>
                  <td className="px-3 py-2">{item.name}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {item.category === "CONSUMABLE"
                      ? "Consumable"
                      : "Equipment"}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {item.unit}
                  </td>
                  <td className="px-3 py-2">
                    {item.lotTracking ? "Yes" : "No"}
                  </td>
                  {canManage && (
                    <td className="px-3 py-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="min-h-11"
                        onClick={() => setItemTarget(item)}
                      >
                        Edit
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul
          className="mt-3 divide-y border-y md:hidden"
          aria-label="Inventory item catalog list"
        >
          {items.map((item) => (
            <li key={item.itemId} className="px-3 py-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">{item.name}</p>
                  <p className="mt-1 font-mono text-xs text-muted-foreground">
                    {item.code}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">
                  {item.category === "CONSUMABLE" ? "Consumable" : "Equipment"}
                </p>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Unit: {item.unit} · Lot tracking: {item.lotTracking ? "Yes" : "No"}
              </p>
              {canManage && (
                <Button
                  type="button"
                  variant="outline"
                  className="mt-3 min-h-11"
                  onClick={() => setItemTarget(item)}
                >
                  Edit
                </Button>
              )}
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="transfer-title">
        <div className="flex items-center gap-2">
          <ArrowRightLeft className="size-4" aria-hidden="true" />
          <h2 id="transfer-title" className="text-base font-semibold">
            Branch transfers
          </h2>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Destination balances remain unchanged until receipt is confirmed.
        </p>
        <div className="mt-3 hidden overflow-x-auto border-y md:block">
          <table
            className="w-full text-left text-sm"
            aria-label="Inventory transfers"
          >
            <thead className="bg-subtle-surface text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2.5 font-medium">Item</th>
                <th className="px-3 py-2.5 font-medium">Route</th>
                <th className="px-3 py-2.5 font-medium">Quantity</th>
                <th className="px-3 py-2.5 font-medium">Status</th>
                <th className="px-3 py-2.5 font-medium">Created</th>
                {canManage && (
                  <th className="px-3 py-2.5 font-medium">Actions</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y">
              {transfers.length === 0 ? (
                <tr>
                  <td
                    colSpan={canManage ? 6 : 5}
                    className="px-3 py-6 text-muted-foreground"
                  >
                    No transfers for this branch.
                  </td>
                </tr>
              ) : (
                transfers.map((transfer) => (
                  <tr key={transfer.transferId}>
                    <td className="px-3 py-3 font-medium">
                      {transfer.itemName}
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">
                      {branchName(branches, transfer.sourceBranchId)} →{" "}
                      {branchName(branches, transfer.destinationBranchId)}
                    </td>
                    <td className="px-3 py-3 tabular-nums">
                      {transfer.quantity}
                    </td>
                    <td className="px-3 py-3">
                      <TransferPill status={transfer.status} />
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">
                      {formatDate(transfer.createdAt)}
                    </td>
                    {canManage && (
                      <td className="px-3 py-3">
                        {transferActions(transfer)}
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <ul
          className="mt-3 divide-y border-y md:hidden"
          aria-label="Inventory transfer list"
        >
          {transfers.length === 0 ? (
            <li className="px-3 py-6 text-sm text-muted-foreground">
              No transfers for this branch.
            </li>
          ) : (
            transfers.map((transfer) => (
              <li key={transfer.transferId} className="px-3 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">{transfer.itemName}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {branchName(branches, transfer.sourceBranchId)} →{" "}
                      {branchName(branches, transfer.destinationBranchId)}
                    </p>
                  </div>
                  <TransferPill status={transfer.status} />
                </div>
                <p className="mt-2 text-sm tabular-nums">
                  {transfer.quantity} units · {formatDate(transfer.createdAt)}
                </p>
                {canManage && (
                  <div className="mt-3">{transferActions(transfer)}</div>
                )}
              </li>
            ))
          )}
        </ul>
      </section>
      <section aria-labelledby="aggregate-title">
        <h2 id="aggregate-title" className="text-base font-semibold">
          Organization stock by branch
        </h2>
        <div className="mt-3 divide-y border-y">
          {aggregate.length === 0 ? (
            <p className="px-3 py-4 text-sm text-muted-foreground">
              No organization stock yet.
            </p>
          ) : (
            aggregate.map((row) => (
              <div
                key={row.itemId}
                className="grid gap-2 px-3 py-3 sm:grid-cols-[minmax(0,1fr)_auto]"
              >
                <div>
                  <p className="text-sm font-medium">
                    {row.itemName}{" "}
                    <span className="font-mono text-xs text-muted-foreground">
                      {row.itemCode}
                    </span>
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {row.branches
                      .map(
                        (branch) =>
                          `${branchName(branches, branch.branchId)}: ${branch.quantity}${branch.low ? " low" : ""}`,
                      )
                      .join(" · ") || "No branch balance"}
                  </p>
                </div>
                <p className="text-sm tabular-nums">
                  <span className="text-muted-foreground">Total </span>
                  {row.totalOnHand}
                </p>
              </div>
            ))
          )}
        </div>
      </section>
      <section aria-labelledby="movement-title">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <History className="size-4" aria-hidden="true" />
            <h2 id="movement-title" className="text-base font-semibold">
              Movement history
            </h2>
          </div>
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            onClick={() => void loadMovements()}
          >
            <History aria-hidden="true" />
            {movementsLoaded
              ? "Refresh movement history"
              : "Load movement history"}
          </Button>
        </div>
        {movementsLoaded && (
          <div className="mt-3 overflow-x-auto rounded-md border">
            <table
              className="w-full text-left text-sm"
              aria-label="Inventory movement history"
            >
              <thead className="bg-subtle-surface text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Recorded</th>
                  <th className="px-3 py-2 font-medium">Item</th>
                  <th className="px-3 py-2 font-medium">Movement</th>
                  <th className="px-3 py-2 font-medium">Change</th>
                  <th className="px-3 py-2 font-medium">Reason / lot</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {movements.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-4 text-muted-foreground">
                      No movements recorded.
                    </td>
                  </tr>
                ) : (
                  movements.map((movement) => (
                    <tr key={movement.movementId}>
                      <td className="px-3 py-2 text-muted-foreground">
                        {formatDate(movement.recordedAt)}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">
                        {movement.itemCode}
                      </td>
                      <td className="px-3 py-2">
                        {movement.movementType.replaceAll("_", " ")}
                      </td>
                      <td
                        className={cn(
                          "px-3 py-2 font-medium tabular-nums",
                          movement.quantityDelta < 0
                            ? "text-destructive"
                            : "text-success",
                        )}
                      >
                        {movement.quantityDelta > 0 ? "+" : ""}
                        {movement.quantityDelta}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {[
                          movement.reason,
                          movement.lotNumber,
                          movement.expiryDate,
                        ]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {itemTarget !== undefined && (
        <ItemDialog
          item={itemTarget}
          actingBranchId={actingBranchId}
          onClose={() => setItemTarget(undefined)}
          onMutated={onMutated}
        />
      )}
      {stockTarget && (
        <StockDialog
          mode={stockTarget.mode}
          stock={stockTarget.row}
          item={items.find((item) => item.itemId === stockTarget.row.itemId)!}
          actingBranchId={actingBranchId}
          onClose={() => setStockTarget(null)}
          onMutated={onMutated}
        />
      )}
      {transferOpen && (
        <TransferDialog
          actingBranchId={actingBranchId}
          branches={branches}
          items={items}
          onClose={() => setTransferOpen(false)}
          onMutated={onMutated}
        />
      )}
      {cancelTarget && (
        <CancelTransferDialog
          transfer={cancelTarget}
          actingBranchId={actingBranchId}
          onClose={() => setCancelTarget(null)}
          onMutated={onMutated}
        />
      )}
    </div>
  );
}
