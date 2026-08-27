-- P20-02 aggregate-only operational analytics. The acting branch derives the
-- tenant; an optional report branch is validated inside that tenant. No patient
-- rows or clinical content leave these functions, and reads emit no audit event.

create function private.has_analytics_permission_at_branch(
  p_acting_branch_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.branches as branch
    where branch.id = p_acting_branch_id
      and branch.status = 'active'
      and private.can_view_acquisition_report(branch.organization_id)
  )
$$;

revoke all on function private.has_analytics_permission_at_branch(uuid)
from public, anon, authenticated, service_role;

comment on function private.has_analytics_permission_at_branch(uuid) is
  'Current-user analytics.view check derived from an active acting branch and the existing organization-wide analytics role contract.';

create function public.get_operational_analytics_summary(
  p_acting_branch_id uuid,
  p_branch_id uuid default null,
  p_window_days integer default 30
)
returns table(
  metric_code text,
  numerator bigint,
  denominator bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_window_start timestamptz;
  v_window_end timestamptz := statement_timestamp();
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch
  where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or (select auth.uid()) is null
     or not private.has_analytics_permission_at_branch(p_acting_branch_id) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_branch_id is not null and not exists (
    select 1
    from public.branches as branch
    where branch.organization_id = v_organization_id
      and branch.id = p_branch_id
      and branch.status = 'active'
  ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_window_days not in (30, 90, 365) then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  v_window_start := v_window_end - pg_catalog.make_interval(days => p_window_days);

  return query
  with selected_appointments as (
    select appointment.*
    from public.appointments as appointment
    where appointment.organization_id = v_organization_id
      and (p_branch_id is null or appointment.branch_id = p_branch_id)
      and appointment.starts_at >= v_window_start
      and appointment.starts_at < v_window_end
      and appointment.scheduling_status <> 'CANCELLED'
      and appointment.encounter_status <> 'CANCELLED'
  ),
  selected_patients as (
    select patient.*
    from public.patients as patient
    where patient.organization_id = v_organization_id
      and (p_branch_id is null or patient.preferred_branch_id = p_branch_id)
      and patient.created_at >= v_window_start
      and patient.created_at < v_window_end
  ),
  selected_requests as (
    select request.*
    from public.booking_requests as request
    where request.organization_id = v_organization_id
      and (p_branch_id is null or request.branch_id = p_branch_id)
      and request.created_at >= v_window_start
      and request.created_at < v_window_end
      and request.booking_channel_code = 'WEBSITE'
      and request.request_status not in ('SPAM', 'CANCELLED')
  ),
  selected_communications as (
    select communication.*
    from public.communications as communication
    where communication.organization_id = v_organization_id
      and (p_branch_id is null or communication.branch_id = p_branch_id)
      and communication.created_at >= v_window_start
      and communication.created_at < v_window_end
  ),
  selected_referrals as (
    select referral.*
    from public.patient_referrals as referral
    join public.patients as patient
      on patient.organization_id = referral.org_id
     and patient.id = referral.patient_id
    where referral.org_id = v_organization_id
      and (p_branch_id is null or patient.preferred_branch_id = p_branch_id)
      and referral.created_at >= v_window_start
      and referral.created_at < v_window_end
  )
  select metric.metric_code, metric.numerator, metric.denominator
  from (
    values
      (
        'new_patients'::text,
        (select pg_catalog.count(*) from selected_patients),
        null::bigint
      ),
      (
        'appointments'::text,
        (select pg_catalog.count(*) from selected_appointments),
        null::bigint
      ),
      (
        'completed_appointments'::text,
        (select pg_catalog.count(*) from selected_appointments where encounter_status = 'COMPLETED'),
        null::bigint
      ),
      (
        'no_show_rate'::text,
        (select pg_catalog.count(*) from selected_appointments where encounter_status = 'NO_SHOW'),
        (select pg_catalog.count(*) from selected_appointments where encounter_status in ('NO_SHOW', 'COMPLETED'))
      ),
      (
        'confirmation_rate'::text,
        (select pg_catalog.count(*) from selected_appointments where confirmation_status = 'CONFIRMED'),
        (select pg_catalog.count(*) from selected_appointments)
      ),
      (
        'website_conversion_rate'::text,
        (select pg_catalog.count(*) from selected_requests where appointment_id is not null),
        (select pg_catalog.count(*) from selected_requests)
      ),
      (
        'communication_delivery_rate'::text,
        (select pg_catalog.count(*) from selected_communications where status = 'DELIVERED'),
        (select pg_catalog.count(*) from selected_communications where status in ('DELIVERED', 'FAILED'))
      ),
      (
        'incoming_referrals'::text,
        (select pg_catalog.count(*) from selected_referrals where direction = 'IN'),
        null::bigint
      ),
      (
        'outgoing_referrals'::text,
        (select pg_catalog.count(*) from selected_referrals where direction = 'OUT'),
        null::bigint
      ),
      (
        'low_stock_branch_items'::text,
        (
          select pg_catalog.count(*)
          from public.branches as branch
          cross join public.inventory_items as item
          left join public.inventory_stock as stock
            on stock.organization_id = item.organization_id
           and stock.branch_id = branch.id
           and stock.item_id = item.id
          where branch.organization_id = v_organization_id
            and branch.status = 'active'
            and (p_branch_id is null or branch.id = p_branch_id)
            and item.organization_id = v_organization_id
            and item.category = 'CONSUMABLE'
            and item.is_active
            and coalesce(stock.quantity_on_hand, 0)
              < coalesce(stock.reorder_level_override, item.reorder_level)
        ),
        null::bigint
      )
  ) as metric(metric_code, numerator, denominator)
  order by metric.metric_code;
end;
$$;

revoke all on function public.get_operational_analytics_summary(uuid, uuid, integer)
from public, anon, authenticated, service_role;

comment on function public.get_operational_analytics_summary(uuid, uuid, integer) is
  'Aggregate-only OWNER/ADMIN analytics summary for a validated 30/90/365-day organization or branch window; no patient rows and no audit event.';

create function public.list_operational_analytics_breakdown(
  p_acting_branch_id uuid,
  p_branch_id uuid default null,
  p_window_days integer default 30
)
returns table(
  group_type text,
  dimension_id uuid,
  code text,
  name text,
  item_count bigint,
  booked_minutes bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_window_start timestamptz;
  v_window_end timestamptz := statement_timestamp();
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch
  where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or (select auth.uid()) is null
     or not private.has_analytics_permission_at_branch(p_acting_branch_id) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_branch_id is not null and not exists (
    select 1
    from public.branches as branch
    where branch.organization_id = v_organization_id
      and branch.id = p_branch_id
      and branch.status = 'active'
  ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_window_days not in (30, 90, 365) then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  v_window_start := v_window_end - pg_catalog.make_interval(days => p_window_days);

  return query
  with selected_appointments as (
    select appointment.*
    from public.appointments as appointment
    where appointment.organization_id = v_organization_id
      and (p_branch_id is null or appointment.branch_id = p_branch_id)
      and appointment.starts_at >= v_window_start
      and appointment.starts_at < v_window_end
      and appointment.scheduling_status <> 'CANCELLED'
      and appointment.encounter_status <> 'CANCELLED'
  ),
  selected_patients as (
    select patient.*
    from public.patients as patient
    where patient.organization_id = v_organization_id
      and (p_branch_id is null or patient.preferred_branch_id = p_branch_id)
      and patient.created_at >= v_window_start
      and patient.created_at < v_window_end
  ),
  selected_referrals as (
    select referral.*
    from public.patient_referrals as referral
    join public.patients as patient
      on patient.organization_id = referral.org_id
     and patient.id = referral.patient_id
    where referral.org_id = v_organization_id
      and (p_branch_id is null or patient.preferred_branch_id = p_branch_id)
      and referral.created_at >= v_window_start
      and referral.created_at < v_window_end
  )
  select breakdown.group_type,
         breakdown.dimension_id,
         breakdown.code,
         breakdown.name,
         breakdown.item_count,
         breakdown.booked_minutes
  from (
    select
      'branch_appointments'::text as group_type,
      branch.id as dimension_id,
      branch.code,
      branch.name,
      pg_catalog.count(appointment.id)::bigint as item_count,
      coalesce(
        pg_catalog.round(pg_catalog.sum(
          extract(epoch from (appointment.ends_at - appointment.starts_at)) / 60
        )),
        0
      )::bigint as booked_minutes
    from public.branches as branch
    left join selected_appointments as appointment on appointment.branch_id = branch.id
    where branch.organization_id = v_organization_id
      and branch.status = 'active'
      and (p_branch_id is null or branch.id = p_branch_id)
    group by branch.id, branch.code, branch.name

    union all

    select
      'encounter_status'::text,
      null::uuid,
      appointment.encounter_status,
      pg_catalog.initcap(pg_catalog.replace(pg_catalog.lower(appointment.encounter_status), '_', ' ')),
      pg_catalog.count(*)::bigint,
      null::bigint
    from selected_appointments as appointment
    group by appointment.encounter_status

    union all

    select
      'acquisition_source'::text,
      source.id,
      source.code,
      source.name,
      pg_catalog.count(patient.id)::bigint,
      null::bigint
    from selected_patients as patient
    join public.acquisition_sources as source on source.id = patient.acquisition_source_id
    group by source.id, source.code, source.name

    union all

    select
      'booking_channel'::text,
      null::uuid,
      channel.code,
      channel.name,
      pg_catalog.count(patient.id)::bigint,
      null::bigint
    from selected_patients as patient
    join public.booking_channels as channel on channel.code = patient.initial_booking_channel_code
    group by channel.code, channel.name

    union all

    select
      'referral_status'::text,
      null::uuid,
      referral.direction || ':' || referral.status,
      case referral.direction when 'IN' then 'Incoming - ' else 'Outgoing - ' end
        || pg_catalog.initcap(pg_catalog.lower(referral.status)),
      pg_catalog.count(*)::bigint,
      null::bigint
    from selected_referrals as referral
    group by referral.direction, referral.status

    union all

    select
      'website_request_status'::text,
      null::uuid,
      request.request_status,
      pg_catalog.initcap(pg_catalog.replace(pg_catalog.lower(request.request_status), '_', ' ')),
      pg_catalog.count(*)::bigint,
      null::bigint
    from public.booking_requests as request
    where request.organization_id = v_organization_id
      and (p_branch_id is null or request.branch_id = p_branch_id)
      and request.created_at >= v_window_start
      and request.created_at < v_window_end
      and request.booking_channel_code = 'WEBSITE'
    group by request.request_status

    union all

    select
      'provider_load'::text,
      provider.id,
      provider.id::text,
      pg_catalog.concat_ws(' ', provider.first_name, provider.last_name),
      pg_catalog.count(distinct reservation.appointment_id)::bigint,
      coalesce(pg_catalog.round(pg_catalog.sum(
        extract(epoch from (reservation.ends_at - reservation.starts_at)) / 60
      )), 0)::bigint
    from public.provider_reservations as reservation
    join public.providers as provider
      on provider.organization_id = reservation.organization_id
     and provider.id = reservation.provider_id
    where reservation.organization_id = v_organization_id
      and (p_branch_id is null or reservation.branch_id = p_branch_id)
      and reservation.reservation_status = 'ACTIVE'
      and reservation.reservation_kind = 'APPOINTMENT'
      and reservation.appointment_id is not null
      and reservation.starts_at >= v_window_start
      and reservation.starts_at < v_window_end
    group by provider.id, provider.first_name, provider.last_name

    union all

    select
      'resource_load'::text,
      resource.id,
      resource.id::text,
      resource.name,
      pg_catalog.count(distinct reservation.appointment_id)::bigint,
      coalesce(pg_catalog.round(pg_catalog.sum(
        extract(epoch from (reservation.ends_at - reservation.starts_at)) / 60
      )), 0)::bigint
    from public.resource_reservations as reservation
    join public.branch_resources as resource
      on resource.organization_id = reservation.organization_id
     and resource.id = reservation.resource_id
    where reservation.organization_id = v_organization_id
      and (p_branch_id is null or reservation.branch_id = p_branch_id)
      and reservation.reservation_status = 'ACTIVE'
      and reservation.reservation_kind = 'APPOINTMENT'
      and reservation.appointment_id is not null
      and reservation.starts_at >= v_window_start
      and reservation.starts_at < v_window_end
    group by resource.id, resource.name

    union all

    select
      'communication_status'::text,
      null::uuid,
      communication.channel || ':' || communication.status,
      communication.channel || ' - '
        || pg_catalog.initcap(pg_catalog.lower(communication.status)),
      pg_catalog.count(*)::bigint,
      null::bigint
    from public.communications as communication
    where communication.organization_id = v_organization_id
      and (p_branch_id is null or communication.branch_id = p_branch_id)
      and communication.created_at >= v_window_start
      and communication.created_at < v_window_end
    group by communication.channel, communication.status
  ) as breakdown
  order by breakdown.group_type, breakdown.name, breakdown.code
  limit 300;
end;
$$;

revoke all on function public.list_operational_analytics_breakdown(uuid, uuid, integer)
from public, anon, authenticated, service_role;

comment on function public.list_operational_analytics_breakdown(uuid, uuid, integer) is
  'Bounded aggregate-only OWNER/ADMIN analytics dimensions and booked-load minutes for a validated organization or branch window; no patient rows and no audit event.';
