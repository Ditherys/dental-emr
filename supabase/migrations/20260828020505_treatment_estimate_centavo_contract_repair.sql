-- Repair the B11 treatment-estimate contract after the decimal storage column
-- was retired. The retained numeric RPCs remain callable for compatibility,
-- but every current write/read path is backed exclusively by exact centavos.

create or replace function private.treatment_estimate_pesos_to_centavos(
  p_estimated_fee numeric
)
returns bigint
language plpgsql
immutable
strict
set search_path = ''
as $$
begin
  if p_estimated_fee < 0
     or p_estimated_fee > 999999999.99
     or p_estimated_fee * 100 <> pg_catalog.trunc(p_estimated_fee * 100) then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  return (p_estimated_fee * 100)::bigint;
end;
$$;

revoke all on function private.treatment_estimate_pesos_to_centavos(numeric)
from public, anon, authenticated, service_role;

create or replace function private.add_treatment_plan_item_centavos(
  p_acting_branch_id uuid,
  p_plan_id uuid,
  p_expected_version integer,
  p_procedure_id uuid,
  p_tooth_code text,
  p_description text,
  p_estimated_fee_centavos bigint
)
returns table(item_id uuid, line_no integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor_user_id uuid := (select auth.uid());
  v_plan public.treatment_plans%rowtype;
  v_line_no integer;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch
  where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or v_actor_user_id is null
     or not private.has_clinical_permission_at_branch(
       p_acting_branch_id, 'patient.clinical.write'
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_plan_id is null or p_expected_version is null or p_expected_version < 1
     or p_description is null
     or pg_catalog.btrim(p_description) = ''
     or pg_catalog.length(p_description) > 2000
     or (p_tooth_code is not null and not (
       p_tooth_code ~ '^(1[1-8]|2[1-8]|3[1-8]|4[1-8]|5[1-5]|6[1-5]|7[1-5]|8[1-5])$'
     ))
     or (p_estimated_fee_centavos is not null and not (
       p_estimated_fee_centavos between 0 and 99999999999
     )) then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  if p_procedure_id is not null and not exists (
    select 1
    from public.procedures as procedure
    where procedure.id = p_procedure_id
      and procedure.organization_id = v_organization_id
  ) then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  select plan.* into v_plan
  from public.treatment_plans as plan
  where plan.id = p_plan_id
    and plan.organization_id = v_organization_id
  for update;

  if not found then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if v_plan.status <> 'DRAFT' then
    raise exception using errcode = 'P0001', message = 'invalid state';
  end if;

  if v_plan.version <> p_expected_version then
    raise exception using errcode = 'P0001', message = 'stale version';
  end if;

  select coalesce(max(item.line_no), 0) + 1 into v_line_no
  from public.treatment_plan_items as item
  where item.organization_id = v_organization_id
    and item.plan_id = p_plan_id;

  insert into public.treatment_plan_items (
    organization_id, plan_id, line_no, procedure_id, tooth_code,
    description, estimated_fee_centavos
  ) values (
    v_organization_id, p_plan_id, v_line_no, p_procedure_id, p_tooth_code,
    pg_catalog.btrim(p_description), p_estimated_fee_centavos
  ) returning id, public.treatment_plan_items.line_no into item_id, line_no;

  insert into public.audit_events (
    organization_id, branch_id, actor_user_id, actor_type, category, action,
    entity_type, entity_id, patient_id, result, metadata
  ) values (
    v_organization_id, p_acting_branch_id, v_actor_user_id, 'USER', 'CLINICAL',
    'treatment.plan.item_added', 'treatment_plan_item', item_id, v_plan.patient_id,
    'SUCCESS', '{}'::jsonb
  );

  return next;
end;
$$;

revoke all on function private.add_treatment_plan_item_centavos(uuid, uuid, integer, uuid, text, text, bigint)
from public, anon, authenticated, service_role;

create or replace function private.update_treatment_plan_item_centavos(
  p_acting_branch_id uuid,
  p_plan_id uuid,
  p_item_id uuid,
  p_expected_version integer,
  p_procedure_id uuid,
  p_tooth_code text,
  p_description text,
  p_estimated_fee_centavos bigint
)
returns table(item_id uuid, line_no integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor_user_id uuid := (select auth.uid());
  v_plan public.treatment_plans%rowtype;
  v_item public.treatment_plan_items%rowtype;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch
  where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or v_actor_user_id is null
     or not private.has_clinical_permission_at_branch(
       p_acting_branch_id, 'patient.clinical.write'
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_plan_id is null or p_item_id is null
     or p_expected_version is null or p_expected_version < 1
     or p_description is null
     or pg_catalog.btrim(p_description) = ''
     or pg_catalog.length(p_description) > 2000
     or (p_tooth_code is not null and not (
       p_tooth_code ~ '^(1[1-8]|2[1-8]|3[1-8]|4[1-8]|5[1-5]|6[1-5]|7[1-5]|8[1-5])$'
     ))
     or (p_estimated_fee_centavos is not null and not (
       p_estimated_fee_centavos between 0 and 99999999999
     )) then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  if p_procedure_id is not null and not exists (
    select 1
    from public.procedures as procedure
    where procedure.id = p_procedure_id
      and procedure.organization_id = v_organization_id
  ) then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  select plan.* into v_plan
  from public.treatment_plans as plan
  where plan.id = p_plan_id
    and plan.organization_id = v_organization_id
  for update;

  if not found then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if v_plan.status <> 'DRAFT' then
    raise exception using errcode = 'P0001', message = 'invalid state';
  end if;

  if v_plan.version <> p_expected_version then
    raise exception using errcode = 'P0001', message = 'stale version';
  end if;

  select item.* into v_item
  from public.treatment_plan_items as item
  where item.id = p_item_id
    and item.organization_id = v_organization_id
    and item.plan_id = p_plan_id
  for update;

  if not found then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  update public.treatment_plan_items
  set procedure_id = p_procedure_id,
      tooth_code = p_tooth_code,
      description = pg_catalog.btrim(p_description),
      estimated_fee_centavos = p_estimated_fee_centavos
  where id = p_item_id and organization_id = v_organization_id
  returning id, public.treatment_plan_items.line_no into item_id, line_no;

  insert into public.audit_events (
    organization_id, branch_id, actor_user_id, actor_type, category, action,
    entity_type, entity_id, patient_id, result, metadata
  ) values (
    v_organization_id, p_acting_branch_id, v_actor_user_id, 'USER', 'CLINICAL',
    'treatment.plan.item_updated', 'treatment_plan_item', p_item_id, v_plan.patient_id,
    'SUCCESS', '{}'::jsonb
  );

  return next;
end;
$$;

revoke all on function private.update_treatment_plan_item_centavos(uuid, uuid, uuid, integer, uuid, text, text, bigint)
from public, anon, authenticated, service_role;

create or replace function public.add_treatment_plan_item(
  p_acting_branch_id uuid,
  p_plan_id uuid,
  p_expected_version integer,
  p_procedure_id uuid default null,
  p_tooth_code text default null,
  p_description text default null,
  p_estimated_fee numeric default null
)
returns table(item_id uuid, line_no integer)
language sql
security definer
set search_path = ''
as $$
  select *
  from private.add_treatment_plan_item_centavos(
    p_acting_branch_id,
    p_plan_id,
    p_expected_version,
    p_procedure_id,
    p_tooth_code,
    p_description,
    private.treatment_estimate_pesos_to_centavos(p_estimated_fee)
  );
$$;

revoke all on function public.add_treatment_plan_item(uuid, uuid, integer, uuid, text, text, numeric)
from public, anon, authenticated, service_role;
grant execute on function public.add_treatment_plan_item(uuid, uuid, integer, uuid, text, text, numeric)
to authenticated;

create or replace function public.update_treatment_plan_item(
  p_acting_branch_id uuid,
  p_plan_id uuid,
  p_item_id uuid,
  p_expected_version integer,
  p_procedure_id uuid default null,
  p_tooth_code text default null,
  p_description text default null,
  p_estimated_fee numeric default null
)
returns table(item_id uuid, line_no integer)
language sql
security definer
set search_path = ''
as $$
  select *
  from private.update_treatment_plan_item_centavos(
    p_acting_branch_id,
    p_plan_id,
    p_item_id,
    p_expected_version,
    p_procedure_id,
    p_tooth_code,
    p_description,
    private.treatment_estimate_pesos_to_centavos(p_estimated_fee)
  );
$$;

revoke all on function public.update_treatment_plan_item(uuid, uuid, uuid, integer, uuid, text, text, numeric)
from public, anon, authenticated, service_role;
grant execute on function public.update_treatment_plan_item(uuid, uuid, uuid, integer, uuid, text, text, numeric)
to authenticated;

create or replace function public.add_treatment_plan_item_centavos(
  p_acting_branch_id uuid,
  p_plan_id uuid,
  p_expected_version integer,
  p_procedure_id uuid default null,
  p_tooth_code text default null,
  p_description text default null,
  p_estimated_fee_centavos bigint default null
)
returns table(item_id uuid, line_no integer)
language sql
security definer
set search_path = ''
as $$
  select *
  from private.add_treatment_plan_item_centavos(
    p_acting_branch_id,
    p_plan_id,
    p_expected_version,
    p_procedure_id,
    p_tooth_code,
    p_description,
    p_estimated_fee_centavos
  );
$$;

revoke all on function public.add_treatment_plan_item_centavos(uuid, uuid, integer, uuid, text, text, bigint)
from public, anon, authenticated, service_role;
grant execute on function public.add_treatment_plan_item_centavos(uuid, uuid, integer, uuid, text, text, bigint)
to authenticated;

create or replace function public.update_treatment_plan_item_centavos(
  p_acting_branch_id uuid,
  p_plan_id uuid,
  p_item_id uuid,
  p_expected_version integer,
  p_procedure_id uuid default null,
  p_tooth_code text default null,
  p_description text default null,
  p_estimated_fee_centavos bigint default null
)
returns table(item_id uuid, line_no integer)
language sql
security definer
set search_path = ''
as $$
  select *
  from private.update_treatment_plan_item_centavos(
    p_acting_branch_id,
    p_plan_id,
    p_item_id,
    p_expected_version,
    p_procedure_id,
    p_tooth_code,
    p_description,
    p_estimated_fee_centavos
  );
$$;

revoke all on function public.update_treatment_plan_item_centavos(uuid, uuid, uuid, integer, uuid, text, text, bigint)
from public, anon, authenticated, service_role;
grant execute on function public.update_treatment_plan_item_centavos(uuid, uuid, uuid, integer, uuid, text, text, bigint)
to authenticated;

-- The two large bounded JSON projections keep all of their reviewed
-- authorization and include-set behavior. Replace only the exact retired
-- estimate expression, and fail closed if the expected prior definition has
-- drifted so a migration can never silently rewrite an unrelated function.
do $$
declare
  v_function regprocedure;
  v_definition text;
begin
  foreach v_function in array array[
    'public.get_treatment_plan_detail(uuid,uuid)'::regprocedure,
    'public.generate_document(uuid,uuid,text,jsonb)'::regprocedure
  ] loop
    v_definition := pg_catalog.pg_get_functiondef(v_function);

    if pg_catalog.strpos(v_definition, '''estimatedFee'', item.estimated_fee,') = 0 then
      raise exception using
        errcode = '55000',
        message = 'expected retired treatment estimate projection was not found';
    end if;

    v_definition := pg_catalog.replace(
      v_definition,
      '''estimatedFee'', item.estimated_fee,',
      '''estimatedFeeCentavos'', item.estimated_fee_centavos::text,'
    );

    execute v_definition;
  end loop;
end;
$$;

revoke all on function public.get_treatment_plan_detail(uuid, uuid)
from public, anon, authenticated, service_role;
grant execute on function public.get_treatment_plan_detail(uuid, uuid)
to authenticated;

revoke all on function public.generate_document(uuid, uuid, text, jsonb)
from public, anon, authenticated, service_role;
grant execute on function public.generate_document(uuid, uuid, text, jsonb)
to authenticated;

comment on function public.add_treatment_plan_item(uuid, uuid, integer, uuid, text, text, numeric) is
  'Compatibility peso writer: validates an exact two-decimal estimate, converts to centavos, and delegates to the tenant-authorized audited treatment-plan boundary.';
comment on function public.update_treatment_plan_item(uuid, uuid, uuid, integer, uuid, text, text, numeric) is
  'Compatibility peso updater: validates an exact two-decimal estimate, converts to centavos, and delegates to the tenant-authorized audited treatment-plan boundary.';
comment on function public.add_treatment_plan_item_centavos(uuid, uuid, integer, uuid, text, text, bigint) is
  'Current application writer for an exact bounded centavo treatment estimate under clinical.write with atomic audit.';
comment on function public.update_treatment_plan_item_centavos(uuid, uuid, uuid, integer, uuid, text, text, bigint) is
  'Current application updater for an exact bounded centavo treatment estimate under clinical.write with atomic audit.';
