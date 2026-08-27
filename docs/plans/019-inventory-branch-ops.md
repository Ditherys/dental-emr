# Phase 19 — Inventory & Branch Operations

**Status:** Authored 2026-08-27 by the orchestrator under the project owner's
explicit one-pass SDD directive (Phases 4–24). Derived strictly from
`docs/MASTER_PRODUCT_PLAN.md` §Phase 19 plus accepted architecture
(DATABASE_DESIGN §13 separates schedulable resources from consumable stock). No
new product requirements are invented.

**Goal:** Consumable stock inventory that is traceable by branch, with receipts,
reasoned manual adjustments and issues, branch-to-branch transfers that only
become received on destination confirmation, reorder levels with branch-specific
low-stock logic, a complete movement audit trail, an organization-level
aggregate view preserving branch filters, and lot/expiry fields where enabled.
Schedulable equipment/resources stay in the Phase 6 `branch_resources` model
(separate from consumable stock).

## Global Constraints

- All Phase 1–18 doctrine applies unchanged.
- Stock balances are per-branch; an item catalog entry may be used at any org
  branch. Every movement is an append-only audited row; balances are derived
  from movements (ledger-style), never silently overwritten.
- **Negative stock is prevented**: balances are CHECKed >= 0 and movements are
  validated in-transaction (an issue/transfer-out cannot exceed on-hand).
- **Adjustments/issues require user + reason** (server-validated, audited).
- **Transfers require destination confirmation**: a transfer_out movement is
  recorded at the source (pending); the destination confirms receipt which
  posts the transfer_in movement; until then the destination balance does not
  change and the transfer status is SENT/PENDING_RECEIPT.
- Low-stock is branch-specific (branch-level reorder override or the catalog
  default reorder level, evaluated per-branch).
- Lot/expiry tracking is a catalog flag (lot_number/expiry columns on
  movements when enabled); a full lot/expiry engine is deferred.
- Aggregation preserves branch filters (org dashboard aggregates per-branch).

## Role matrix

- `inventory.view`: OWNER, ADMIN.
- `inventory.manage`: OWNER, ADMIN.

## Tasks

- [ ] **P19-01: Inventory permission + schema**
  - `inventory.view` / `inventory.manage` permission rows + matrix;
    `PermissionCode` + policy test; pgTAP.
  - `inventory_items`: org, code, name, category (CONSUMABLE/EQUIPMENT — only
    consumables get stock; equipment may reference the P6 resource model),
    unit bounded, reorder_level int >=0, lot_tracking boolean default false,
    is_active, version, timestamps; unique(org, code). RLS + zero grants.
  - `inventory_stock`: org, branch composite FK, item org composite FK,
    quantity_on_hand int >=0, reorder_level_override int >=0 nullable, version,
    updated_at; unique(org, branch, item). RLS + zero grants.
  - `inventory_movements`: org, branch, item, movement_type
    (RECEIPT/ADJUSTMENT/ISSUE/TRANSFER_OUT/TRANSFER_IN), quantity_delta int
    <>0, reason bounded nullable, transfer_id FK nullable, lot_number nullable,
    expiry_date nullable, recorded_by, recorded_at; ledger-style append-only
    (no UPDATE/DELETE via trigger). RLS + zero grants + indexes.
  - `inventory_transfers`: org, source_branch, destination_branch, item,
    quantity int >0, status (SENT/PENDING_RECEIPT/RECEIVED/CANCELLED),
    created_by, confirmed_by/confirmed_at, timestamps. RLS + zero grants.
  - pgTAP.

- [ ] **P19-02: Inventory RPCs**
  - `private.has_inventory_permission_at_branch(acting_branch_id, code)` helper.
  - Catalog: `create_inventory_item` / `update_inventory_item` /
    `list_inventory_items` (inventory.manage; audit item.created/updated).
  - Movements: `receive_stock(acting_branch_id, item_id, quantity, lot_number
    null, expiry_date null)` (RECEIPT +quantity, reason optional; audit),
    `adjust_stock(acting_branch_id, item_id, expected_version, quantity_delta,
    reason)` (ADJUSTMENT, reason REQUIRED, cannot drive balance <0; audit),
    `issue_stock(acting_branch_id, item_id, expected_version, quantity, reason)`
    (ISSUE -quantity, reason REQUIRED, cannot drive <0; audit).
  - Transfers: `create_inventory_transfer(acting_branch_id, source_branch_id,
    destination_branch_id, item_id, quantity, reason)` (records TRANSFER_OUT at
    source; source balance reduced; transfer SENT; audit),
    `confirm_transfer_receipt(acting_branch_id, transfer_id, expected_version)`
    (destination confirms; TRANSFER_IN posted at destination; status RECEIVED;
    confirmed_by/at; audit), `cancel_inventory_transfer(...)` (reverses the
    source TRANSFER_OUT back to balance; status CANCELLED; audit).
  - Reads: `list_inventory_stock(acting_branch_id, item_id null, low_only
    boolean)` (inventory.view; per-branch balances; low_stock derived when
    quantity < branch override or catalog reorder level; no audit),
    `list_inventory_movements(acting_branch_id, item_id null)` (bounded 200;
    audit trail read; no audit), `get_inventory_aggregate(acting_branch_id)`
    (org-level aggregate by item with per-branch breakdown — preserves branch
    filters; inventory.view; no audit).
  - Terminal grants + pgTAP (receipt/adjust/issue reason required, negative
    prevented, transfer requires confirmation — destination balance unchanged
    until confirm, cancel reverses, branch isolation, low-stock branch-specific,
    aggregate with branch breakdown, ledger immutability trigger, audit per
    mutation + rollback, permission denials).

- [ ] **P19-03: Server services + inventory UI**
  - `src/lib/inventory/` service layer + offline tests.
  - `/inventory` page (inventory.view): item catalog (dense table/phone),
    per-branch stock balances with low-stock emphasis, Receive/Adjust/Issue
    dialogs (reason required for adjust/issue), transfers (create + confirm
    receipt + cancel), movements history, aggregate view. Gated on
    inventory.view; manage actions on inventory.manage. 44px, phone/desktop.
    Server actions recheck inventory.view/manage + branch. Tests.

- [ ] **P19-04: Integration verification + phase review**

## Explicitly deferred

- Full lot/expiry engine (fields + flag only).
- Procurement/POS for suppliers (receipts only).
- Barcode/scanning.
- Inventory valuation/costing (Phase 21 billing).

## Acceptance criteria (from MASTER_PRODUCT_PLAN §Phase 19)

- stock traceable by branch (per-branch balances + movement ledger);
- adjustment requires user/reason and is audited;
- transfer does not appear as received until destination confirms;
- negative stock prevented (CHECK + transaction validation);
- low-stock logic branch-specific;
- org dashboard aggregates inventory preserving branch filters.

## Verification

- Full local db reset/provision/test; security migrations/secrets/audit;
  unit/lint/typecheck/build. Cloud TEST remains the deployment gate.