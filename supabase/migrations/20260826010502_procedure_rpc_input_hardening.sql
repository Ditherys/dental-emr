-- P3-05 follow-up: reject fractional and out-of-range JSON numeric inputs.
-- This object migration changes no privileges.

revoke all on function public.create_procedure(uuid, jsonb)
from public, anon, authenticated, service_role;

create or replace function public.create_procedure(p_acting_branch_id uuid, p_procedure jsonb)
returns table(procedure_id uuid, version integer)
language plpgsql security definer set search_path = '' as $$
declare v_organization_id uuid; v_actor_user_id uuid := (select auth.uid());
begin
  select branch.organization_id into v_organization_id from public.branches as branch where branch.id = p_acting_branch_id and branch.status = 'active';
  if v_organization_id is null or v_actor_user_id is null or not private.can_manage_provider_configuration(v_organization_id) then raise insufficient_privilege using message = 'not authorized'; end if;
  if jsonb_typeof(p_procedure) <> 'object' or not (p_procedure ?& array['code','name'])
    or exists (select 1 from jsonb_object_keys(p_procedure) as key where key not in ('code','name','description','defaultDurationMinutes','preBufferMinutes','postBufferMinutes','status','websiteVisible','onlineBookingEnabled','bookingMode'))
    or (p_procedure ? 'code' and jsonb_typeof(p_procedure -> 'code') <> 'string')
    or (p_procedure ? 'name' and jsonb_typeof(p_procedure -> 'name') <> 'string')
    or exists (select 1 from jsonb_object_keys(p_procedure) as key where key in ('description','status','bookingMode') and jsonb_typeof(p_procedure -> key) not in ('string','null'))
    or exists (select 1 from jsonb_object_keys(p_procedure) as key where key in ('defaultDurationMinutes','preBufferMinutes','postBufferMinutes') and jsonb_typeof(p_procedure -> key) not in ('number','null'))
    or exists (select 1 from jsonb_object_keys(p_procedure) as key where key in ('defaultDurationMinutes','preBufferMinutes','postBufferMinutes') and jsonb_typeof(p_procedure -> key) = 'number' and (p_procedure ->> key) !~ '^[0-9]+$')
    or exists (select 1 from jsonb_object_keys(p_procedure) as key where key in ('websiteVisible','onlineBookingEnabled') and jsonb_typeof(p_procedure -> key) <> 'boolean') then raise invalid_parameter_value using message = 'invalid input'; end if;
  if p_procedure ->> 'code' <> pg_catalog.upper(p_procedure ->> 'code') or p_procedure ->> 'code' !~ '^[A-Z][A-Z0-9_]*$' or pg_catalog.length(p_procedure ->> 'code') > 80
    or pg_catalog.btrim(p_procedure ->> 'name') = '' or pg_catalog.length(p_procedure ->> 'name') > 160
    or coalesce(pg_catalog.length(nullif(pg_catalog.btrim(p_procedure ->> 'description'), '')), 0) > 4000
    or (p_procedure ? 'status' and p_procedure ->> 'status' not in ('active','inactive'))
    or (p_procedure ? 'bookingMode' and p_procedure ->> 'bookingMode' not in ('REQUIRES_REVIEW','REQUEST_ONLY')) then raise invalid_parameter_value using message = 'invalid input'; end if;
  begin
    if (p_procedure ? 'defaultDurationMinutes' and ((p_procedure ->> 'defaultDurationMinutes')::integer not between 1 and 1440))
      or (p_procedure ? 'preBufferMinutes' and ((p_procedure ->> 'preBufferMinutes')::integer not between 0 and 1440))
      or (p_procedure ? 'postBufferMinutes' and ((p_procedure ->> 'postBufferMinutes')::integer not between 0 and 1440))
      or (coalesce(p_procedure ->> 'defaultDurationMinutes', '') = '' and (coalesce((p_procedure ->> 'preBufferMinutes')::integer, 0) <> 0 or coalesce((p_procedure ->> 'postBufferMinutes')::integer, 0) <> 0)) then raise invalid_parameter_value using message = 'invalid input'; end if;
  exception when invalid_text_representation or numeric_value_out_of_range then raise invalid_parameter_value using message = 'invalid input'; end;
  insert into public.procedures (organization_id, code, name, description, default_duration_minutes, pre_buffer_minutes, post_buffer_minutes, status, website_visible, online_booking_enabled, booking_mode)
  values (v_organization_id, p_procedure ->> 'code', pg_catalog.btrim(p_procedure ->> 'name'), nullif(pg_catalog.btrim(p_procedure ->> 'description'), ''), nullif(p_procedure ->> 'defaultDurationMinutes','')::integer, coalesce((p_procedure ->> 'preBufferMinutes')::integer,0), coalesce((p_procedure ->> 'postBufferMinutes')::integer,0), coalesce(p_procedure ->> 'status','active'), coalesce((p_procedure ->> 'websiteVisible')::boolean,false), coalesce((p_procedure ->> 'onlineBookingEnabled')::boolean,false), coalesce(p_procedure ->> 'bookingMode','REQUIRES_REVIEW')) returning id, public.procedures.version into procedure_id, version;
  insert into public.audit_events (organization_id, branch_id, actor_user_id, actor_type, category, action, entity_type, entity_id, result, metadata) values (v_organization_id,p_acting_branch_id,v_actor_user_id,'USER','PROVIDER_CONFIGURATION','procedure.created','procedure',procedure_id,'SUCCESS','{}'::jsonb);
  return next;
end;
$$;

revoke all on function public.create_procedure(uuid, jsonb)
from public, anon, authenticated, service_role;
