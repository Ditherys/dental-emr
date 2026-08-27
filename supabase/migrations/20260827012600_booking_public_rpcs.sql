-- P13-02: the public anonymous booking surface. These four functions are the
-- only anon-reachable booking boundaries and the second deliberate public
-- surface of the system after get_public_site (P12-02). They are SECURITY
-- DEFINER with an empty search_path, never read auth.uid(), and return only the
-- bounded website-safe projections below -- slot times and a minimal
-- request/status surface. They never return or write patient, clinical,
-- workforce, internal, or audit data; submission creates only a lightweight
-- booking_requests row (plus a short-lived ACTIVE HOLD provider reservation for
-- instant-bookable procedures), never a clinical patient record.
--
-- This migration also relaxes the P6-05 provider reservation expiry rule so a
-- 5-minute ACTIVE HOLD reservation may carry an expires_at. The original
-- `reservation_status <> 'ACTIVE' OR expires_at IS NULL` constraint assumed no
-- reservation ever expires by timestamp; the P13 hold model transitions stale
-- ACTIVE holds to EXPIRED inside the booking transaction (never a bare
-- `expires_at < now()` predicate on the ACTIVE partial index), so the
-- constraint now requires: ACTIVE non-HOLD rows keep expires_at NULL (the
-- permanent appointment/block reservation invariant), while ACTIVE HOLD rows
-- must carry an expiry. This object migration grants nothing; the
-- 20260827012601 terminal owns the only anon/authenticated grants.

alter table public.provider_reservations
  drop constraint provider_reservations_active_no_expiry_check;

alter table public.provider_reservations
  add constraint provider_reservations_active_no_expiry_check check (
    reservation_status <> 'ACTIVE'
    or ((reservation_kind = 'HOLD') = (expires_at is not null))
  );

comment on constraint provider_reservations_active_no_expiry_check
  on public.provider_reservations is
  'ACTIVE appointment/block reservations never carry an expiry; ACTIVE HOLD reservations must carry one (P13 short-lived slot holds are transitioned to EXPIRED rather than matched by an expires_at predicate).';

