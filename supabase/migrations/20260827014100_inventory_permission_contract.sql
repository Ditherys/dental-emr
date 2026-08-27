-- P19-01: inventory permission vocabulary, the fixed baseline role matrix, and
-- the branch-aware inventory schema. inventory.manage (OWNER/ADMIN) covers item
-- catalog maintenance, stock receipts/adjustments/issues, and transfers;
-- inventory.view (OWNER/ADMIN) covers the bounded per-branch stock, movement,
-- and aggregate reads. Every table is RLS-enforced with zero base grants and no
-- browser policies; all reads and writes flow through the P19-02 SECURITY
-- DEFINER RPCs. Stock balances are per-branch materialized aggregates that are
-- only ever changed in the same transaction that appends the matching
-- ledger-style inventory_movements row, and inventory_movements is append-only
-- via trigger. This object migration grants nothing.

insert into public.permissions (code, description)
values
  (
    'inventory.manage',
    'Manage the item catalog, branch stock, and branch-to-branch transfers.'
  ),
  (
    'inventory.view',
    'Read per-branch stock balances, movements, and the organization inventory aggregate.'
  )
on conflict (code) do nothing;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles as role
cross join public.permissions as permission
where role.organization_id is null
  and role.is_system
  and role.code in ('OWNER', 'ADMIN')
  and permission.code in ('inventory.view', 'inventory.manage')
on conflict do nothing;

create table public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete restrict,
  code text not null,
  name text not null,
  category text not null,
  unit text not null,
  reorder_level integer not null default 0,
  lot_tracking boolean not null default false,
  is_active boolean not null default true,
  version integer not null default 1,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint inventory_items_code_bounded_check check (
    code = pg_catalog.upper(code)
    and code ~ '^[A-Z][A-Z0-9_]*$'
    and pg_catalog.length(code) <= 80
  ),
  constraint inventory_items_name_bounded_check check (
    pg_catalog.btrim(name) <> ''
    and pg_catalog.length(name) <= 160
  ),
  constraint inventory_items_category_check check (
    category in ('CONSUMABLE', 'EQUIPMENT')
  ),
  constraint inventory_items_unit_bounded_check check (
    pg_catalog.btrim(unit) <> ''
    and pg_catalog.length(unit) <= 40
  ),
  constraint inventory_items_reorder_level_nonnegative_check check (
    reorder_level >= 0
  ),
  constraint inventory_items_version_positive_check check (version > 0),
  constraint inventory_items_organization_id_id_key unique (organization_id, id),
  constraint inventory_items_organization_code_key unique (organization_id, code)
);

revoke all on table public.inventory_items
from public, anon, authenticated, service_role;

alter table public.inventory_items enable row level security;

comment on table public.inventory_items is
  'Tenant item catalog rows (consumables carry stock; equipment may reference the Phase 6 resource model); no browser policy exists.';

create index inventory_items_organization_active_code_idx
  on public.inventory_items (organization_id, is_active, code);

create trigger inventory_items_set_updated_at
before update on public.inventory_items
for each row execute function private.set_updated_at();

create table public.inventory_stock (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete restrict,
  branch_id uuid not null,
  item_id uuid not null,
  quantity_on_hand integer not null default 0,
  reorder_level_override integer,
  version integer not null default 1,
  updated_at timestamptz not null default statement_timestamp(),
  constraint inventory_stock_quantity_nonnegative_check check (
    quantity_on_hand >= 0
  ),
  constraint inventory_stock_reorder_override_nonnegative_check check (
    reorder_level_override is null or reorder_level_override >= 0
  ),
  constraint inventory_stock_version_positive_check check (version > 0),
  constraint inventory_stock_organization_branch_item_key unique (
    organization_id,
    branch_id,
    item_id
  ),
  constraint inventory_stock_organization_id_id_key unique (organization_id, id),
  constraint inventory_stock_organization_branch_fk foreign key (
    organization_id,
    branch_id
  ) references public.branches(organization_id, id) on delete restrict,
  constraint inventory_stock_organization_item_fk foreign key (
    organization_id,
    item_id
  ) references public.inventory_items(organization_id, id) on delete restrict
);

revoke all on table public.inventory_stock
from public, anon, authenticated, service_role;

alter table public.inventory_stock enable row level security;

comment on table public.inventory_stock is
  'Per-branch materialized stock balances maintained atomically with append-only movements; no browser policy exists.';

create index inventory_stock_organization_branch_item_idx
  on public.inventory_stock (organization_id, branch_id, item_id);

create index inventory_stock_organization_item_branch_idx
  on public.inventory_stock (organization_id, item_id, branch_id);

create trigger inventory_stock_set_updated_at
before update on public.inventory_stock
for each row execute function private.set_updated_at();

