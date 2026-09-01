-- Unified Clinical Chart workspace, task 7 review round 1, follow-up.
--
-- private.normalize_visit_implant_chain was created STABLE in 20260901010134.
-- Its staged-continuation branch pins the named existing component with
-- SELECT ... FOR KEY SHARE, so that a concurrent void or supersede cannot slip
-- between validating the parent and inserting the component that depends on it.
-- PostgreSQL refuses a row lock inside a non-volatile function at execution
-- time ("SELECT FOR KEY SHARE is not allowed in a non-volatile function"), so
-- the staged path raised instead of validating.
--
-- 20260901010134 is applied and is not edited. The function is restated here in
-- full and marked VOLATILE. Its body is otherwise byte-identical, it holds no
-- grant to preserve, and the step below fails closed if the volatility did not
-- actually change.

create or replace function private.normalize_visit_implant_chain(
  p_organization_id uuid,
  p_patient_id uuid,
  p_components jsonb
)
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_count integer;
  v_row record;
  v_tooth text;
  v_kinds text[] := array[]::text[];
  v_result jsonb := '[]'::jsonb;
  v_parent_id uuid;
  v_parent_kind text;
  v_required_parent text;
begin
  if pg_catalog.jsonb_typeof(p_components) <> 'array' then
    raise invalid_parameter_value using message = 'invalid implant chain';
  end if;
  v_count := pg_catalog.jsonb_array_length(p_components);
  if v_count not between 1 and 4 then
    raise invalid_parameter_value using message = 'invalid implant chain';
  end if;

  for v_row in
    select value as node, ordinality::integer as position
    from pg_catalog.jsonb_array_elements(p_components) with ordinality
    order by ordinality
  loop
    if pg_catalog.jsonb_typeof(v_row.node) <> 'object'
       or nullif(v_row.node->>'ordinal','')::integer is distinct from v_row.position
       or (v_row.node->>'tooth_fdi') is null
       or not ((v_row.node->>'tooth_fdi') ~ '^(1[1-8]|2[1-8]|3[1-8]|4[1-8]|5[1-5]|6[1-5]|7[1-5]|8[1-5])$')
       or (v_row.node->>'component_kind') not in ('FIXTURE','ABUTMENT','CROWN','ATTACHMENT') then
      raise invalid_parameter_value using message = 'invalid implant chain';
    end if;
    if v_tooth is null then v_tooth := v_row.node->>'tooth_fdi'; end if;
    if v_row.node->>'tooth_fdi' <> v_tooth then
      raise invalid_parameter_value using message = 'invalid implant chain';
    end if;

    if (v_row.node->>'component_kind') = 'ATTACHMENT' then
      if coalesce((v_row.node->>'attachment_value') not in ('locator','bar'), true) then
        raise invalid_parameter_value using message = 'invalid implant chain';
      end if;
    elsif nullif(v_row.node->>'attachment_value','') is not null then
      raise invalid_parameter_value using message = 'invalid implant chain';
    end if;

    if v_row.position = 1 then
      if (v_row.node->>'component_kind') = 'FIXTURE' then
        -- A chain that places its own fixture depends on nothing. The
        -- one-fixture-per-tooth invariant is enforced by the trigger added in
        -- 20260901010134.
        if nullif(v_row.node->>'depends_on_ordinal','') is not null
           or nullif(v_row.node->>'depends_on_component_id','') is not null then
          raise invalid_parameter_value using message = 'invalid implant chain';
        end if;
      else
        -- A staged continuation. The named component is revalidated here, not
        -- trusted: it must be a live CURRENT component of the SAME tenant, the
        -- SAME patient and the SAME tooth position, and of exactly the kind this
        -- component may sit on. FOR KEY SHARE pins it for the rest of the
        -- transaction, so it cannot be voided or superseded between this check
        -- and the insert that depends on it.
        if nullif(v_row.node->>'depends_on_ordinal','') is not null
           or nullif(v_row.node->>'depends_on_component_id','') is null then
          raise invalid_parameter_value using message = 'invalid implant chain';
        end if;
        v_required_parent := case
          when (v_row.node->>'component_kind') = 'ABUTMENT' then 'FIXTURE'
          else 'ABUTMENT'
        end;
        begin
          v_parent_id := (v_row.node->>'depends_on_component_id')::uuid;
        exception when invalid_text_representation then
          raise invalid_parameter_value using message = 'invalid implant chain';
        end;
        select existing.component_kind into v_parent_kind
        from public.dental_implant_components as existing
        where existing.organization_id = p_organization_id
          and existing.id = v_parent_id
          and existing.patient_id = p_patient_id
          and existing.tooth_fdi = v_tooth
          and existing.record_kind = 'CURRENT'
          and existing.sealed_at is not null
          and existing.voided_at is null
          and not exists (
            select 1
            from public.dental_implant_components as successor
            where successor.organization_id = existing.organization_id
              and successor.supersedes_component_id = existing.id
          )
        for key share of existing;
        if v_parent_kind is distinct from v_required_parent then
          raise invalid_parameter_value using message = 'invalid implant chain';
        end if;
      end if;
    else
      if nullif(v_row.node->>'depends_on_component_id','') is not null then
        raise invalid_parameter_value using message = 'invalid implant chain';
      end if;
      declare v_parent integer := nullif(v_row.node->>'depends_on_ordinal','')::integer;
      begin
        if v_parent is null or v_parent < 1 or v_parent >= v_row.position then
          raise invalid_parameter_value using message = 'invalid implant chain';
        end if;
        if (v_row.node->>'component_kind') = 'ABUTMENT' and v_kinds[v_parent] <> 'FIXTURE' then
          raise invalid_parameter_value using message = 'invalid implant chain';
        end if;
        if (v_row.node->>'component_kind') in ('CROWN','ATTACHMENT') and v_kinds[v_parent] <> 'ABUTMENT' then
          raise invalid_parameter_value using message = 'invalid implant chain';
        end if;
      end;
    end if;

    v_kinds := pg_catalog.array_append(v_kinds, v_row.node->>'component_kind');
    v_result := v_result || pg_catalog.jsonb_build_array(pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
      'tooth_fdi', v_tooth,
      'ordinal', v_row.position,
      'component_kind', v_row.node->>'component_kind',
      'attachment_value', nullif(v_row.node->>'attachment_value',''),
      'depends_on_ordinal', nullif(v_row.node->>'depends_on_ordinal','')::integer,
      'depends_on_component_id', nullif(v_row.node->>'depends_on_component_id',''),
      'provenance', nullif(v_row.node->>'provenance','')
    )));
  end loop;

  return v_result;
exception when invalid_text_representation then
  raise invalid_parameter_value using message = 'invalid implant chain';
end;
$$;

revoke all on function private.normalize_visit_implant_chain(uuid,uuid,jsonb)
from public, anon, authenticated, service_role;

do $migration$
begin
  if not exists (
    select 1 from pg_catalog.pg_proc as proc
    where proc.oid = 'private.normalize_visit_implant_chain(uuid,uuid,jsonb)'::regprocedure
      and proc.provolatile = 'v'
      and proc.proconfig = array['search_path=""']::text[]
  ) then
    raise exception using errcode = '55000',
      message = 'normalize_visit_implant_chain must be volatile with an empty search path';
  end if;
end
$migration$;