create function public.public_get_available_slots(
  p_org_slug text,
  p_procedure_code text default null,
  p_days_ahead integer default 7
)
returns table(starts_at timestamptz, ends_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_branch_id uuid;
  v_window_start timestamptz;
  v_window_end timestamptz;
begin
  if p_days_ahead is null or p_days_ahead < 1 or p_days_ahead > 30 then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  select organization.id into v_organization_id
  from public.organizations as organization
  where organization.status = 'active'
    and organization.slug = p_org_slug;

  if v_organization_id is null then
    return;
  end if;

  select branch.id into v_branch_id
  from public.branches as branch
  where branch.organization_id = v_organization_id
    and branch.status = 'active'
    and branch.website_visible
  order by branch.created_at, branch.id
  limit 1;

  if v_branch_id is null then
    return;
  end if;

  -- The grid is anchored to the hour so every returned slot starts on a
  -- clock-aligned 15-minute boundary, which the booking UI expects. Slots that
  -- would already have started are excluded by the lead-buffer predicate.
  v_window_start := date_trunc('hour', statement_timestamp());
  v_window_end := v_window_start + make_interval(days => p_days_ahead);

  return query
  with procs as (
    select
      procedure.id as procedure_id,
      coalesce(procedure.default_duration_minutes, 30) as duration_minutes
    from public.procedures as procedure
    where procedure.organization_id = v_organization_id
      and procedure.status = 'active'
      and procedure.website_visible
      and procedure.online_booking_enabled
      and procedure.booking_mode <> 'REQUEST_ONLY'
      and (p_procedure_code is null or procedure.code = p_procedure_code)
  ),
  providers as (
    select provider_branch.provider_id
    from public.provider_branches as provider_branch
    join public.providers as provider
      on provider.id = provider_branch.provider_id
     and provider.organization_id = provider_branch.organization_id
    where provider_branch.organization_id = v_organization_id
      and provider_branch.branch_id = v_branch_id
      and provider_branch.is_active
      and provider.status = 'active'
  ),
  grid as (
    select slot.value as starts_at
    from pg_catalog.generate_series(
      v_window_start,
      v_window_end,
      interval '15 minutes'
    ) as slot(value)
    where slot.value > statement_timestamp()
  ),
  candidates as (
    select
      provider.provider_id as provider_id,
      grid.starts_at as starts_at,
      grid.starts_at + make_interval(mins => proc.duration_minutes) as ends_at
    from procs as proc
    cross join providers as provider
    cross join grid
  )
  select distinct candidate.starts_at, candidate.ends_at
  from candidates as candidate
  where candidate.ends_at <= v_window_end
    and exists (
      select 1
      from public.provider_availability_rules as rule
      where rule.organization_id = v_organization_id
        and rule.provider_id = candidate.provider_id
        and rule.branch_id = v_branch_id
        and rule.active
        and rule.weekday = EXTRACT(DOW FROM candidate.starts_at)
        and rule.valid_from <= candidate.starts_at::date
        and (rule.valid_to is null or rule.valid_to >= candidate.starts_at::date)
        and rule.starts_at_local <= candidate.starts_at::time
        and rule.ends_at_local >= candidate.ends_at::time
    )
    and not exists (
      select 1
      from public.provider_schedule_exceptions as exception
      where exception.organization_id = v_organization_id
        and exception.provider_id = candidate.provider_id
        and (exception.branch_id is null or exception.branch_id = v_branch_id)
        and exception.exception_type in ('UNAVAILABLE', 'LEAVE')
        and exception.starts_at < candidate.ends_at
        and exception.ends_at > candidate.starts_at
    )
    and not exists (
      select 1
      from public.provider_reservations as reservation
      where reservation.organization_id = v_organization_id
        and reservation.provider_id = candidate.provider_id
        and reservation.reservation_status = 'ACTIVE'
        and reservation.starts_at < candidate.ends_at
        and reservation.ends_at > candidate.starts_at
    )
  order by candidate.starts_at, candidate.ends_at
  limit 50;
end;
$$;

revoke all on function public.public_get_available_slots(text, text, integer)
from public, anon, authenticated, service_role;

comment on function public.public_get_available_slots(text, text, integer) is
  'Anonymous read of deterministic 15-minute-grid slot starts for website-visible instant-bookable procedures at the organization resolved by slug. Enumerates only providers assigned and active at the first website-visible active branch, requires a covering active availability rule and no UNAVAILABLE/LEAVE exception, and excludes every slot overlapping an ACTIVE provider reservation (any kind, so HOLDs and appointments both block). Unknown or inactive slugs and procedures that are not website-visible instant-bookable yield no rows; never returns patient, clinical, or internal data.';

create function public.public_submit_booking_request(
  p_org_slug text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payload jsonb;
  v_first_name text;
  v_last_name text;
  v_birth_date date;
  v_mobile text;
  v_mobile_normalized text;
  v_email text;
  v_email_normalized text;
  v_procedure_code text;
  v_provider_id uuid;
  v_starts_at timestamptz;
  v_idempotency_key text;
  v_acquisition_source_code text;
  v_organization_id uuid;
  v_branch_id uuid;
  v_procedure_id uuid;
  v_duration_minutes integer;
  v_booking_mode text;
  v_online_booking_enabled boolean;
  v_ends_at timestamptz;
  v_is_instant boolean := false;
  v_request_id uuid;
  v_existing_status text;
  v_management_token text;
  v_hold_expires_at timestamptz;
begin
  v_payload := p_payload;

  if p_org_slug is null
     or v_payload is null
     or jsonb_typeof(v_payload) <> 'object'
     or pg_column_size(v_payload) > 8192
     or exists (
       select 1 from jsonb_object_keys(v_payload) as key
       where key not in (
         'firstName',
         'lastName',
         'birthDate',
         'mobile',
         'email',
         'requestedProcedureCode',
         'requestedProviderId',
         'requestedStartsAt',
         'idempotencyKey',
         'acquisitionSourceCode'
       )
     ) then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  v_first_name := nullif(v_payload ->> 'firstName', '');
  v_last_name := nullif(v_payload ->> 'lastName', '');
  v_mobile := nullif(v_payload ->> 'mobile', '');
  v_email := nullif(v_payload ->> 'email', '');
  v_procedure_code := nullif(v_payload ->> 'requestedProcedureCode', '');
  v_idempotency_key := nullif(v_payload ->> 'idempotencyKey', '');
  v_acquisition_source_code := nullif(v_payload ->> 'acquisitionSourceCode', '');

  if v_first_name is null
     or pg_catalog.length(v_first_name) > 120
     or private.normalize_patient_name(v_first_name) is null
     or v_last_name is null
     or pg_catalog.length(v_last_name) > 120
     or private.normalize_patient_name(v_last_name) is null
     or v_mobile is null
     or pg_catalog.length(v_mobile) > 40
     or (v_email is not null and pg_catalog.length(v_email) > 320)
     or v_procedure_code is null
     or v_idempotency_key is null
     or pg_catalog.length(v_idempotency_key) < 8
     or pg_catalog.length(v_idempotency_key) > 128 then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  v_mobile_normalized := private.normalize_patient_mobile(v_mobile);
  if v_mobile_normalized is null then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  if v_email is not null then
    v_email_normalized := private.normalize_patient_email(v_email);
    if v_email_normalized is null then
      raise invalid_parameter_value using message = 'invalid input';
    end if;
  end if;

  begin
    v_birth_date := (v_payload ->> 'birthDate')::date;
  exception when others then
    raise invalid_parameter_value using message = 'invalid input';
  end;

  if v_birth_date is null
     or v_birth_date < date '1900-01-01'
     or v_birth_date > current_date then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  if v_payload ? 'requestedStartsAt'
     and v_payload ->> 'requestedStartsAt' is not null then
    begin
      v_starts_at := (v_payload ->> 'requestedStartsAt')::timestamptz;
    exception when others then
      raise invalid_parameter_value using message = 'invalid input';
    end;
  end if;

  if v_payload ? 'requestedProviderId'
     and v_payload ->> 'requestedProviderId' is not null then
    begin
      v_provider_id := (v_payload ->> 'requestedProviderId')::uuid;
    exception when others then
      raise invalid_parameter_value using message = 'invalid input';
    end;
  end if;

  select organization.id into v_organization_id
  from public.organizations as organization
  where organization.status = 'active'
    and organization.slug = p_org_slug;

  if v_organization_id is null then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  select branch.id into v_branch_id
  from public.branches as branch
  where branch.organization_id = v_organization_id
    and branch.status = 'active'
    and branch.website_visible
  order by branch.created_at, branch.id
  limit 1;

  if v_branch_id is null then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  select
    procedure.id,
    procedure.booking_mode,
    procedure.online_booking_enabled,
    coalesce(procedure.default_duration_minutes, 30)
  into v_procedure_id, v_booking_mode, v_online_booking_enabled, v_duration_minutes
  from public.procedures as procedure
  where procedure.organization_id = v_organization_id
    and procedure.code = v_procedure_code
    and procedure.status = 'active'
    and procedure.website_visible;

  if not found then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  v_is_instant := (v_online_booking_enabled and v_booking_mode <> 'REQUEST_ONLY');

  if v_provider_id is not null and not exists (
    select 1
    from public.providers as provider
    join public.provider_branches as provider_branch
      on provider_branch.organization_id = provider.organization_id
     and provider_branch.provider_id = provider.id
     and provider_branch.branch_id = v_branch_id
     and provider_branch.is_active
    where provider.id = v_provider_id
      and provider.organization_id = v_organization_id
      and provider.status = 'active'
  ) then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  if v_acquisition_source_code is not null and not exists (
    select 1
    from public.acquisition_sources as source
    where source.code = v_acquisition_source_code
      and source.is_active
      and (source.organization_id is null or source.organization_id = v_organization_id)
  ) then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  if v_is_instant then
    if v_starts_at is null then
      raise invalid_parameter_value using message = 'invalid input';
    end if;
    v_ends_at := v_starts_at + make_interval(mins => v_duration_minutes);
  elsif v_starts_at is not null then
    v_ends_at := v_starts_at + make_interval(mins => v_duration_minutes);
  end if;

  if v_starts_at is not null and v_starts_at <= statement_timestamp() then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  if v_is_instant then
    if v_provider_id is null then
      select provider_branch.provider_id into v_provider_id
      from public.provider_branches as provider_branch
      join public.providers as provider
        on provider.id = provider_branch.provider_id
       and provider.organization_id = provider_branch.organization_id
      where provider_branch.organization_id = v_organization_id
        and provider_branch.branch_id = v_branch_id
        and provider_branch.is_active
        and provider.status = 'active'
        and exists (
          select 1
          from public.provider_availability_rules as rule
          where rule.organization_id = v_organization_id
            and rule.provider_id = provider_branch.provider_id
            and rule.branch_id = v_branch_id
            and rule.active
            and rule.weekday = EXTRACT(DOW FROM v_starts_at)
            and rule.valid_from <= v_starts_at::date
            and (rule.valid_to is null or rule.valid_to >= v_starts_at::date)
            and rule.starts_at_local <= v_starts_at::time
            and rule.ends_at_local >= v_ends_at::time
        )
        and not exists (
          select 1
          from public.provider_schedule_exceptions as exception
          where exception.organization_id = v_organization_id
            and exception.provider_id = provider_branch.provider_id
            and (exception.branch_id is null or exception.branch_id = v_branch_id)
            and exception.exception_type in ('UNAVAILABLE', 'LEAVE')
            and exception.starts_at < v_ends_at
            and exception.ends_at > v_starts_at
        )
      order by provider.last_name, provider.first_name, provider_branch.provider_id
      limit 1;
    end if;

    if v_provider_id is null then
      raise exception using message = 'slot unavailable';
    end if;

    if not exists (
      select 1
      from public.provider_availability_rules as rule
      where rule.organization_id = v_organization_id
        and rule.provider_id = v_provider_id
        and rule.branch_id = v_branch_id
        and rule.active
        and rule.weekday = EXTRACT(DOW FROM v_starts_at)
        and rule.valid_from <= v_starts_at::date
        and (rule.valid_to is null or rule.valid_to >= v_starts_at::date)
        and rule.starts_at_local <= v_starts_at::time
        and rule.ends_at_local >= v_ends_at::time
    ) or exists (
      select 1
      from public.provider_schedule_exceptions as exception
      where exception.organization_id = v_organization_id
        and exception.provider_id = v_provider_id
        and (exception.branch_id is null or exception.branch_id = v_branch_id)
        and exception.exception_type in ('UNAVAILABLE', 'LEAVE')
        and exception.starts_at < v_ends_at
        and exception.ends_at > v_starts_at
    ) then
      raise exception using message = 'slot unavailable';
    end if;
  end if;

  v_management_token := gen_random_uuid()::text;

  begin
    insert into public.booking_requests (
      organization_id, branch_id, requested_procedure_id, requested_provider_id,
      requested_starts_at, requested_ends_at, first_name, last_name, birth_date,
      mobile, email, acquisition_source_code, booking_channel_code,
      request_status, management_token_hash, idempotency_key
    ) values (
      v_organization_id, v_branch_id, v_procedure_id, v_provider_id,
      v_starts_at, v_ends_at, btrim(v_first_name), btrim(v_last_name), v_birth_date,
      v_mobile, v_email, v_acquisition_source_code, 'WEBSITE',
      'SUBMITTED', encode(sha256(v_management_token::bytea), 'hex'), v_idempotency_key
    )
    returning id into v_request_id;
  exception
    when unique_violation then
      select request.id, request.request_status
      into v_request_id, v_existing_status
      from public.booking_requests as request
      where request.organization_id = v_organization_id
        and request.idempotency_key = v_idempotency_key;

      return jsonb_build_object(
        'requestId', v_request_id,
        'managementToken', null,
        'status', v_existing_status,
        'holdExpiresAt', null
      );
  end;

  if v_is_instant then
    -- Serialize bookings per provider+org so concurrent submissions for the
    -- same slot cannot deadlock on the HOLD exclusion insert or the stale-hold
    -- update; different providers proceed in parallel.
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(v_organization_id::text || ':' || v_provider_id::text, 0)
    );

    update public.provider_reservations
    set reservation_status = 'EXPIRED'
    where organization_id = v_organization_id
      and provider_id = v_provider_id
      and reservation_kind = 'HOLD'
      and reservation_status = 'ACTIVE'
      and expires_at < statement_timestamp()
      and starts_at < v_ends_at
      and ends_at > v_starts_at;

    v_hold_expires_at := statement_timestamp() + interval '5 minutes';

    begin
      insert into public.provider_reservations (
        organization_id, provider_id, branch_id, starts_at, ends_at,
        reservation_kind, reservation_status, expires_at
      ) values (
        v_organization_id, v_provider_id, v_branch_id, v_starts_at, v_ends_at,
        'HOLD', 'ACTIVE', v_hold_expires_at
      );
    exception
      when exclusion_violation then
        raise exception using message = 'slot unavailable';
    end;
  end if;

  return jsonb_build_object(
    'requestId', v_request_id,
    'managementToken', v_management_token,
    'status', 'SUBMITTED',
    'holdExpiresAt', v_hold_expires_at
  );
end;
$$;

revoke all on function public.public_submit_booking_request(text, jsonb)
from public, anon, authenticated, service_role;

comment on function public.public_submit_booking_request(text, jsonb) is
  'Anonymous submission of a minimal website booking request. Accepts exactly the allowlisted keys, resolves the active organization by slug plus its first website-visible active branch, validates the procedure/provider/acquisition-source/idempotency bounds, and inserts a lightweight SUBMITTED booking_requests row with only a SHA-256 management-token hash stored. Instant-bookable procedures additionally expire stale ACTIVE HOLD reservations for the provider/slot and acquire a 5-minute ACTIVE HOLD provider reservation, with the partial GiST exclusion constraint as the double-book backstop (an overlap raises slot unavailable and rolls the submission back). REQUEST_ONLY or disabled procedures create no hold. Duplicate idempotency keys are no-ops returning the existing request with no management token. No audit event and no clinical patient record are written.';

create function public.public_get_booking_status(
  p_request_id uuid,
  p_management_token_hash text
)
returns table(request_id uuid, request_status text, created_at timestamptz, converted bool)
language sql
stable
security definer
set search_path = ''
as $$
  select
    request.id,
    request.request_status,
    request.created_at,
    request.request_status = 'CONVERTED'
  from public.booking_requests as request
  where request.id = p_request_id
    and request.management_token_hash = p_management_token_hash;
$$;

revoke all on function public.public_get_booking_status(uuid, text)
from public, anon, authenticated, service_role;

comment on function public.public_get_booking_status(uuid, text) is
  'Anonymous bounded booking-status lookup matched by the stored management-token hash. Returns only request id, status, created_at, and a converted flag; an unknown request or wrong hash returns no row and no patient or clinical data is ever exposed.';

create function public.public_cancel_booking_request(
  p_request_id uuid,
  p_management_token_hash text
)
returns table(request_id uuid, request_status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.booking_requests%rowtype;
begin
  if p_request_id is null or p_management_token_hash is null then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  select request.* into v_request
  from public.booking_requests as request
  where request.id = p_request_id
  for update;

  if not found
     or v_request.management_token_hash is distinct from p_management_token_hash then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if v_request.request_status = 'CANCELLED' then
    request_id := v_request.id;
    request_status := v_request.request_status;
    return next;
    return;
  end if;

  if v_request.request_status not in ('SUBMITTED', 'UNDER_REVIEW') then
    raise exception using errcode = 'P0001', message = 'invalid state';
  end if;

  update public.provider_reservations
  set reservation_status = 'RELEASED'
  where organization_id = v_request.organization_id
    and provider_id = v_request.requested_provider_id
    and reservation_kind = 'HOLD'
    and reservation_status = 'ACTIVE'
    and expires_at is not null
    and starts_at = v_request.requested_starts_at
    and ends_at = v_request.requested_ends_at;

  update public.booking_requests
  set request_status = 'CANCELLED',
      version = v_request.version + 1
  where id = v_request.id
    and organization_id = v_request.organization_id
  returning id, public.booking_requests.request_status into request_id, request_status;

  return next;
end;
$$;

revoke all on function public.public_cancel_booking_request(uuid, text)
from public, anon, authenticated, service_role;

comment on function public.public_cancel_booking_request(uuid, text) is
  'Anonymous cancellation of a SUBMITTED/UNDER_REVIEW booking request matched by the stored management-token hash. Moves the request to CANCELLED under a version bump and releases the matching ACTIVE HOLD provider reservation (by provider, request window, and a non-null expiry); a request without a hold or already cancelled is a safe no-op. A wrong or missing hash is indistinguishable from an unknown request and is denied. No audit event is written because the caller is anonymous; the request row is the record.';