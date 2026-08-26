-- P6-07: bounded scheduling read surfaces. list_availability returns recurring
-- rule coverage plus ADDITIONAL_AVAILABILITY exceptions; find_available_slots
-- enumerates provider slot starts that satisfy availability rules, do not hit
-- UNAVAILABLE/LEAVE exceptions, and do not overlap existing ACTIVE provider
-- reservations. Both are appointment.read gated, emit no audit event, and
-- grant nothing here (the 20260827010501 terminal owns the only authenticated
-- grants for the P6-06 surfaces; this file restores exact authenticated grants
-- in the separate terminal below).

create function public.list_availability(
  p_acting_branch_id uuid,
  p_provider_id uuid,
  p_start_date date,
  p_end_date date
)
returns table(
  availability_date date,
  starts_at timestamptz,
  ends_at timestamptz,
  source text
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
     or not private.has_appointment_permission_at_branch(
       p_acting_branch_id, 'appointment.read'
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_start_date is null or p_end_date is null
     or p_end_date < p_start_date
     or (p_end_date - p_start_date) > 31 then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  if not exists (
    select 1 from public.providers as provider
    join public.provider_branches as provider_branch
      on provider_branch.organization_id = provider.organization_id
     and provider_branch.provider_id = provider.id
     and provider_branch.branch_id = p_acting_branch_id
     and provider_branch.is_active
    where provider.id = p_provider_id
      and provider.organization_id = v_organization_id
      and provider.status = 'active'
  ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  return query
  select
    day.value::date as availability_date,
    (day.value + rule.starts_at_local) at time zone 'UTC' as starts_at,
    (day.value + rule.ends_at_local) at time zone 'UTC' as ends_at,
    'RULE'::text as source
  from pg_catalog.generate_series(p_start_date, p_end_date, interval '1 day') as day(value)
  join public.provider_availability_rules as rule
    on rule.organization_id = v_organization_id
   and rule.provider_id = p_provider_id
   and rule.branch_id = p_acting_branch_id
   and rule.active
   and rule.weekday = EXTRACT(DOW FROM day.value)
   and rule.valid_from <= day.value
   and (rule.valid_to is null or rule.valid_to >= day.value)
  union all
  select
    (exception.starts_at at time zone 'UTC')::date,
    exception.starts_at,
    exception.ends_at,
    'EXCEPTION'::text
  from public.provider_schedule_exceptions as exception
  where exception.organization_id = v_organization_id
    and exception.provider_id = p_provider_id
    and (exception.branch_id is null or exception.branch_id = p_acting_branch_id)
    and exception.exception_type = 'ADDITIONAL_AVAILABILITY'
    and exception.starts_at::date <= p_end_date
    and exception.ends_at::date >= p_start_date
  order by availability_date, starts_at, source
  limit 200;
end;
$$;

revoke all on function public.list_availability(uuid, uuid, date, date)
from public, anon, authenticated, service_role;

create function public.find_available_slots(
  p_acting_branch_id uuid,
  p_provider_id uuid,
  p_window_start timestamptz,
  p_window_end timestamptz,
  p_duration_minutes integer,
  p_max_slots integer default 20
)
returns table(starts_at timestamptz, ends_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_duration interval;
  v_cap integer := p_max_slots;
begin
  if p_max_slots is null or p_max_slots < 1 or p_max_slots > 50 then
    v_cap := 20;
  end if;

  select branch.organization_id into v_organization_id
  from public.branches as branch
  where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or (select auth.uid()) is null
     or not private.has_appointment_permission_at_branch(
       p_acting_branch_id, 'appointment.read'
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_window_start is null or p_window_end is null
     or p_duration_minutes is null
     or p_duration_minutes < 15 or p_duration_minutes > 480
     or p_window_end <= p_window_start
     or (p_window_end - p_window_start) > interval '31 days' then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  if not exists (
    select 1 from public.providers as provider
    join public.provider_branches as provider_branch
      on provider_branch.organization_id = provider.organization_id
     and provider_branch.provider_id = provider.id
     and provider_branch.branch_id = p_acting_branch_id
     and provider_branch.is_active
    where provider.id = p_provider_id
      and provider.organization_id = v_organization_id
      and provider.status = 'active'
  ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  v_duration := make_interval(mins => p_duration_minutes);

  return query
  with candidates as (
    select
      slot.value as starts_at,
      slot.value + v_duration as ends_at
    from pg_catalog.generate_series(
      p_window_start,
      p_window_end - v_duration,
      interval '15 minutes'
    ) as slot(value)
    where slot.value + v_duration <= p_window_end
  )
  select candidate.starts_at, candidate.ends_at
  from candidates as candidate
  where exists (
    select 1 from public.provider_availability_rules as rule
    where rule.organization_id = v_organization_id
      and rule.provider_id = p_provider_id
      and rule.branch_id = p_acting_branch_id
      and rule.active
      and rule.weekday = EXTRACT(DOW FROM candidate.starts_at)
      and rule.valid_from <= candidate.starts_at::date
      and (rule.valid_to is null or rule.valid_to >= candidate.starts_at::date)
      and rule.starts_at_local <= candidate.starts_at::time
      and rule.ends_at_local >= candidate.ends_at::time
  )
  and not exists (
    select 1 from public.provider_schedule_exceptions as exception
    where exception.organization_id = v_organization_id
      and exception.provider_id = p_provider_id
      and (exception.branch_id is null or exception.branch_id = p_acting_branch_id)
      and exception.exception_type in ('UNAVAILABLE', 'LEAVE')
      and exception.starts_at < candidate.ends_at
      and exception.ends_at > candidate.starts_at
  )
  and not exists (
    select 1 from public.provider_reservations as reservation
    where reservation.organization_id = v_organization_id
      and reservation.provider_id = p_provider_id
      and reservation.reservation_status = 'ACTIVE'
      and reservation.starts_at < candidate.ends_at
      and reservation.ends_at > candidate.starts_at
  )
  order by candidate.starts_at
  limit v_cap;
end;
$$;

revoke all on function public.find_available_slots(uuid, uuid, timestamptz, timestamptz, integer, integer)
from public, anon, authenticated, service_role;