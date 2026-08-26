-- P5-06: the catalog tables intentionally have no browser-role table grants.
-- These bounded read RPCs are their only authenticated application surface.

create function public.list_acquisition_sources(p_acting_branch_id uuid)
returns table(source_id uuid, code text, name text, category text)
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
     or not private.has_patient_permission_at_branch(
       p_acting_branch_id, 'patient.demographics.read'
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  return query
  select source.id, source.code, source.name, source.category
  from public.acquisition_sources as source
  where source.is_active
    and (source.organization_id is null or source.organization_id = v_organization_id)
  order by source.name, source.id
  limit 100;
end;
$$;

revoke all on function public.list_acquisition_sources(uuid)
from public, anon, authenticated, service_role;

create function public.list_booking_channels(p_acting_branch_id uuid)
returns table(code text, name text)
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
     or not private.has_patient_permission_at_branch(
       p_acting_branch_id, 'patient.demographics.read'
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  return query
  select channel.code, channel.name
  from public.booking_channels as channel
  where channel.is_active
  order by channel.name, channel.code
  limit 50;
end;
$$;

revoke all on function public.list_booking_channels(uuid)
from public, anon, authenticated, service_role;
