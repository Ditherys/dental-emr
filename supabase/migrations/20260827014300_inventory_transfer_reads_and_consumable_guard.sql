-- P19-03 closes two application-boundary gaps without widening base-table
-- access: the inventory UI needs a bounded transfer projection, and stock rows
-- must remain limited to consumables so equipment stays in the resource model.

create function private.enforce_consumable_inventory_stock()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.inventory_items as item
    where item.organization_id = new.organization_id
      and item.id = new.item_id
      and item.category <> 'CONSUMABLE'
  ) then
    raise check_violation using message = 'stock is limited to consumable items';
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_consumable_inventory_stock()
from public, anon, authenticated, service_role;

create trigger inventory_stock_enforce_consumable
before insert or update on public.inventory_stock
for each row execute function private.enforce_consumable_inventory_stock();

create function private.prevent_stocked_item_equipment_conversion()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.category = 'CONSUMABLE'
     and new.category = 'EQUIPMENT'
     and (
       exists (
         select 1 from public.inventory_stock as stock
         where stock.organization_id = old.organization_id and stock.item_id = old.id
       )
       or exists (
         select 1 from public.inventory_movements as movement
         where movement.organization_id = old.organization_id and movement.item_id = old.id
       )
     ) then
    raise check_violation using message = 'an item with stock history must remain consumable';
  end if;
  return new;
end;
$$;

revoke all on function private.prevent_stocked_item_equipment_conversion()
from public, anon, authenticated, service_role;

create trigger inventory_items_prevent_stocked_equipment_conversion
before update of category on public.inventory_items
for each row execute function private.prevent_stocked_item_equipment_conversion();

create function public.list_inventory_transfers(
  p_acting_branch_id uuid,
  p_status text default null
)
returns table(
  transfer_id uuid,
  item_id uuid,
  item_code text,
  item_name text,
  source_branch_id uuid,
  destination_branch_id uuid,
  quantity integer,
  status text,
  reason text,
  confirmed_at timestamptz,
  version integer,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch
  where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or (select auth.uid()) is null
     or not private.has_inventory_permission_at_branch(
       p_acting_branch_id, 'inventory.view'
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_status is not null
     and p_status not in ('SENT', 'PENDING_RECEIPT', 'RECEIVED', 'CANCELLED') then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  return query
  select
    transfer.id,
    transfer.item_id,
    item.code,
    item.name,
    transfer.source_branch_id,
    transfer.destination_branch_id,
    transfer.quantity,
    transfer.status,
    transfer.reason,
    transfer.confirmed_at,
    transfer.version,
    transfer.created_at
  from public.inventory_transfers as transfer
  join public.inventory_items as item
    on item.organization_id = transfer.organization_id
   and item.id = transfer.item_id
  where transfer.organization_id = v_organization_id
    and (
      transfer.source_branch_id = p_acting_branch_id
      or transfer.destination_branch_id = p_acting_branch_id
    )
    and (p_status is null or transfer.status = p_status)
  order by transfer.created_at desc, transfer.id
  limit 200;
end;
$$;

revoke all on function public.list_inventory_transfers(uuid, text)
from public, anon, authenticated, service_role;

comment on function public.list_inventory_transfers(uuid, text) is
  'Bounded inventory.view projection of transfers where the acting branch is source or destination; exposes no unrelated branch transfers and writes no audit event.';
