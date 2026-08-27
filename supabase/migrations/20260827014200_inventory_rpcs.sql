-- P19-02: inventory RPC boundaries. The audit metadata allow-list is extended
-- additively (mirroring the P6-06, P11-04, P13-03, P14-03, and P16-03
-- extensions) with the bounded quantity/quantity_delta/source/destination keys
-- because inventory audit events carry {quantity}, {quantity_delta}, and
-- {source, destination, quantity}; the audit_events_metadata_safe_check CHECK
-- constraint rejects unknown keys. Every existing Phase 1/6/11/13/14/16 key is
-- preserved verbatim.
--
-- All functions are SECURITY DEFINER with an empty search_path, derive the
-- tenant from an active acting branch, and gate mutations on inventory.manage
-- and reads on inventory.view through the private branch helper. Stock balance
-- changes take a per (organization, branch, item) advisory lock and are only
-- ever made in the same transaction that appends the matching ledger-style
-- movement row; negative stock is rejected in-transaction on top of the
-- quantity >= 0 CHECK. Transfers record the TRANSFER_OUT at the source and stay
-- SENT until the destination confirms receipt, at which point (and only then)
-- the destination balance increases and the TRANSFER_IN movement is posted.
-- This object migration grants nothing; the 20260827014201 terminal owns the
-- only browser-reachable grants.