create table public.inventory_transfers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete restrict,
  source_branch_id uuid not null,
  destination_branch_id uuid not null,
  item_id uuid not null,
  quantity integer not null,
  status text not null default 'SENT',
  reason text,
  created_by uuid references auth.users(id) on delete set null,
  confirmed_by uuid references auth.users(id) on delete set null,
  confirmed_at timestamptz,
  version integer not null default 1,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint inventory_transfers_quantity_positive_check check (quantity > 0),
  constraint inventory_transfers_source_destination_distinct_check check (
    source_branch_id <> destination_branch_id
  ),
  constraint inventory_transfers_status_check check (
    status in ('SENT', 'PENDING_RECEIPT', 'RECEIVED', 'CANCELLED')
  ),
  constraint inventory_transfers_reason_bounded_check check (
    reason is null or (
      pg_catalog.btrim(reason) <> ''
      and pg_catalog.length(reason) <= 500
    )
  ),
  constraint inventory_transfers_confirmed_state_check check (
    (status = 'RECEIVED' and confirmed_by is not null and confirmed_at is not null)
    or (status <> 'RECEIVED' and confirmed_by is null and confirmed_at is null)
  ),
  constraint inventory_transfers_version_positive_check check (version > 0),
  constraint inventory_transfers_organization_id_id_key unique (organization_id, id),
  constraint inventory_transfers_organization_source_branch_fk foreign key (
    organization_id,
    source_branch_id
  ) references public.branches(organization_id, id) on delete restrict,
  constraint inventory_transfers_organization_destination_branch_fk foreign key (
    organization_id,
    destination_branch_id
  ) references public.branches(organization_id, id) on delete restrict,
  constraint inventory_transfers_organization_item_fk foreign key (
    organization_id,
    item_id
  ) references public.inventory_items(organization_id, id) on delete restrict
);

revoke all on table public.inventory_transfers
from public, anon, authenticated, service_role;

alter table public.inventory_transfers enable row level security;

comment on table public.inventory_transfers is
  'Tenant branch-to-branch transfer requests that only become received on destination confirmation; no browser policy exists.';

create index inventory_transfers_organization_source_status_idx
  on public.inventory_transfers (organization_id, source_branch_id, status);

create index inventory_transfers_organization_destination_status_idx
  on public.inventory_transfers (organization_id, destination_branch_id, status);

create trigger inventory_transfers_set_updated_at
before update on public.inventory_transfers
for each row execute function private.set_updated_at();

create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete restrict,
  branch_id uuid not null,
  item_id uuid not null,
  movement_type text not null,
  quantity_delta integer not null,
  reason text,
  transfer_id uuid,
  lot_number text,
  expiry_date date,
  recorded_by uuid references auth.users(id) on delete set null,
  recorded_at timestamptz not null default statement_timestamp(),
  constraint inventory_movements_type_check check (
    movement_type in ('RECEIPT', 'ADJUSTMENT', 'ISSUE', 'TRANSFER_OUT', 'TRANSFER_IN')
  ),
  constraint inventory_movements_quantity_delta_nonzero_check check (
    quantity_delta <> 0
  ),
  constraint inventory_movements_reason_bounded_check check (
    reason is null or (
      pg_catalog.btrim(reason) <> ''
      and pg_catalog.length(reason) <= 500
    )
  ),
  constraint inventory_movements_lot_number_bounded_check check (
    lot_number is null or (
      pg_catalog.btrim(lot_number) <> ''
      and pg_catalog.length(lot_number) <= 100
    )
  ),
  constraint inventory_movements_organization_branch_fk foreign key (
    organization_id,
    branch_id
  ) references public.branches(organization_id, id) on delete restrict,
  constraint inventory_movements_organization_item_fk foreign key (
    organization_id,
    item_id
  ) references public.inventory_items(organization_id, id) on delete restrict,
  constraint inventory_movements_organization_transfer_fk foreign key (
    organization_id,
    transfer_id
  ) references public.inventory_transfers(organization_id, id) on delete set null
);

revoke all on table public.inventory_movements
from public, anon, authenticated, service_role;

alter table public.inventory_movements enable row level security;

comment on table public.inventory_movements is
  'Append-only per-branch stock movement ledger; every balance change must post its matching row here in the same transaction.';

create index inventory_movements_organization_branch_recorded_idx
  on public.inventory_movements (organization_id, branch_id, recorded_at);

create index inventory_movements_organization_item_idx
  on public.inventory_movements (organization_id, item_id);

create or replace function private.protect_inventory_movements()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise check_violation using message = 'inventory movements are append-only';
end;
$$;

revoke all on function private.protect_inventory_movements()
from public, anon, authenticated, service_role;

comment on function private.protect_inventory_movements() is
  'Rejects UPDATE and DELETE against the immutable inventory movement ledger.';

create trigger inventory_movements_protect_append_only
before update or delete on public.inventory_movements
for each row execute function private.protect_inventory_movements();