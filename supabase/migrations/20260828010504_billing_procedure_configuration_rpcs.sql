-- B6/B7 corrective extension: financial procedure configuration remains behind
-- narrow billing.adjust-gated RPCs. This object migration grants nothing.

create or replace function private.audit_metadata_is_safe(candidate jsonb)
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
    when exists (
      select 1
      from pg_catalog.jsonb_each(candidate) as entry(key, value)
      where not case
        when entry.key = any (array['invitation_id','charge_id','payment_id','allocation_id','refund_id','cheque_id','adjustment_id','direct_cost_id','direct_cost_default_id','resolution_id','agreement_id','provider_id','procedure_id','treatment_plan_item_id','appointment_id','attribution_previous_provider','attribution_corrected_provider'])
          then pg_catalog.jsonb_typeof(entry.value) = 'string' and entry.value #>> '{}' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        when entry.key = 'permission_code'
          then pg_catalog.jsonb_typeof(entry.value) = 'string' and entry.value #>> '{}' ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$' and pg_catalog.length(entry.value #>> '{}') <= 128
        when entry.key = 'role_code'
          then pg_catalog.jsonb_typeof(entry.value) = 'string' and entry.value #>> '{}' ~ '^[A-Z][A-Z0-9_]*$' and pg_catalog.length(entry.value #>> '{}') <= 128
        when entry.key = 'scope' then entry.value #>> '{}' in ('ORGANIZATION','BRANCH')
        when entry.key = 'service_date' then pg_catalog.jsonb_typeof(entry.value) = 'string' and entry.value #>> '{}' ~ '^\d{4}-\d{2}-\d{2}$'
        when entry.key = 'reason' then pg_catalog.jsonb_typeof(entry.value) = 'string' and pg_catalog.length(entry.value #>> '{}') <= 500
        when entry.key = 'note' then pg_catalog.jsonb_typeof(entry.value) = 'string' and pg_catalog.length(entry.value #>> '{}') <= 256
        when entry.key = 'idempotency_key' then pg_catalog.jsonb_typeof(entry.value) = 'string' and pg_catalog.length(entry.value #>> '{}') <= 128
        when entry.key = 'cause' then entry.value #>> '{}' in ('DIRECT_COST','ATTRIBUTION','REFUND','VOID','REALLOCATION')
        when entry.key = 'direction' then entry.value #>> '{}' in ('CREDIT','DEBIT')
        when entry.key = 'cost_type' then entry.value #>> '{}' in ('LAB','MATERIAL','OTHER')
        when entry.key = 'method_code' then pg_catalog.jsonb_typeof(entry.value) = 'string' and pg_catalog.length(entry.value #>> '{}') <= 40
        when entry.key = 'from_status' then entry.value #>> '{}' in ('HELD','DEPOSITED','BOUNCED')
        when entry.key = 'to_status' then entry.value #>> '{}' in ('DEPOSITED','CLEARED','BOUNCED','CANCELLED','REPLACED')
        else false
      end
    ) then false
    else true
  end
$$;
revoke all on function private.audit_metadata_is_safe(jsonb)
from public, anon, authenticated, service_role;

create function public.set_procedure_default_fee(
  p_acting_branch_id uuid,
  p_procedure_id uuid,
  p_expected_version integer,
  p_default_fee_centavos bigint
)
returns table(procedure_id uuid, version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor uuid := (select auth.uid());
  v_procedure public.procedures%rowtype;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch
  where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or v_actor is null
     or not private.has_billing_permission_at_branch(p_acting_branch_id, 'billing.adjust') then
    raise insufficient_privilege using message = 'not authorized';
  end if;
  if p_expected_version is null or p_expected_version < 1
     or p_default_fee_centavos is not null and p_default_fee_centavos not between 0 and 99999999999 then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  select procedure.* into v_procedure
  from public.procedures as procedure
  where procedure.id = p_procedure_id
    and procedure.organization_id = v_organization_id
    and procedure.status <> 'archived'
  for update;
  if not found then
    raise insufficient_privilege using message = 'not authorized';
  end if;
  if v_procedure.version <> p_expected_version then
    raise exception using errcode = 'P0001', message = 'stale version';
  end if;

  update public.procedures
  set default_fee_centavos = p_default_fee_centavos,
      version = v_procedure.version + 1
  where id = v_procedure.id and organization_id = v_organization_id
  returning id, public.procedures.version into procedure_id, version;

  perform private.record_billing_audit(
    v_organization_id, p_acting_branch_id, 'billing.procedure_default_fee.updated',
    'procedure', procedure_id, null,
    jsonb_build_object('procedure_id', procedure_id::text)
  );
  return next;
end;
$$;
revoke all on function public.set_procedure_default_fee(uuid,uuid,integer,bigint)
from public, anon, authenticated, service_role;

create function public.list_procedure_direct_cost_defaults(
  p_acting_branch_id uuid,
  p_procedure_id uuid,
  p_include_inactive boolean default false
)
returns table(direct_cost_default_id uuid, cost_type text, description text, amount_centavos bigint, active boolean, version integer)
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
     or not private.has_billing_permission_at_branch(p_acting_branch_id, 'billing.adjust') then
    raise insufficient_privilege using message = 'not authorized';
  end if;
  if not exists (
    select 1 from public.procedures as procedure
    where procedure.id = p_procedure_id
      and procedure.organization_id = v_organization_id
      and procedure.status <> 'archived'
  ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  return query
  select cost_default.id, cost_default.cost_type, cost_default.description,
         cost_default.amount_centavos, cost_default.active, cost_default.version
  from public.procedure_direct_cost_defaults as cost_default
  where cost_default.organization_id = v_organization_id
    and cost_default.procedure_id = p_procedure_id
    and (p_include_inactive or cost_default.active)
  order by cost_default.created_at, cost_default.id;
end;
$$;
revoke all on function public.list_procedure_direct_cost_defaults(uuid,uuid,boolean)
from public, anon, authenticated, service_role;

create function public.create_procedure_direct_cost_default(
  p_acting_branch_id uuid,
  p_procedure_id uuid,
  p_cost_type text,
  p_description text,
  p_amount_centavos bigint
)
returns table(direct_cost_default_id uuid, version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor uuid := (select auth.uid());
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch
  where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or v_actor is null
     or not private.has_billing_permission_at_branch(p_acting_branch_id, 'billing.adjust') then
    raise insufficient_privilege using message = 'not authorized';
  end if;
  if p_cost_type not in ('LAB', 'MATERIAL', 'OTHER')
     or p_description is null or btrim(p_description) = '' or length(p_description) > 500
     or p_amount_centavos is null or p_amount_centavos not between 0 and 99999999999 then
    raise invalid_parameter_value using message = 'invalid input';
  end if;
  if not exists (
    select 1 from public.procedures as procedure
    where procedure.id = p_procedure_id
      and procedure.organization_id = v_organization_id
      and procedure.status <> 'archived'
  ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  insert into public.procedure_direct_cost_defaults (
    organization_id, procedure_id, cost_type, description, amount_centavos, created_by
  ) values (
    v_organization_id, p_procedure_id, p_cost_type, btrim(p_description), p_amount_centavos, v_actor
  ) returning id, public.procedure_direct_cost_defaults.version into direct_cost_default_id, version;

  perform private.record_billing_audit(
    v_organization_id, p_acting_branch_id, 'billing.procedure_direct_cost_default.created',
    'procedure_direct_cost_default', direct_cost_default_id, null,
    jsonb_build_object('direct_cost_default_id', direct_cost_default_id::text, 'procedure_id', p_procedure_id::text, 'cost_type', p_cost_type)
  );
  return next;
end;
$$;
revoke all on function public.create_procedure_direct_cost_default(uuid,uuid,text,text,bigint)
from public, anon, authenticated, service_role;

create function public.update_procedure_direct_cost_default(
  p_acting_branch_id uuid,
  p_direct_cost_default_id uuid,
  p_expected_version integer,
  p_cost_type text,
  p_description text,
  p_amount_centavos bigint
)
returns table(direct_cost_default_id uuid, version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor uuid := (select auth.uid());
  v_cost_default public.procedure_direct_cost_defaults%rowtype;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch
  where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or v_actor is null
     or not private.has_billing_permission_at_branch(p_acting_branch_id, 'billing.adjust') then
    raise insufficient_privilege using message = 'not authorized';
  end if;
  if p_expected_version is null or p_expected_version < 1
     or p_cost_type not in ('LAB', 'MATERIAL', 'OTHER')
     or p_description is null or btrim(p_description) = '' or length(p_description) > 500
     or p_amount_centavos is null or p_amount_centavos not between 0 and 99999999999 then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  select cost_default.* into v_cost_default
  from public.procedure_direct_cost_defaults as cost_default
  join public.procedures as procedure
    on procedure.id = cost_default.procedure_id
   and procedure.organization_id = cost_default.organization_id
  where cost_default.id = p_direct_cost_default_id
    and cost_default.organization_id = v_organization_id
    and procedure.status <> 'archived'
  for update of cost_default;
  if not found then
    raise insufficient_privilege using message = 'not authorized';
  end if;
  if not v_cost_default.active then
    raise exception using errcode = 'P0001', message = 'invalid state';
  end if;
  if v_cost_default.version <> p_expected_version then
    raise exception using errcode = 'P0001', message = 'stale version';
  end if;

  update public.procedure_direct_cost_defaults
  set cost_type = p_cost_type,
      description = btrim(p_description),
      amount_centavos = p_amount_centavos,
      version = v_cost_default.version + 1,
      updated_at = statement_timestamp()
  where id = v_cost_default.id and organization_id = v_organization_id
  returning id, public.procedure_direct_cost_defaults.version into direct_cost_default_id, version;

  perform private.record_billing_audit(
    v_organization_id, p_acting_branch_id, 'billing.procedure_direct_cost_default.updated',
    'procedure_direct_cost_default', direct_cost_default_id, null,
    jsonb_build_object('direct_cost_default_id', direct_cost_default_id::text, 'procedure_id', v_cost_default.procedure_id::text, 'cost_type', p_cost_type)
  );
  return next;
end;
$$;
revoke all on function public.update_procedure_direct_cost_default(uuid,uuid,integer,text,text,bigint)
from public, anon, authenticated, service_role;

create function public.deactivate_procedure_direct_cost_default(
  p_acting_branch_id uuid,
  p_direct_cost_default_id uuid,
  p_expected_version integer
)
returns table(direct_cost_default_id uuid, version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor uuid := (select auth.uid());
  v_cost_default public.procedure_direct_cost_defaults%rowtype;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch
  where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or v_actor is null
     or not private.has_billing_permission_at_branch(p_acting_branch_id, 'billing.adjust') then
    raise insufficient_privilege using message = 'not authorized';
  end if;
  if p_expected_version is null or p_expected_version < 1 then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  select cost_default.* into v_cost_default
  from public.procedure_direct_cost_defaults as cost_default
  join public.procedures as procedure
    on procedure.id = cost_default.procedure_id
   and procedure.organization_id = cost_default.organization_id
  where cost_default.id = p_direct_cost_default_id
    and cost_default.organization_id = v_organization_id
    and procedure.status <> 'archived'
  for update of cost_default;
  if not found then
    raise insufficient_privilege using message = 'not authorized';
  end if;
  if not v_cost_default.active then
    raise exception using errcode = 'P0001', message = 'invalid state';
  end if;
  if v_cost_default.version <> p_expected_version then
    raise exception using errcode = 'P0001', message = 'stale version';
  end if;

  update public.procedure_direct_cost_defaults
  set active = false,
      version = v_cost_default.version + 1,
      updated_at = statement_timestamp()
  where id = v_cost_default.id and organization_id = v_organization_id
  returning id, public.procedure_direct_cost_defaults.version into direct_cost_default_id, version;

  perform private.record_billing_audit(
    v_organization_id, p_acting_branch_id, 'billing.procedure_direct_cost_default.deactivated',
    'procedure_direct_cost_default', direct_cost_default_id, null,
    jsonb_build_object('direct_cost_default_id', direct_cost_default_id::text, 'procedure_id', v_cost_default.procedure_id::text)
  );
  return next;
end;
$$;
revoke all on function public.deactivate_procedure_direct_cost_default(uuid,uuid,integer)
from public, anon, authenticated, service_role;