create or replace function private.audit_metadata_is_safe(
  candidate jsonb
)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when candidate is null
      or pg_catalog.jsonb_typeof(candidate) <> 'object'
      or pg_catalog.pg_column_size(candidate) > 1024
      then false
    when candidate - array[
      'invitation_id',
      'permission_code',
      'role_code',
      'scope',
      'reason',
      'old_starts_at',
      'new_starts_at',
      'old_ends_at',
      'new_ends_at',
      'dimension',
      'old_value',
      'new_value',
      'document_type',
      'include_set',
      'action',
      'parent_note_id',
      'record_type',
      'quantity',
      'quantity_delta',
      'source',
      'destination'
    ]::text[] <> '{}'::jsonb
      then false
    when candidate ? 'invitation_id' and not (
      pg_catalog.jsonb_typeof(candidate -> 'invitation_id') = 'string'
      and candidate ->> 'invitation_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    ) then false
    when candidate ? 'permission_code' and not (
      pg_catalog.jsonb_typeof(candidate -> 'permission_code') = 'string'
      and candidate ->> 'permission_code' ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'
      and pg_catalog.length(candidate ->> 'permission_code') <= 128
    ) then false
    when candidate ? 'role_code' and not (
      pg_catalog.jsonb_typeof(candidate -> 'role_code') = 'string'
      and candidate ->> 'role_code' ~ '^[A-Z][A-Z0-9_]*$'
      and pg_catalog.length(candidate ->> 'role_code') <= 128
    ) then false
    when candidate ? 'scope' and not (
      pg_catalog.jsonb_typeof(candidate -> 'scope') = 'string'
      and candidate ->> 'scope' in ('ORGANIZATION', 'BRANCH')
    ) then false
    when candidate ? 'reason' and not (
      pg_catalog.jsonb_typeof(candidate -> 'reason') = 'string'
      and pg_catalog.length(candidate ->> 'reason') between 1 and 500
    ) then false
    when candidate ? 'dimension' and not (
      pg_catalog.jsonb_typeof(candidate -> 'dimension') = 'string'
      and candidate ->> 'dimension' in ('scheduling_status', 'confirmation_status', 'encounter_status')
    ) then false
    when candidate ? 'old_value' and not (
      pg_catalog.jsonb_typeof(candidate -> 'old_value') = 'string'
      and pg_catalog.length(candidate ->> 'old_value') between 1 and 128
    ) then false
    when candidate ? 'new_value' and not (
      pg_catalog.jsonb_typeof(candidate -> 'new_value') = 'string'
      and pg_catalog.length(candidate ->> 'new_value') between 1 and 128
    ) then false
    when candidate ? 'old_starts_at' and not (
      pg_catalog.jsonb_typeof(candidate -> 'old_starts_at') = 'string'
      and candidate ->> 'old_starts_at' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}[T ][0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?(Z|[+-][0-9]{2}(:[0-9]{2})?)?$'
    ) then false
    when candidate ? 'new_starts_at' and not (
      pg_catalog.jsonb_typeof(candidate -> 'new_starts_at') = 'string'
      and candidate ->> 'new_starts_at' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}[T ][0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?(Z|[+-][0-9]{2}(:[0-9]{2})?)?$'
    ) then false
    when candidate ? 'old_ends_at' and not (
      pg_catalog.jsonb_typeof(candidate -> 'old_ends_at') = 'string'
      and candidate ->> 'old_ends_at' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}[T ][0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?(Z|[+-][0-9]{2}(:[0-9]{2})?)?$'
    ) then false
    when candidate ? 'new_ends_at' and not (
      pg_catalog.jsonb_typeof(candidate -> 'new_ends_at') = 'string'
      and candidate ->> 'new_ends_at' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}[T ][0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?(Z|[+-][0-9]{2}(:[0-9]{2})?)?$'
    ) then false
    when candidate ? 'document_type' and not (
      pg_catalog.jsonb_typeof(candidate -> 'document_type') = 'string'
      and candidate ->> 'document_type' in ('PATIENT_RECORD_SUMMARY', 'APPOINTMENT_SLIP', 'REFERRAL_LETTER', 'TREATMENT_PLAN')
    ) then false
    when candidate ? 'include_set' and not (
      pg_catalog.jsonb_typeof(candidate -> 'include_set') = 'object'
      and pg_catalog.pg_column_size(candidate -> 'include_set') <= 2048
    ) then false
    when candidate ? 'action' and not (
      pg_catalog.jsonb_typeof(candidate -> 'action') = 'string'
      and candidate ->> 'action' ~ '^[A-Z][A-Z0-9_]*$'
      and pg_catalog.length(candidate ->> 'action') <= 32
    ) then false
    when candidate ? 'parent_note_id' and not (
      pg_catalog.jsonb_typeof(candidate -> 'parent_note_id') = 'string'
      and candidate ->> 'parent_note_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    ) then false
    when candidate ? 'record_type' and not (
      pg_catalog.jsonb_typeof(candidate -> 'record_type') = 'string'
      and candidate ->> 'record_type' in ('CONDITION', 'ALLERGY', 'MEDICATION')
    ) then false
    when candidate ? 'quantity' and not (
      pg_catalog.jsonb_typeof(candidate -> 'quantity') = 'number'
      and (candidate -> 'quantity')::text ~ '^-?[0-9]+$'
    ) then false
    when candidate ? 'quantity_delta' and not (
      pg_catalog.jsonb_typeof(candidate -> 'quantity_delta') = 'number'
      and (candidate -> 'quantity_delta')::text ~ '^-?[0-9]+$'
    ) then false
    when candidate ? 'source' and not (
      pg_catalog.jsonb_typeof(candidate -> 'source') = 'string'
      and candidate ->> 'source' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    ) then false
    when candidate ? 'destination' and not (
      pg_catalog.jsonb_typeof(candidate -> 'destination') = 'string'
      and candidate ->> 'destination' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    ) then false
    else true
  end
$$;

revoke all on function private.audit_metadata_is_safe(jsonb)
from public, anon, authenticated, service_role;

comment on function private.audit_metadata_is_safe(jsonb) is
  'Accepts the bounded non-sensitive metadata keys used by audit writers, including the Phase 6 scheduling keys, the Phase 11 document keys, the Phase 13 booking review action key, the Phase 14 clinical keys, the Phase 16 TREATMENT_PLAN document key, and the Phase 19 inventory quantity/quantity_delta/source/destination keys.';

create or replace function private.has_inventory_permission_at_branch(
  p_acting_branch_id uuid,
  p_permission_code text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_permission_code in ('inventory.view', 'inventory.manage') and exists (
    select 1
    from public.branches as branch
    join public.organizations as organization
      on organization.id = branch.organization_id
     and organization.status = 'active'
    join public.organization_members as organization_member
      on organization_member.organization_id = organization.id
     and organization_member.user_id = (select auth.uid())
     and organization_member.membership_status = 'active'
    join public.member_roles as member_role
      on member_role.organization_id = organization_member.organization_id
     and member_role.organization_member_id = organization_member.id
    join public.roles as role
      on role.id = member_role.role_id
     and (role.organization_id is null or role.organization_id = organization.id)
    join public.role_permissions as role_permission
      on role_permission.role_id = role.id
    join public.permissions as permission
      on permission.id = role_permission.permission_id
     and permission.code = p_permission_code
    where branch.id = p_acting_branch_id
      and branch.status = 'active'
      and (
        member_role.branch_id is null
        or (
          member_role.branch_id = branch.id
          and exists (
            select 1
            from public.branch_memberships as branch_membership
            where branch_membership.organization_id = organization.id
              and branch_membership.organization_member_id = organization_member.id
              and branch_membership.branch_id = branch.id
              and branch_membership.access_status = 'active'
          )
        )
      )
  );
$$;

revoke all on function private.has_inventory_permission_at_branch(uuid, text)
from public, anon, authenticated, service_role;

comment on function private.has_inventory_permission_at_branch(uuid, text) is
  'Current-user inventory permission check scoped to an active acting branch with org-wide or exact-branch role coverage.';

create function public.create_inventory_item(
  p_acting_branch_id uuid,
  p_code text,
  p_name text,
  p_category text,
  p_unit text,
  p_reorder_level integer default 0,
  p_lot_tracking boolean default false
)
returns table(item_id uuid, version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor_user_id uuid := (select auth.uid());
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch
  where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or v_actor_user_id is null
     or not private.has_inventory_permission_at_branch(
       p_acting_branch_id, 'inventory.manage'
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_code is null
     or p_code <> pg_catalog.upper(p_code)
     or not (p_code ~ '^[A-Z][A-Z0-9_]*$')
     or pg_catalog.length(p_code) > 80
     or p_name is null or pg_catalog.btrim(p_name) = ''
     or pg_catalog.length(p_name) > 160
     or p_category is null or p_category not in ('CONSUMABLE', 'EQUIPMENT')
     or p_unit is null or pg_catalog.btrim(p_unit) = ''
     or pg_catalog.length(p_unit) > 40
     or p_reorder_level is null or p_reorder_level < 0 then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  insert into public.inventory_items (
    organization_id, code, name, category, unit, reorder_level, lot_tracking
  ) values (
    v_organization_id, p_code, pg_catalog.btrim(p_name), p_category,
    pg_catalog.btrim(p_unit), p_reorder_level, p_lot_tracking
  ) returning id, public.inventory_items.version into item_id, version;

  insert into public.audit_events (
    organization_id, branch_id, actor_user_id, actor_type, category, action,
    entity_type, entity_id, result, metadata
  ) values (
    v_organization_id, p_acting_branch_id, v_actor_user_id, 'USER', 'INVENTORY',
    'inventory.item.created', 'inventory_item', item_id, 'SUCCESS', '{}'::jsonb
  );

  return next;
end;
$$;

revoke all on function public.create_inventory_item(uuid, text, text, text, text, integer, boolean)
from public, anon, authenticated, service_role;

comment on function public.create_inventory_item(uuid, text, text, text, text, integer, boolean) is
  'Creates a same-tenant inventory catalog item under inventory.manage and audits it atomically.';

create function public.update_inventory_item(
  p_acting_branch_id uuid,
  p_item_id uuid,
  p_expected_version integer,
  p_name text,
  p_category text,
  p_unit text,
  p_reorder_level integer,
  p_lot_tracking boolean,
  p_is_active boolean
)
returns table(item_id uuid, version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor_user_id uuid := (select auth.uid());
  v_item public.inventory_items%rowtype;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch
  where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or v_actor_user_id is null
     or not private.has_inventory_permission_at_branch(
       p_acting_branch_id, 'inventory.manage'
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_item_id is null or p_expected_version is null or p_expected_version < 1
     or p_name is null or pg_catalog.btrim(p_name) = ''
     or pg_catalog.length(p_name) > 160
     or p_category is null or p_category not in ('CONSUMABLE', 'EQUIPMENT')
     or p_unit is null or pg_catalog.btrim(p_unit) = ''
     or pg_catalog.length(p_unit) > 40
     or p_reorder_level is null or p_reorder_level < 0
     or p_lot_tracking is null or p_is_active is null then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  select item.* into v_item
  from public.inventory_items as item
  where item.id = p_item_id and item.organization_id = v_organization_id
  for update;

  if not found then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if v_item.version <> p_expected_version then
    raise exception using errcode = 'P0001', message = 'stale version';
  end if;

  update public.inventory_items
  set name = pg_catalog.btrim(p_name),
      category = p_category,
      unit = pg_catalog.btrim(p_unit),
      reorder_level = p_reorder_level,
      lot_tracking = p_lot_tracking,
      is_active = p_is_active,
      version = v_item.version + 1
  where id = p_item_id and organization_id = v_organization_id
  returning id, public.inventory_items.version into item_id, version;

  insert into public.audit_events (
    organization_id, branch_id, actor_user_id, actor_type, category, action,
    entity_type, entity_id, result, metadata
  ) values (
    v_organization_id, p_acting_branch_id, v_actor_user_id, 'USER', 'INVENTORY',
    'inventory.item.updated', 'inventory_item', p_item_id, 'SUCCESS', '{}'::jsonb
  );

  return next;
end;
$$;

revoke all on function public.update_inventory_item(uuid, uuid, integer, text, text, text, integer, boolean, boolean)
from public, anon, authenticated, service_role;

comment on function public.update_inventory_item(uuid, uuid, integer, text, text, text, integer, boolean, boolean) is
  'Edits a same-tenant inventory catalog item under inventory.manage with an optimistic version and audits it atomically.';

create function public.list_inventory_items(
  p_acting_branch_id uuid,
  p_include_inactive boolean default false
)
returns table(
  item_id uuid,
  code text,
  name text,
  category text,
  unit text,
  reorder_level integer,
  lot_tracking boolean,
  is_active boolean,
  version integer
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

  return query
  select
    item.id,
    item.code,
    item.name,
    item.category,
    item.unit,
    item.reorder_level,
    item.lot_tracking,
    item.is_active,
    item.version
  from public.inventory_items as item
  where item.organization_id = v_organization_id
    and (p_include_inactive or item.is_active)
  order by item.code, item.id
  limit 200;
end;
$$;

revoke all on function public.list_inventory_items(uuid, boolean)
from public, anon, authenticated, service_role;

comment on function public.list_inventory_items(uuid, boolean) is
  'Bounded same-organization item catalog projection under inventory.view; no audit event.';

create function public.receive_stock(
  p_acting_branch_id uuid,
  p_item_id uuid,
  p_quantity integer,
  p_lot_number text default null,
  p_expiry_date date default null
)
returns table(item_id uuid, branch_id uuid, quantity_on_hand integer, version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor_user_id uuid := (select auth.uid());
  v_item public.inventory_items%rowtype;
  v_stock_id uuid;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch
  where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or v_actor_user_id is null
     or not private.has_inventory_permission_at_branch(
       p_acting_branch_id, 'inventory.manage'
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_item_id is null or p_quantity is null or p_quantity <= 0 then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  if p_lot_number is not null
     and (pg_catalog.btrim(p_lot_number) = '' or pg_catalog.length(p_lot_number) > 100) then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  select item.* into v_item
  from public.inventory_items as item
  where item.id = p_item_id and item.organization_id = v_organization_id
  for key share;

  if not found or not v_item.is_active then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_organization_id::text || ':' || p_acting_branch_id::text || ':' || p_item_id::text,
      0
    )
  );

  insert into public.inventory_stock (organization_id, branch_id, item_id, quantity_on_hand)
  values (v_organization_id, p_acting_branch_id, p_item_id, p_quantity)
  on conflict on constraint inventory_stock_organization_branch_item_key
  do update set
    quantity_on_hand = public.inventory_stock.quantity_on_hand + excluded.quantity_on_hand,
    version = public.inventory_stock.version + 1
  returning id, public.inventory_stock.quantity_on_hand, public.inventory_stock.version
    into v_stock_id, quantity_on_hand, version;

  insert into public.inventory_movements (
    organization_id, branch_id, item_id, movement_type, quantity_delta,
    lot_number, expiry_date, recorded_by
  ) values (
    v_organization_id, p_acting_branch_id, p_item_id, 'RECEIPT', p_quantity,
    p_lot_number, p_expiry_date, v_actor_user_id
  );

  insert into public.audit_events (
    organization_id, branch_id, actor_user_id, actor_type, category, action,
    entity_type, entity_id, result, metadata
  ) values (
    v_organization_id, p_acting_branch_id, v_actor_user_id, 'USER', 'INVENTORY',
    'inventory.stock.received', 'inventory_stock', v_stock_id, 'SUCCESS',
    pg_catalog.jsonb_build_object('quantity', p_quantity)
  );

  branch_id := p_acting_branch_id;
  item_id := p_item_id;
  return next;
end;
$$;

revoke all on function public.receive_stock(uuid, uuid, integer, text, date)
from public, anon, authenticated, service_role;

comment on function public.receive_stock(uuid, uuid, integer, text, date) is
  'Adds stock at the acting branch under inventory.manage, appends the RECEIPT ledger row, and audits {quantity} atomically under a per-org-branch-item advisory lock.';

create function public.adjust_stock(
  p_acting_branch_id uuid,
  p_item_id uuid,
  p_expected_version integer,
  p_quantity_delta integer,
  p_reason text
)
returns table(item_id uuid, branch_id uuid, quantity_on_hand integer, version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor_user_id uuid := (select auth.uid());
  v_stock public.inventory_stock%rowtype;
  v_stock_id uuid;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch
  where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or v_actor_user_id is null
     or not private.has_inventory_permission_at_branch(
       p_acting_branch_id, 'inventory.manage'
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_item_id is null or p_expected_version is null or p_expected_version < 1
     or p_quantity_delta is null or p_quantity_delta = 0
     or p_reason is null or pg_catalog.btrim(p_reason) = ''
     or pg_catalog.length(p_reason) > 500 then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  if not exists (
    select 1
    from public.inventory_items as item
    where item.id = p_item_id and item.organization_id = v_organization_id and item.is_active
  ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_organization_id::text || ':' || p_acting_branch_id::text || ':' || p_item_id::text,
      0
    )
  );

  select stock.* into v_stock
  from public.inventory_stock as stock
  where stock.organization_id = v_organization_id
    and stock.branch_id = p_acting_branch_id
    and stock.item_id = p_item_id
  for update;

  if not found then
    if p_quantity_delta < 0 then
      raise exception using errcode = 'P0001', message = 'insufficient stock';
    end if;
    if p_expected_version <> 1 then
      raise exception using errcode = 'P0001', message = 'stale version';
    end if;
    insert into public.inventory_stock (organization_id, branch_id, item_id, quantity_on_hand)
    values (v_organization_id, p_acting_branch_id, p_item_id, p_quantity_delta)
    returning id, public.inventory_stock.quantity_on_hand, public.inventory_stock.version
      into v_stock_id, quantity_on_hand, version;
  else
    if v_stock.version <> p_expected_version then
      raise exception using errcode = 'P0001', message = 'stale version';
    end if;
    if v_stock.quantity_on_hand + p_quantity_delta < 0 then
      raise exception using errcode = 'P0001', message = 'insufficient stock';
    end if;
    update public.inventory_stock
    set quantity_on_hand = v_stock.quantity_on_hand + p_quantity_delta,
        version = v_stock.version + 1
    where id = v_stock.id
    returning id, public.inventory_stock.quantity_on_hand, public.inventory_stock.version
      into v_stock_id, quantity_on_hand, version;
  end if;

  insert into public.inventory_movements (
    organization_id, branch_id, item_id, movement_type, quantity_delta, reason, recorded_by
  ) values (
    v_organization_id, p_acting_branch_id, p_item_id, 'ADJUSTMENT',
    p_quantity_delta, pg_catalog.btrim(p_reason), v_actor_user_id
  );

  insert into public.audit_events (
    organization_id, branch_id, actor_user_id, actor_type, category, action,
    entity_type, entity_id, result, metadata
  ) values (
    v_organization_id, p_acting_branch_id, v_actor_user_id, 'USER', 'INVENTORY',
    'inventory.stock.adjusted', 'inventory_stock', v_stock_id, 'SUCCESS',
    pg_catalog.jsonb_build_object('quantity_delta', p_quantity_delta)
  );

  branch_id := p_acting_branch_id;
  item_id := p_item_id;
  return next;
end;
$$;

revoke all on function public.adjust_stock(uuid, uuid, integer, integer, text)
from public, anon, authenticated, service_role;

comment on function public.adjust_stock(uuid, uuid, integer, integer, text) is
  'Applies a reasoned inventory adjustment at the acting branch under inventory.manage with an optimistic version, refusing a resulting negative balance, and audits {quantity_delta} atomically.';

create function public.issue_stock(
  p_acting_branch_id uuid,
  p_item_id uuid,
  p_expected_version integer,
  p_quantity integer,
  p_reason text
)
returns table(item_id uuid, branch_id uuid, quantity_on_hand integer, version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor_user_id uuid := (select auth.uid());
  v_stock public.inventory_stock%rowtype;
  v_stock_id uuid;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch
  where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or v_actor_user_id is null
     or not private.has_inventory_permission_at_branch(
       p_acting_branch_id, 'inventory.manage'
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_item_id is null or p_expected_version is null or p_expected_version < 1
     or p_quantity is null or p_quantity <= 0
     or p_reason is null or pg_catalog.btrim(p_reason) = ''
     or pg_catalog.length(p_reason) > 500 then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  if not exists (
    select 1
    from public.inventory_items as item
    where item.id = p_item_id and item.organization_id = v_organization_id and item.is_active
  ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_organization_id::text || ':' || p_acting_branch_id::text || ':' || p_item_id::text,
      0
    )
  );

  select stock.* into v_stock
  from public.inventory_stock as stock
  where stock.organization_id = v_organization_id
    and stock.branch_id = p_acting_branch_id
    and stock.item_id = p_item_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'insufficient stock';
  end if;

  if v_stock.version <> p_expected_version then
    raise exception using errcode = 'P0001', message = 'stale version';
  end if;

  if v_stock.quantity_on_hand < p_quantity then
    raise exception using errcode = 'P0001', message = 'insufficient stock';
  end if;

  update public.inventory_stock
  set quantity_on_hand = v_stock.quantity_on_hand - p_quantity,
      version = v_stock.version + 1
  where id = v_stock.id
  returning id, public.inventory_stock.quantity_on_hand, public.inventory_stock.version
    into v_stock_id, quantity_on_hand, version;

  insert into public.inventory_movements (
    organization_id, branch_id, item_id, movement_type, quantity_delta, reason, recorded_by
  ) values (
    v_organization_id, p_acting_branch_id, p_item_id, 'ISSUE',
    -p_quantity, pg_catalog.btrim(p_reason), v_actor_user_id
  );

  insert into public.audit_events (
    organization_id, branch_id, actor_user_id, actor_type, category, action,
    entity_type, entity_id, result, metadata
  ) values (
    v_organization_id, p_acting_branch_id, v_actor_user_id, 'USER', 'INVENTORY',
    'inventory.stock.issued', 'inventory_stock', v_stock_id, 'SUCCESS',
    pg_catalog.jsonb_build_object('quantity', p_quantity)
  );

  branch_id := p_acting_branch_id;
  item_id := p_item_id;
  return next;
end;
$$;

revoke all on function public.issue_stock(uuid, uuid, integer, integer, text)
from public, anon, authenticated, service_role;

comment on function public.issue_stock(uuid, uuid, integer, integer, text) is
  'Issues stock out of the acting branch under inventory.manage with an optimistic version, refusing a balance shortfall, and audits {quantity} atomically.';

create function public.create_inventory_transfer(
  p_acting_branch_id uuid,
  p_source_branch_id uuid,
  p_destination_branch_id uuid,
  p_item_id uuid,
  p_quantity integer,
  p_reason text
)
returns table(transfer_id uuid, version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor_user_id uuid := (select auth.uid());
  v_stock public.inventory_stock%rowtype;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch
  where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or v_actor_user_id is null
     or not private.has_inventory_permission_at_branch(
       p_acting_branch_id, 'inventory.manage'
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_source_branch_id is null or p_destination_branch_id is null
     or p_item_id is null or p_quantity is null or p_quantity <= 0
     or p_source_branch_id = p_destination_branch_id then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  if p_reason is not null
     and (pg_catalog.btrim(p_reason) = '' or pg_catalog.length(p_reason) > 500) then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  if not exists (
    select 1
    from public.branches as branch
    where branch.id = p_source_branch_id and branch.organization_id = v_organization_id
  ) or not exists (
    select 1
    from public.branches as branch
    where branch.id = p_destination_branch_id and branch.organization_id = v_organization_id
  ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if not exists (
    select 1
    from public.inventory_items as item
    where item.id = p_item_id and item.organization_id = v_organization_id and item.is_active
  ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_organization_id::text || ':' || p_source_branch_id::text || ':' || p_item_id::text,
      0
    )
  );

  select stock.* into v_stock
  from public.inventory_stock as stock
  where stock.organization_id = v_organization_id
    and stock.branch_id = p_source_branch_id
    and stock.item_id = p_item_id
  for update;

  if not found or v_stock.quantity_on_hand < p_quantity then
    raise exception using errcode = 'P0001', message = 'insufficient stock';
  end if;

  insert into public.inventory_transfers (
    organization_id, source_branch_id, destination_branch_id, item_id, quantity, reason, created_by
  ) values (
    v_organization_id, p_source_branch_id, p_destination_branch_id, p_item_id,
    p_quantity, p_reason, v_actor_user_id
  ) returning id, public.inventory_transfers.version into transfer_id, version;

  update public.inventory_stock
  set quantity_on_hand = v_stock.quantity_on_hand - p_quantity,
      version = v_stock.version + 1
  where id = v_stock.id;

  insert into public.inventory_movements (
    organization_id, branch_id, item_id, movement_type, quantity_delta, reason, transfer_id, recorded_by
  ) values (
    v_organization_id, p_source_branch_id, p_item_id, 'TRANSFER_OUT',
    -p_quantity, p_reason, transfer_id, v_actor_user_id
  );

  insert into public.audit_events (
    organization_id, branch_id, actor_user_id, actor_type, category, action,
    entity_type, entity_id, result, metadata
  ) values (
    v_organization_id, p_acting_branch_id, v_actor_user_id, 'USER', 'INVENTORY',
    'inventory.transfer.created', 'inventory_transfer', transfer_id, 'SUCCESS',
    pg_catalog.jsonb_build_object(
      'source', p_source_branch_id::text,
      'destination', p_destination_branch_id::text,
      'quantity', p_quantity
    )
  );

  return next;
end;
$$;

revoke all on function public.create_inventory_transfer(uuid, uuid, uuid, uuid, integer, text)
from public, anon, authenticated, service_role;

comment on function public.create_inventory_transfer(uuid, uuid, uuid, uuid, integer, text) is
  'Reduces the source branch balance, appends the TRANSFER_OUT ledger row, and creates a SENT transfer under inventory.manage, auditing {source, destination, quantity} atomically; the destination balance is untouched until confirmation.';

create function public.confirm_transfer_receipt(
  p_acting_branch_id uuid,
  p_transfer_id uuid,
  p_expected_version integer
)
returns table(transfer_id uuid, status text, version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor_user_id uuid := (select auth.uid());
  v_transfer public.inventory_transfers%rowtype;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch
  where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or v_actor_user_id is null
     or not private.has_inventory_permission_at_branch(
       p_acting_branch_id, 'inventory.manage'
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_transfer_id is null or p_expected_version is null or p_expected_version < 1 then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  select transfer.* into v_transfer
  from public.inventory_transfers as transfer
  where transfer.id = p_transfer_id and transfer.organization_id = v_organization_id
  for update;

  if not found then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  -- Only the destination branch may confirm receipt; until it does, the
  -- destination balance must stay unchanged and the transfer must remain SENT.
  if v_transfer.destination_branch_id <> p_acting_branch_id then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if v_transfer.status <> 'SENT' then
    raise exception using errcode = 'P0001', message = 'invalid state';
  end if;

  if v_transfer.version <> p_expected_version then
    raise exception using errcode = 'P0001', message = 'stale version';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_organization_id::text || ':' || v_transfer.destination_branch_id::text || ':' || v_transfer.item_id::text,
      0
    )
  );

  insert into public.inventory_stock (organization_id, branch_id, item_id, quantity_on_hand)
  values (v_organization_id, v_transfer.destination_branch_id, v_transfer.item_id, v_transfer.quantity)
  on conflict on constraint inventory_stock_organization_branch_item_key
  do update set
    quantity_on_hand = public.inventory_stock.quantity_on_hand + excluded.quantity_on_hand,
    version = public.inventory_stock.version + 1;

  insert into public.inventory_movements (
    organization_id, branch_id, item_id, movement_type, quantity_delta, transfer_id, recorded_by
  ) values (
    v_organization_id, v_transfer.destination_branch_id, v_transfer.item_id,
    'TRANSFER_IN', v_transfer.quantity, v_transfer.id, v_actor_user_id
  );

  update public.inventory_transfers
  set status = 'RECEIVED',
      confirmed_by = v_actor_user_id,
      confirmed_at = pg_catalog.statement_timestamp(),
      version = v_transfer.version + 1
  where id = v_transfer.id
  returning id, public.inventory_transfers.status, public.inventory_transfers.version
    into transfer_id, status, version;

  insert into public.audit_events (
    organization_id, branch_id, actor_user_id, actor_type, category, action,
    entity_type, entity_id, result, metadata
  ) values (
    v_organization_id, p_acting_branch_id, v_actor_user_id, 'USER', 'INVENTORY',
    'inventory.transfer.received', 'inventory_transfer', v_transfer.id,
    'SUCCESS', '{}'::jsonb
  );

  return next;
end;
$$;

revoke all on function public.confirm_transfer_receipt(uuid, uuid, integer)
from public, anon, authenticated, service_role;

comment on function public.confirm_transfer_receipt(uuid, uuid, integer) is
  'Destination-branch confirmation that posts the TRANSFER_IN ledger row, increases the destination balance, and moves a SENT transfer to RECEIVED under inventory.manage with an optimistic version and atomic audit.';

create function public.cancel_inventory_transfer(
  p_acting_branch_id uuid,
  p_transfer_id uuid,
  p_expected_version integer,
  p_reason text
)
returns table(transfer_id uuid, status text, version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor_user_id uuid := (select auth.uid());
  v_transfer public.inventory_transfers%rowtype;
  v_stock public.inventory_stock%rowtype;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch
  where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or v_actor_user_id is null
     or not private.has_inventory_permission_at_branch(
       p_acting_branch_id, 'inventory.manage'
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_transfer_id is null or p_expected_version is null or p_expected_version < 1
     or p_reason is null or pg_catalog.btrim(p_reason) = ''
     or pg_catalog.length(p_reason) > 500 then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  select transfer.* into v_transfer
  from public.inventory_transfers as transfer
  where transfer.id = p_transfer_id and transfer.organization_id = v_organization_id
  for update;

  if not found then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if v_transfer.status <> 'SENT' then
    raise exception using errcode = 'P0001', message = 'invalid state';
  end if;

  if v_transfer.version <> p_expected_version then
    raise exception using errcode = 'P0001', message = 'stale version';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_organization_id::text || ':' || v_transfer.source_branch_id::text || ':' || v_transfer.item_id::text,
      0
    )
  );

  select stock.* into v_stock
  from public.inventory_stock as stock
  where stock.organization_id = v_organization_id
    and stock.branch_id = v_transfer.source_branch_id
    and stock.item_id = v_transfer.item_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'inconsistent stock state';
  end if;

  update public.inventory_stock
  set quantity_on_hand = v_stock.quantity_on_hand + v_transfer.quantity,
      version = v_stock.version + 1
  where id = v_stock.id;

  insert into public.inventory_movements (
    organization_id, branch_id, item_id, movement_type, quantity_delta, reason, transfer_id, recorded_by
  ) values (
    v_organization_id, v_transfer.source_branch_id, v_transfer.item_id,
    'ADJUSTMENT', v_transfer.quantity, pg_catalog.btrim(p_reason), v_transfer.id, v_actor_user_id
  );

  update public.inventory_transfers
  set status = 'CANCELLED', version = v_transfer.version + 1
  where id = v_transfer.id
  returning id, public.inventory_transfers.status, public.inventory_transfers.version
    into transfer_id, status, version;

  insert into public.audit_events (
    organization_id, branch_id, actor_user_id, actor_type, category, action,
    entity_type, entity_id, result, metadata
  ) values (
    v_organization_id, p_acting_branch_id, v_actor_user_id, 'USER', 'INVENTORY',
    'inventory.transfer.cancelled', 'inventory_transfer', v_transfer.id, 'SUCCESS',
    pg_catalog.jsonb_build_object('reason', pg_catalog.btrim(p_reason))
  );

  return next;
end;
$$;

revoke all on function public.cancel_inventory_transfer(uuid, uuid, integer, text)
from public, anon, authenticated, service_role;

comment on function public.cancel_inventory_transfer(uuid, uuid, integer, text) is
  'Reverses the source TRANSFER_OUT back onto the source balance and moves a SENT transfer to CANCELLED under inventory.manage with an optimistic version and atomic {reason} audit.';

create function public.list_inventory_stock(
  p_acting_branch_id uuid,
  p_item_id uuid default null,
  p_low_only boolean default false
)
returns table(
  item_id uuid,
  item_code text,
  item_name text,
  branch_id uuid,
  quantity_on_hand integer,
  reorder_level_override integer,
  reorder_level integer,
  low_stock boolean,
  version integer
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

  return query
  select
    item.id,
    item.code,
    item.name,
    stock.branch_id,
    stock.quantity_on_hand,
    stock.reorder_level_override,
    item.reorder_level,
    stock.quantity_on_hand < coalesce(stock.reorder_level_override, item.reorder_level),
    stock.version
  from public.inventory_items as item
  join public.inventory_stock as stock
    on stock.organization_id = item.organization_id
   and stock.item_id = item.id
  where item.organization_id = v_organization_id
    and item.is_active
    and stock.branch_id = p_acting_branch_id
    and (p_item_id is null or item.id = p_item_id)
    and (
      not p_low_only
      or stock.quantity_on_hand < coalesce(stock.reorder_level_override, item.reorder_level)
    )
  order by item.code, item.id
  limit 200;
end;
$$;

revoke all on function public.list_inventory_stock(uuid, uuid, boolean)
from public, anon, authenticated, service_role;

comment on function public.list_inventory_stock(uuid, uuid, boolean) is
  'Bounded per-branch stock projection under inventory.view with branch-specific low_stock derived from the branch override or the catalog reorder level; no audit event.';

create function public.list_inventory_movements(
  p_acting_branch_id uuid,
  p_item_id uuid default null
)
returns table(
  movement_id uuid,
  item_id uuid,
  item_code text,
  movement_type text,
  quantity_delta integer,
  reason text,
  transfer_id uuid,
  lot_number text,
  expiry_date date,
  recorded_by uuid,
  recorded_at timestamptz
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

  return query
  select
    movement.id,
    movement.item_id,
    item.code,
    movement.movement_type,
    movement.quantity_delta,
    movement.reason,
    movement.transfer_id,
    movement.lot_number,
    movement.expiry_date,
    movement.recorded_by,
    movement.recorded_at
  from public.inventory_movements as movement
  join public.inventory_items as item
    on item.organization_id = movement.organization_id
   and item.id = movement.item_id
  where movement.organization_id = v_organization_id
    and movement.branch_id = p_acting_branch_id
    and (p_item_id is null or movement.item_id = p_item_id)
  order by movement.recorded_at desc, movement.id
  limit 200;
end;
$$;

revoke all on function public.list_inventory_movements(uuid, uuid)
from public, anon, authenticated, service_role;

comment on function public.list_inventory_movements(uuid, uuid) is
  'Bounded per-branch movement ledger projection under inventory.view ordered newest first; no audit event.';

create function public.get_inventory_aggregate(
  p_acting_branch_id uuid
)
returns table(
  item_id uuid,
  item_code text,
  item_name text,
  total_on_hand bigint,
  branches jsonb
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

  return query
  select
    item.id,
    item.code,
    item.name,
    coalesce(pg_catalog.sum(stock.quantity_on_hand), 0)::bigint,
    coalesce(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'branch', stock.branch_id,
          'quantity', stock.quantity_on_hand,
          'low', stock.quantity_on_hand < coalesce(stock.reorder_level_override, item.reorder_level)
        )
        order by stock.branch_id
      ) filter (where stock.id is not null),
      '[]'::jsonb
    )
  from public.inventory_items as item
  left join public.inventory_stock as stock
    on stock.organization_id = item.organization_id
   and stock.item_id = item.id
  where item.organization_id = v_organization_id
    and item.is_active
  group by item.id, item.code, item.name
  order by item.code, item.id
  limit 200;
end;
$$;

revoke all on function public.get_inventory_aggregate(uuid)
from public, anon, authenticated, service_role;

comment on function public.get_inventory_aggregate(uuid) is
  'Organization-level aggregate under inventory.view preserving per-branch breakdowns with derived low-stock flags; no audit event.';