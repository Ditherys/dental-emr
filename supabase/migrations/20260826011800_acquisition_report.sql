-- P5-08: OWNER/ADMIN analytics permission and the bounded acquisition report.
-- The permission contract mirrors P3-01; the report is a read-only aggregate
-- RPC that returns counts only, never patient rows or identifying data, and
-- emits no audit event. This object migration grants nothing.

insert into public.permissions (code, description)
values (
  'analytics.view',
  'View organization-level acquisition and referral analytics reports.'
)
on conflict (code) do nothing;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles as role
cross join public.permissions as permission
where role.organization_id is null
  and role.is_system
  and role.code in ('OWNER', 'ADMIN')
  and permission.code = 'analytics.view'
on conflict do nothing;

create or replace function private.can_view_acquisition_report(
  target_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members as organization_member
    join public.organizations as organization
      on organization.id = organization_member.organization_id
     and organization.status = 'active'
    join public.member_roles as member_role
      on member_role.organization_id = organization_member.organization_id
     and member_role.organization_member_id = organization_member.id
     and member_role.branch_id is null
    join public.roles as role
      on role.id = member_role.role_id
     and (
       role.organization_id is null
       or role.organization_id = organization_member.organization_id
     )
    join public.role_permissions as role_permission
      on role_permission.role_id = role.id
    join public.permissions as permission
      on permission.id = role_permission.permission_id
     and permission.code = 'analytics.view'
    where organization_member.organization_id = target_organization_id
      and organization_member.user_id = (select auth.uid())
      and organization_member.membership_status = 'active'
  )
$$;

revoke all on function private.can_view_acquisition_report(uuid)
from public, anon, authenticated, service_role;

comment on function private.can_view_acquisition_report(uuid) is
  'Current-user analytics.view check requiring active membership and an organization-wide role.';

create function public.get_acquisition_summary(
  p_acting_branch_id uuid,
  p_window_days integer
)
returns table(group_type text, code text, name text, patient_count bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_window_start timestamptz;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch
  where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or (select auth.uid()) is null
     or not private.can_view_acquisition_report(v_organization_id) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_window_days not in (30, 90, 365) then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  v_window_start := now() - make_interval(days => p_window_days);

  return query
  select
    'source'::text as group_type,
    source.code,
    source.name,
    count(patient.id)::bigint
  from public.patients as patient
  join public.acquisition_sources as source
    on source.id = patient.acquisition_source_id
  where patient.organization_id = v_organization_id
    and patient.created_at >= v_window_start
    and patient.acquisition_source_id is not null
  group by source.code, source.name
  union all
  select
    'category'::text,
    source.category,
    source.category,
    count(patient.id)::bigint
  from public.patients as patient
  join public.acquisition_sources as source
    on source.id = patient.acquisition_source_id
  where patient.organization_id = v_organization_id
    and patient.created_at >= v_window_start
    and patient.acquisition_source_id is not null
  group by source.category
  union all
  select
    'channel'::text,
    channel.code,
    channel.name,
    count(patient.id)::bigint
  from public.patients as patient
  join public.booking_channels as channel
    on channel.code = patient.initial_booking_channel_code
  where patient.organization_id = v_organization_id
    and patient.created_at >= v_window_start
    and patient.initial_booking_channel_code is not null
  group by channel.code, channel.name
  order by group_type, name, code
  limit 200;
end;
$$;

revoke all on function public.get_acquisition_summary(uuid, integer)
from public, anon, authenticated, service_role;

comment on function public.get_acquisition_summary(uuid, integer) is
  'Organization-scoped aggregate counts of patients by acquisition source, category, and first-booking channel within a bounded window. Requires analytics.view and returns no patient rows or identifying data.';
