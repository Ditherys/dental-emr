-- P1-19: harden the audit contract and project verified TOTP enrollment.

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
      'scope'
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
    else true
  end
$$;

comment on function private.audit_metadata_is_safe(jsonb) is
  'Accepts only the bounded, non-sensitive metadata keys used by Phase 1 audit writers.';

revoke all on function private.audit_metadata_is_safe(jsonb)
from public, anon, authenticated, service_role;

alter table public.audit_events
  alter column correlation_id set default gen_random_uuid()::text;

alter table public.audit_events
  add constraint audit_events_actor_identity_check check (
    (actor_type = 'USER' and actor_user_id is not null)
    or (actor_type <> 'USER' and actor_user_id is null)
  ),
  add constraint audit_events_category_format_check check (
    pg_catalog.length(category) <= 64
    and category ~ '^[A-Z][A-Z0-9_]*$'
  ),
  add constraint audit_events_action_format_check check (
    pg_catalog.length(action) <= 128
    and action ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'
  ),
  add constraint audit_events_entity_type_format_check check (
    pg_catalog.length(entity_type) <= 64
    and entity_type ~ '^[a-z][a-z0-9_]*$'
  ),
  add constraint audit_events_request_id_format_check check (
    request_id is null
    or (
      pg_catalog.length(request_id) between 1 and 128
      and request_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
    )
  ),
  add constraint audit_events_correlation_id_format_check check (
    correlation_id is null
    or (
      pg_catalog.length(correlation_id) between 1 and 128
      and correlation_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
    )
  ),
  add constraint audit_events_metadata_safe_check check (
    private.audit_metadata_is_safe(metadata)
  );

comment on column public.audit_events.correlation_id is
  'Opaque correlation identifier only; URLs, tokens, and arbitrary request values are forbidden.';

create unique index audit_events_mfa_enrollment_once_idx
  on public.audit_events (
    organization_id,
    actor_user_id,
    entity_id,
    action
  )
  where action = 'mfa.enrolled'
    and actor_user_id is not null
    and entity_id is not null;

create or replace function public.record_mfa_enrollment(
  p_factor_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := (select auth.uid());
  inserted_event_count integer;
begin
  if actor_user_id is null then
    raise insufficient_privilege using message = 'authenticated user required';
  end if;

  perform private.require_aal2();

  if not exists (
    select 1
    from auth.mfa_factors as factor
    where factor.id = p_factor_id
      and factor.user_id = actor_user_id
      and factor.factor_type = 'totp'
      and factor.status = 'verified'
  ) then
    raise insufficient_privilege using message = 'verified authenticator factor required';
  end if;

  if not exists (
    select 1
    from public.organization_members as organization_member
    join public.organizations as organization
      on organization.id = organization_member.organization_id
    where organization_member.user_id = actor_user_id
      and organization_member.membership_status = 'active'
      and organization.status = 'active'
  ) then
    raise insufficient_privilege using message = 'active organization membership required';
  end if;

  insert into public.audit_events (
    organization_id,
    actor_user_id,
    actor_type,
    category,
    action,
    entity_type,
    entity_id,
    result
  )
  select
    organization_member.organization_id,
    actor_user_id,
    'USER',
    'SECURITY',
    'mfa.enrolled',
    'mfa_factor',
    p_factor_id,
    'SUCCESS'
  from public.organization_members as organization_member
  join public.organizations as organization
    on organization.id = organization_member.organization_id
  where organization_member.user_id = actor_user_id
    and organization_member.membership_status = 'active'
    and organization.status = 'active'
  on conflict do nothing;

  get diagnostics inserted_event_count = row_count;
  return inserted_event_count;
end;
$$;

comment on function public.record_mfa_enrollment(uuid) is
  'Idempotently projects a verified current-user TOTP factor into each active tenant audit log.';

revoke all on function public.record_mfa_enrollment(uuid)
from public, anon, authenticated, service_role;
grant execute on function public.record_mfa_enrollment(uuid) to authenticated;
