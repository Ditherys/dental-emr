-- B6: narrow transactional billing boundary. Every function is SECURITY
-- DEFINER with an empty search path, derives actor/tenant/branch server-side,
-- appends a bounded audit event atomically, and receives only the exact grants
-- in 20260828010501_billing_rpcs_grants.sql. No base-table access exists.

-- Extend the audit metadata allowlist with the bounded non-clinical billing
-- keys. Cheque numbers, bank names, payment references, patient names, amounts,
-- and clinical narrative are never written into audit metadata.
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
    when candidate - array[
      'invitation_id',
      'permission_code',
      'role_code',
      'scope',
      'charge_id',
      'payment_id',
      'allocation_id',
      'refund_id',
      'cheque_id',
      'adjustment_id',
      'direct_cost_id',
      'resolution_id',
      'agreement_id',
      'provider_id',
      'procedure_id',
      'treatment_plan_item_id',
      'appointment_id',
       'attribution_previous_provider',
       'attribution_corrected_provider',
       'service_date',
       'reason',
       'note',
       'idempotency_key',
       'cause',
       'direction',
       'cost_type',
       'method_code',
       'from_status',
       'to_status'
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
    when candidate ? 'service_date' and not (
      pg_catalog.jsonb_typeof(candidate -> 'service_date') = 'string'
      and candidate ->> 'service_date' ~ '^\d{4}-\d{2}-\d{2}$'
    ) then false
    when candidate ? 'reason' and not (
      pg_catalog.jsonb_typeof(candidate -> 'reason') = 'string'
      and pg_catalog.length(candidate ->> 'reason') <= 500
    ) then false
    when candidate ? 'note' and not (
      pg_catalog.jsonb_typeof(candidate -> 'note') = 'string'
      and pg_catalog.length(candidate ->> 'note') <= 256
    ) then false
    when candidate ? 'idempotency_key' and not (
      pg_catalog.jsonb_typeof(candidate -> 'idempotency_key') = 'string'
      and pg_catalog.length(candidate ->> 'idempotency_key') <= 128
    ) then false
    when candidate ? 'cause' and not (
      pg_catalog.jsonb_typeof(candidate -> 'cause') = 'string'
      and candidate ->> 'cause' in ('DIRECT_COST','ATTRIBUTION','REFUND','VOID','REALLOCATION')
    ) then false
    when candidate ? 'direction' and not (
      pg_catalog.jsonb_typeof(candidate -> 'direction') = 'string'
      and candidate ->> 'direction' in ('CREDIT','DEBIT')
    ) then false
    when candidate ? 'cost_type' and not (
      pg_catalog.jsonb_typeof(candidate -> 'cost_type') = 'string'
      and candidate ->> 'cost_type' in ('LAB','MATERIAL','OTHER')
    ) then false
    when candidate ? 'method_code' and not (
      pg_catalog.jsonb_typeof(candidate -> 'method_code') = 'string'
      and pg_catalog.length(candidate ->> 'method_code') <= 40
    ) then false
    when candidate ? 'from_status' and not (
      pg_catalog.jsonb_typeof(candidate -> 'from_status') = 'string'
      and candidate ->> 'from_status' in ('HELD','DEPOSITED','BOUNCED')
    ) then false
    when candidate ? 'to_status' and not (
      pg_catalog.jsonb_typeof(candidate -> 'to_status') = 'string'
      and candidate ->> 'to_status' in ('DEPOSITED','CLEARED','BOUNCED','CANCELLED','REPLACED')
    ) then false
    when candidate ? 'attribution_previous_provider' and not (
      pg_catalog.jsonb_typeof(candidate -> 'attribution_previous_provider') = 'string'
      and candidate ->> 'attribution_previous_provider' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    ) then false
    when candidate ? 'attribution_corrected_provider' and not (
      pg_catalog.jsonb_typeof(candidate -> 'attribution_corrected_provider') = 'string'
      and candidate ->> 'attribution_corrected_provider' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    ) then false
    when candidate ? 'charge_id' and not (
      pg_catalog.jsonb_typeof(candidate -> 'charge_id') = 'string'
      and candidate ->> 'charge_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    ) then false
    when candidate ? 'payment_id' and not (
      pg_catalog.jsonb_typeof(candidate -> 'payment_id') = 'string'
      and candidate ->> 'payment_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    ) then false
    when candidate ? 'allocation_id' and not (
      pg_catalog.jsonb_typeof(candidate -> 'allocation_id') = 'string'
      and candidate ->> 'allocation_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    ) then false
    when candidate ? 'refund_id' and not (
      pg_catalog.jsonb_typeof(candidate -> 'refund_id') = 'string'
      and candidate ->> 'refund_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    ) then false
    when candidate ? 'cheque_id' and not (
      pg_catalog.jsonb_typeof(candidate -> 'cheque_id') = 'string'
      and candidate ->> 'cheque_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    ) then false
    when candidate ? 'adjustment_id' and not (
      pg_catalog.jsonb_typeof(candidate -> 'adjustment_id') = 'string'
      and candidate ->> 'adjustment_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    ) then false
    when candidate ? 'direct_cost_id' and not (
      pg_catalog.jsonb_typeof(candidate -> 'direct_cost_id') = 'string'
      and candidate ->> 'direct_cost_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    ) then false
    when candidate ? 'resolution_id' and not (
      pg_catalog.jsonb_typeof(candidate -> 'resolution_id') = 'string'
      and candidate ->> 'resolution_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    ) then false
    when candidate ? 'agreement_id' and not (
      pg_catalog.jsonb_typeof(candidate -> 'agreement_id') = 'string'
      and candidate ->> 'agreement_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    ) then false
    when candidate ? 'provider_id' and not (
      pg_catalog.jsonb_typeof(candidate -> 'provider_id') = 'string'
      and candidate ->> 'provider_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    ) then false
    when candidate ? 'procedure_id' and not (
      pg_catalog.jsonb_typeof(candidate -> 'procedure_id') = 'string'
      and candidate ->> 'procedure_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    ) then false
    when candidate ? 'treatment_plan_item_id' and not (
      pg_catalog.jsonb_typeof(candidate -> 'treatment_plan_item_id') = 'string'
      and candidate ->> 'treatment_plan_item_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    ) then false
    when candidate ? 'appointment_id' and not (
      pg_catalog.jsonb_typeof(candidate -> 'appointment_id') = 'string'
      and candidate ->> 'appointment_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    ) then false
    else true
  end
$$;

revoke all on function private.audit_metadata_is_safe(jsonb)
from public, anon, authenticated, service_role;

comment on function private.audit_metadata_is_safe(jsonb) is
  'Accepts only the bounded, non-sensitive metadata keys used by audit writers, including the Phase 1 identity keys, the Phase 6-13 scheduling/booking/document keys, and the Phase 14 clinical keys plus the B6 billing identifier/state keys.';

create or replace function private.has_billing_permission_at_branch(
  p_acting_branch_id uuid,
  p_permission_code text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_permission_code in (
    'billing.read', 'billing.charge', 'payment.record', 'billing.adjust',
    'billing.attribution.override', 'compensation.manage', 'compensation.own.read',
    'financial.analytics.read'
  ) and exists (
    select 1
    from public.branches as branch
    join public.organizations as organization
      on organization.id = branch.organization_id
     and organization.status = 'active'
    join public.organization_members as organization_member
      on organization_member.organization_id = organization.id
     and organization_member.user_id = (select auth.uid())
     and organization_member.membership_status = 'active'
    join public.member_roles as member_role
      on member_role.organization_id = organization_member.organization_id
     and member_role.organization_member_id = organization_member.id
    join public.roles as role
      on role.id = member_role.role_id
     and (role.organization_id is null or role.organization_id = organization.id)
    join public.role_permissions as role_permission
      on role_permission.role_id = role.id
    join public.permissions as permission
      on permission.id = role_permission.permission_id
     and permission.code = p_permission_code
    where branch.id = p_acting_branch_id
      and branch.status = 'active'
      and (
        member_role.branch_id is null
        or (
          member_role.branch_id = branch.id
          and exists (
            select 1
            from public.branch_memberships as branch_membership
            where branch_membership.organization_id = organization.id
              and branch_membership.organization_member_id = organization_member.id
              and branch_membership.branch_id = branch.id
              and branch_membership.access_status = 'active'
          )
        )
      )
  );
$$;
revoke all on function private.has_billing_permission_at_branch(uuid, text)
from public, anon, authenticated, service_role;

comment on function private.has_billing_permission_at_branch(uuid, text) is
  'Current-user financial permission check scoped to an active acting branch with org-wide or exact-branch role coverage.';

create or replace function private.resolve_actor_provider(p_organization_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select provider.id
  from public.providers as provider
  where provider.organization_id = p_organization_id
    and provider.linked_user_id = (select auth.uid())
    and provider.status = 'active'
  order by provider.created_at
  limit 1;
$$;
revoke all on function private.resolve_actor_provider(uuid)
from public, anon, authenticated, service_role;

comment on function private.resolve_actor_provider(uuid) is
  'Resolves the current user''s active same-organization provider record; never accepts a client-chosen provider.';

create or replace function private.charge_is_voided(p_charge_id uuid, p_organization_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.charge_voids as void
    where void.charge_id = p_charge_id and void.organization_id = p_organization_id
  );
$$;
revoke all on function private.charge_is_voided(uuid,uuid) from public, anon, authenticated, service_role;

create or replace function private.charge_current_attribution(p_charge_id uuid, p_organization_id uuid)
returns table(provider_id uuid, branch_id uuid, service_date date)
language sql
stable
set search_path = ''
as $$
  select attribution.provider_id, attribution.branch_id, attribution.service_date
  from (
    select charge.provider_id, charge.branch_id, charge.service_date,
           charge.posted_at as occurred_at, charge.id as source_id
    from public.charges as charge
    where charge.id = p_charge_id and charge.organization_id = p_organization_id
    union all
    select correction.corrected_provider_id, correction.corrected_branch_id, correction.corrected_service_date,
           correction.occurred_at, correction.id
    from public.charge_attribution_corrections as correction
    where correction.charge_id = p_charge_id and correction.organization_id = p_organization_id
  ) as attribution
  order by attribution.occurred_at desc, attribution.source_id desc
  limit 1;
$$;
revoke all on function private.charge_current_attribution(uuid,uuid) from public, anon, authenticated, service_role;

create or replace function private.charge_current_resolution(p_charge_id uuid, p_organization_id uuid)
returns table(state text, agreement_id uuid, rate_bps integer, basis text)
language sql
stable
set search_path = ''
as $$
  select resolution.state, resolution.agreement_id, resolution.rate_bps, resolution.basis
  from public.charge_compensation_resolutions as resolution
  where resolution.charge_id = p_charge_id and resolution.organization_id = p_organization_id
  order by resolution.occurred_at desc, resolution.id desc
  limit 1;
$$;
revoke all on function private.charge_current_resolution(uuid,uuid) from public, anon, authenticated, service_role;

-- Append the signed earning delta that reconciles a charge's cumulative earning
-- target to its posted entries. Called under the charge row lock by every
-- allocation/cost/correction mutation; no-op for unresolved compensation.
create or replace function private.sync_charge_earnings(
  p_organization_id uuid,
  p_charge_id uuid,
  p_cause text
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_provider uuid;
  v_branch uuid;
  v_service_date date;
  v_resolution_state text;
  v_agreement_id uuid;
  v_rate_bps integer;
  v_basis text;
  v_allocated bigint;
  v_net_cost bigint;
  v_target bigint;
  v_posted bigint;
  v_delta bigint;
begin
  select attribution.provider_id, attribution.branch_id, attribution.service_date
    into v_provider, v_branch, v_service_date
  from private.charge_current_attribution(p_charge_id, p_organization_id) as attribution;

  if v_provider is null then
    return;
  end if;

  select resolution.state, resolution.agreement_id, resolution.rate_bps, resolution.basis
    into v_resolution_state, v_agreement_id, v_rate_bps, v_basis
  from private.charge_current_resolution(p_charge_id, p_organization_id) as resolution;

  if v_resolution_state is null or v_resolution_state <> 'RESOLVED' then
    return;
  end if;

  v_allocated := private.charge_net_allocated(p_charge_id, p_organization_id);
  v_net_cost := coalesce((
    select sum(entry.amount_centavos) from public.charge_direct_costs as entry
    where entry.charge_id = p_charge_id and entry.organization_id = p_organization_id and entry.event_type = 'APPROVAL'
  ), 0::bigint) - coalesce((
    select sum(entry.amount_centavos) from public.charge_direct_costs as entry
    where entry.charge_id = p_charge_id and entry.organization_id = p_organization_id and entry.event_type = 'REVERSAL'
  ), 0::bigint);

  v_target := private.earning_cumulative_target(v_basis, v_allocated, v_net_cost, v_rate_bps);

  select coalesce(sum(entry.earning_centavos), 0::bigint) into v_posted
  from public.provider_earning_entries as entry
  where entry.charge_id = p_charge_id
    and entry.organization_id = p_organization_id
    and entry.provider_id = v_provider;

  v_delta := v_target - v_posted;

  if v_delta <> 0 then
    insert into public.provider_earning_entries (
      organization_id, provider_id, charge_id, entry_type, cause,
      eligible_basis_centavos, net_approved_cost_centavos, rate_bps,
      earning_centavos, created_by, idempotency_key
    ) values (
      p_organization_id, v_provider, p_charge_id,
      case when v_delta > 0 then 'ACCRUAL' else 'REVERSAL' end,
      p_cause, v_allocated, v_net_cost, v_rate_bps, v_delta,
      (select auth.uid()), 'earn-' || p_charge_id::text || '-' || p_cause || '-' || gen_random_uuid()::text
    );
  end if;
end;
$$;
revoke all on function private.sync_charge_earnings(uuid,uuid,text)
from public, anon, authenticated, service_role;

-- Private audit writer used by every billing RPC. Audit metadata is bounded and
-- validated by private.audit_metadata_is_safe.
create or replace function private.record_billing_audit(
  p_organization_id uuid,
  p_branch_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_patient_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if not private.audit_metadata_is_safe(p_metadata) then
    raise check_violation using message = 'billing audit metadata is not bounded';
  end if;
  insert into public.audit_events (
    organization_id, branch_id, actor_user_id, actor_type, category, action,
    entity_type, entity_id, patient_id, result, metadata
  ) values (
    p_organization_id, p_branch_id, (select auth.uid()), 'USER', 'BILLING',
    p_action, p_entity_type, p_entity_id, p_patient_id, 'SUCCESS', p_metadata
  );
end;
$$;
revoke all on function private.record_billing_audit(uuid,uuid,text,text,uuid,uuid,jsonb)
from public, anon, authenticated, service_role;-- Bounded patient account statement. The actor must hold billing.read at the
-- acting branch and the patient must be readable; branch-scoped actors see only
-- events from branches where their active billing.read assignment applies.
create function public.list_patient_account(
  p_acting_branch_id uuid,
  p_patient_id uuid
)
returns table(
  event_type text,
  entity_id uuid,
  occurred_at timestamptz,
  service_date date,
  branch_id uuid,
  amount_centavos bigint,
  payment_method_code text,
  provider_id uuid,
  procedure_id uuid,
  status text,
  note text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_patient_organization_id uuid;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or (select auth.uid()) is null
     or not private.has_billing_permission_at_branch(p_acting_branch_id, 'billing.read') then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  select patient.organization_id into v_patient_organization_id
  from public.patients as patient where patient.id = p_patient_id;

  if v_patient_organization_id is null or v_patient_organization_id <> v_organization_id then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if not private.has_shared_patient_permission(v_organization_id, 'patient.demographics.read') then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  return query
  select 'CHARGE'::text, charge.id, charge.posted_at, charge.service_date, charge.branch_id,
         charge.amount_centavos, null::text, charge.provider_id, charge.procedure_id,
         case when exists (select 1 from public.charge_voids as void where void.charge_id = charge.id) then 'VOIDED' else 'POSTED' end,
         null::text
  from public.charges as charge
  where charge.organization_id = v_organization_id and charge.patient_id = p_patient_id
    and private.has_billing_permission_at_branch(charge.branch_id, 'billing.read')
  union all
  select 'ADJUSTMENT'::text, adjustment.id, adjustment.occurred_at, null::date, charge.branch_id,
         case adjustment.direction when 'CREDIT' then -adjustment.amount_centavos else adjustment.amount_centavos end,
         null::text, null, null,
         case when exists (select 1 from public.charge_adjustment_reversals as reversal where reversal.adjustment_id = adjustment.id) then 'REVERSED' else 'POSTED' end,
         null::text
  from public.charge_adjustments as adjustment
  join public.charges as charge on charge.id = adjustment.charge_id and charge.organization_id = adjustment.organization_id
  where adjustment.organization_id = v_organization_id and charge.patient_id = p_patient_id
    and private.has_billing_permission_at_branch(charge.branch_id, 'billing.read')
  union all
  select 'PAYMENT'::text, payment.id, payment.received_at, null::date, payment.branch_id,
         payment.amount_centavos, method.code, null, null,
         case when exists (select 1 from public.payment_voids as void where void.payment_id = payment.id) then 'VOIDED' else 'POSTED' end,
         null::text
  from public.payments as payment
  join public.payment_methods as method on method.id = payment.payment_method_id and method.organization_id = payment.organization_id
  where payment.organization_id = v_organization_id and payment.patient_id = p_patient_id
    and private.has_billing_permission_at_branch(payment.branch_id, 'billing.read')
  union all
  select 'PAYMENT_VOID'::text, void.id, void.voided_at, null::date, payment.branch_id,
         -payment.amount_centavos, method.code, null, null, 'VOIDED', null::text
  from public.payment_voids as void
  join public.payments as payment on payment.id = void.payment_id and payment.organization_id = void.organization_id
  join public.payment_methods as method on method.id = payment.payment_method_id and method.organization_id = payment.organization_id
  where void.organization_id = v_organization_id and payment.patient_id = p_patient_id
    and private.has_billing_permission_at_branch(payment.branch_id, 'billing.read')
  union all
  select 'ALLOCATION'::text, allocation.id, allocation.allocated_at, null::date, charge.branch_id,
         allocation.amount_centavos, method.code, null, null, 'POSTED', null::text
  from public.payment_allocations as allocation
  join public.payments as payment on payment.id = allocation.payment_id and payment.organization_id = allocation.organization_id
  join public.payment_methods as method on method.id = payment.payment_method_id and method.organization_id = payment.organization_id
  join public.charges as charge on charge.id = allocation.charge_id and charge.organization_id = allocation.organization_id
  where allocation.organization_id = v_organization_id and allocation.patient_id = p_patient_id
    and private.has_billing_permission_at_branch(charge.branch_id, 'billing.read')
  union all
  select 'ALLOCATION_REVERSAL'::text, reversal.id, reversal.reversed_at, null::date, charge.branch_id,
         -reversal.amount_centavos, method.code, null, null, 'REVERSED', reversal.reason
  from public.payment_allocation_reversals as reversal
  join public.payment_allocations as allocation on allocation.id = reversal.allocation_id and allocation.organization_id = reversal.organization_id
  join public.payments as payment on payment.id = allocation.payment_id and payment.organization_id = allocation.organization_id
  join public.payment_methods as method on method.id = payment.payment_method_id and method.organization_id = payment.organization_id
  join public.charges as charge on charge.id = allocation.charge_id and charge.organization_id = allocation.organization_id
  where reversal.organization_id = v_organization_id and allocation.patient_id = p_patient_id
    and private.has_billing_permission_at_branch(charge.branch_id, 'billing.read')
  union all
  select 'REFUND'::text, refund.id, refund.refunded_at, null::date, payment.branch_id,
         -refund.amount_centavos, method.code, null, null, 'POSTED', null::text
  from public.payment_refunds as refund
  join public.payments as payment on payment.id = refund.payment_id and payment.organization_id = refund.organization_id
  join public.payment_methods as method on method.id = payment.payment_method_id and method.organization_id = payment.organization_id
  where refund.organization_id = v_organization_id and refund.patient_id = p_patient_id
    and private.has_billing_permission_at_branch(payment.branch_id, 'billing.read')
  union all
  select 'PDC_PENDING'::text, cheque.id, cheque.created_at, null::date, cheque.branch_id,
         cheque.amount_centavos, 'CHEQUE', null, null, cheque.status, null::text
  from public.postdated_cheques as cheque
  where cheque.organization_id = v_organization_id and cheque.patient_id = p_patient_id
    and cheque.status not in ('CLEARED','CANCELLED','REPLACED')
    and private.has_billing_permission_at_branch(cheque.branch_id, 'billing.read')
  order by occurred_at, event_type, entity_id;
end;
$$;
revoke all on function public.list_patient_account(uuid,uuid)
from public, anon, authenticated, service_role;
comment on function public.list_patient_account(uuid,uuid) is
  'Bounded, branch-filtered patient account statement; no base-table access and no sensitive metadata.';

-- Post a confirmed actual charge. Ordinary dentists resolve their own treating
-- provider server-side (with appointment assignment matching); BILLING-role
-- posters inherit provider/patient/branch/service date from an authorized
-- completed appointment. Client-supplied provider/service date are never
-- accepted here.
create function public.post_charge(
  p_acting_branch_id uuid,
  p_patient_id uuid,
  p_procedure_id uuid,
  p_treatment_plan_item_id uuid,
  p_amount_centavos bigint,
  p_appointment_id uuid,
  p_non_clinical boolean,
  p_zero_amount_reason text,
  p_idempotency_key text
)
returns table(charge_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor uuid := (select auth.uid());
  v_actor_provider uuid;
  v_provider_id uuid;
  v_service_date date;
  v_appointment_patient uuid;
  v_appointment_branch uuid;
  v_appointment_starts timestamptz;
  v_assigned_provider uuid;
  v_new_charge_id uuid;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or v_actor is null
     or not private.has_billing_permission_at_branch(p_acting_branch_id, 'billing.charge') then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if not exists (select 1 from public.patients as patient
                 where patient.id = p_patient_id and patient.organization_id = v_organization_id) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_amount_centavos < 0 or p_amount_centavos > 99999999999 then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  if p_amount_centavos = 0 and not private.has_billing_permission_at_branch(p_acting_branch_id, 'billing.adjust') then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_amount_centavos = 0 and (p_zero_amount_reason is null or btrim(p_zero_amount_reason) = '' or length(p_zero_amount_reason) > 500) then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  if p_non_clinical and p_procedure_id is not null then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  if p_procedure_id is not null and not exists (
    select 1 from public.procedures as procedure
    where procedure.id = p_procedure_id and procedure.organization_id = v_organization_id
  ) then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  if p_treatment_plan_item_id is not null and not exists (
    select 1 from public.treatment_plan_items as item
    join public.treatment_plans as plan on plan.id = item.plan_id and plan.organization_id = item.organization_id
    where item.id = p_treatment_plan_item_id and item.organization_id = v_organization_id
      and plan.patient_id = p_patient_id
  ) then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  if p_appointment_id is not null then
    select appointment.patient_id, appointment.branch_id, appointment.starts_at into v_appointment_patient, v_appointment_branch, v_appointment_starts
    from public.appointments as appointment
    where appointment.id = p_appointment_id and appointment.organization_id = v_organization_id
      and appointment.encounter_status = 'COMPLETED';
    if v_appointment_patient is null or v_appointment_patient <> p_patient_id or v_appointment_branch <> p_acting_branch_id then
      raise invalid_parameter_value using message = 'invalid input';
    end if;
    v_service_date := v_appointment_starts::date;
  else
    v_service_date := statement_timestamp()::date;
  end if;

  if p_non_clinical then
    v_provider_id := null;
  else
    v_actor_provider := private.resolve_actor_provider(v_organization_id);
    if v_actor_provider is not null then
      if p_appointment_id is not null and not exists (
        select 1 from public.appointment_providers as assignment
        where assignment.organization_id = v_organization_id
          and assignment.appointment_id = p_appointment_id
          and assignment.provider_id = v_actor_provider
          and assignment.assignment_status = 'ASSIGNED'
      ) then
        raise insufficient_privilege using message = 'not authorized';
      end if;
      v_provider_id := v_actor_provider;
    elsif exists (
      select 1 from public.provider_branches as provider_branch
      where provider_branch.organization_id = v_organization_id
        and provider_branch.provider_id = v_actor_provider
        and provider_branch.branch_id = p_acting_branch_id
        and provider_branch.is_active
    ) then
      v_provider_id := v_actor_provider;
    else
      -- BILLING-role posting inherits attribution from the completed appointment.
      if p_appointment_id is null then
        raise insufficient_privilege using message = 'not authorized';
      end if;
      select assignment.provider_id into v_assigned_provider
      from public.appointment_providers as assignment
      where assignment.organization_id = v_organization_id
        and assignment.appointment_id = p_appointment_id
        and assignment.assignment_status = 'ASSIGNED'
      order by assignment.id
      limit 2;
      if v_assigned_provider is null then
        raise insufficient_privilege using message = 'not authorized';
      end if;
      if exists (
        select 1 from public.appointment_providers as assignment
        where assignment.organization_id = v_organization_id
          and assignment.appointment_id = p_appointment_id
          and assignment.assignment_status = 'ASSIGNED'
          and assignment.provider_id <> v_assigned_provider
      ) then
        raise insufficient_privilege using message = 'not authorized';
      end if;
      v_provider_id := v_assigned_provider;
    end if;
  end if;

  insert into public.charges (
    organization_id, patient_id, branch_id, provider_id, procedure_id,
    treatment_plan_item_id, amount_centavos, service_date, zero_amount_reason,
    non_clinical, idempotency_key, created_by
  ) values (
    v_organization_id, p_patient_id, p_acting_branch_id, v_provider_id, p_procedure_id,
    p_treatment_plan_item_id, p_amount_centavos, v_service_date,
    case when p_amount_centavos = 0 then btrim(p_zero_amount_reason) else null end,
    p_non_clinical, p_idempotency_key, v_actor
  ) returning id into v_new_charge_id;

  perform private.record_billing_audit(
    v_organization_id, p_acting_branch_id, 'billing.charge.posted', 'charge',
    v_new_charge_id, p_patient_id,
    jsonb_build_object(
      'charge_id', v_new_charge_id::text,
      'procedure_id', p_procedure_id,
      'treatment_plan_item_id', p_treatment_plan_item_id,
      'provider_id', v_provider_id,
      'service_date', v_service_date::text,
      'idempotency_key', p_idempotency_key
    )
  );

  return query select v_new_charge_id;
end;
$$;
revoke all on function public.post_charge(uuid,uuid,uuid,uuid,bigint,uuid,boolean,text,text)
from public, anon, authenticated, service_role;
comment on function public.post_charge(uuid,uuid,uuid,uuid,bigint,uuid,boolean,text,text) is
  'Posts a confirmed actual charge with server-resolved treating provider/service date and atomically audits it; zero-amount charges require billing.adjust plus a reason.';
-- Elevated charge posting: OWNER/ADMIN may choose an active same-tenant/branch
-- provider and a non-future service date with a bounded audited reason. The
-- rate is never client-supplied; it is resolved server-side at B4 resolution.
create function public.post_charge_with_attribution_override(
  p_acting_branch_id uuid,
  p_patient_id uuid,
  p_provider_id uuid,
  p_service_date date,
  p_procedure_id uuid,
  p_treatment_plan_item_id uuid,
  p_amount_centavos bigint,
  p_appointment_id uuid,
  p_non_clinical boolean,
  p_zero_amount_reason text,
  p_reason text,
  p_idempotency_key text
)
returns table(charge_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor uuid := (select auth.uid());
  v_new_charge_id uuid;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or v_actor is null
     or not private.has_billing_permission_at_branch(p_acting_branch_id, 'billing.attribution.override') then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_reason is null or btrim(p_reason) = '' or length(p_reason) > 500 then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  if p_service_date > statement_timestamp()::date then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  if not exists (select 1 from public.patients as patient
                 where patient.id = p_patient_id and patient.organization_id = v_organization_id) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_non_clinical or not exists (
    select 1 from public.providers as provider
    where provider.id = p_provider_id and provider.organization_id = v_organization_id
      and provider.status = 'active'
      and exists (
        select 1 from public.provider_branches as provider_branch
        where provider_branch.organization_id = provider.organization_id
          and provider_branch.provider_id = provider.id
          and provider_branch.branch_id = p_acting_branch_id
          and provider_branch.is_active
      )
  ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_amount_centavos < 0 or p_amount_centavos > 99999999999 then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  if p_amount_centavos = 0 and (p_zero_amount_reason is null or btrim(p_zero_amount_reason) = '' or length(p_zero_amount_reason) > 500) then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  insert into public.charges (
    organization_id, patient_id, branch_id, provider_id, procedure_id,
    treatment_plan_item_id, amount_centavos, service_date, zero_amount_reason,
    non_clinical, idempotency_key, created_by
  ) values (
    v_organization_id, p_patient_id, p_acting_branch_id, p_provider_id, p_procedure_id,
    p_treatment_plan_item_id, p_amount_centavos, p_service_date,
    case when p_amount_centavos = 0 then btrim(p_zero_amount_reason) else null end,
    p_non_clinical, p_idempotency_key, v_actor
  ) returning id into v_new_charge_id;

  perform private.record_billing_audit(
    v_organization_id, p_acting_branch_id, 'billing.attribution.override.posted', 'charge',
    v_new_charge_id, p_patient_id,
    jsonb_build_object(
      'charge_id', v_new_charge_id::text,
      'provider_id', p_provider_id,
      'service_date', p_service_date::text,
      'reason', btrim(p_reason),
      'idempotency_key', p_idempotency_key
    )
  );

  return query select v_new_charge_id;
end;
$$;
revoke all on function public.post_charge_with_attribution_override(uuid,uuid,uuid,date,uuid,uuid,bigint,uuid,boolean,text,text,text)
from public, anon, authenticated, service_role;

-- Append-only attribution correction. When allocations already exist, one
-- locked transaction reverses the prior provider's cumulative earnings, then
-- resolves the corrected provider's agreement on the corrected service date
-- (accrual) or records NO_ACTIVE_AGREEMENT for later audited resolution.
create function public.correct_charge_attribution(
  p_acting_branch_id uuid,
  p_charge_id uuid,
  p_corrected_provider_id uuid,
  p_corrected_service_date date,
  p_reason text,
  p_idempotency_key text
)
returns table(correction_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor uuid := (select auth.uid());
  v_charge public.charges%rowtype;
  v_previous_provider uuid;
  v_previous_branch uuid;
  v_previous_service_date date;
  v_old_posted bigint;
  v_resolved_agreement uuid;
  v_resolved_rate integer;
  v_resolved_basis text;
  v_allocated bigint;
  v_net_cost bigint;
  v_target bigint;
  v_new_correction_id uuid;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or v_actor is null then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  select charge.* into v_charge
  from public.charges as charge
  where charge.id = p_charge_id and charge.organization_id = v_organization_id
  for update;

  if not found then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if not private.has_billing_permission_at_branch(v_charge.branch_id, 'billing.attribution.override') then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_corrected_service_date > statement_timestamp()::date
     or p_reason is null or btrim(p_reason) = '' or length(p_reason) > 500 then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  if p_corrected_provider_id is not null and not exists (
    select 1 from public.providers as provider
    where provider.id = p_corrected_provider_id and provider.organization_id = v_organization_id
      and provider.status = 'active'
  ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  select attribution.provider_id, attribution.branch_id, attribution.service_date
    into v_previous_provider, v_previous_branch, v_previous_service_date
  from private.charge_current_attribution(p_charge_id, v_organization_id) as attribution;

  insert into public.charge_attribution_corrections (
    organization_id, charge_id, previous_provider_id, corrected_provider_id,
    previous_branch_id, corrected_branch_id, previous_service_date,
    corrected_service_date, reason, corrected_by, idempotency_key
  ) values (
    v_organization_id, p_charge_id, v_previous_provider, p_corrected_provider_id,
    v_previous_branch, v_charge.branch_id, v_previous_service_date,
    p_corrected_service_date, btrim(p_reason), v_actor, p_idempotency_key
  ) returning id into v_new_correction_id;

  if p_corrected_provider_id is null then
    return query select v_new_correction_id;
  end if;

  -- Reverse the prior provider's cumulative earnings for this charge.
  select coalesce(sum(entry.earning_centavos), 0::bigint) into v_old_posted
  from public.provider_earning_entries as entry
  where entry.charge_id = p_charge_id and entry.organization_id = v_organization_id
    and entry.provider_id = v_previous_provider;

  if v_old_posted <> 0 then
    insert into public.provider_earning_entries (
      organization_id, provider_id, charge_id, entry_type, cause,
      eligible_basis_centavos, net_approved_cost_centavos, rate_bps,
      earning_centavos, created_by, idempotency_key
    ) values (
      v_organization_id, v_previous_provider, p_charge_id, 'REVERSAL', 'ATTRIBUTION',
      0, 0, 0, -v_old_posted, v_actor,
      'attr-rev-' || p_charge_id::text || '-' || v_new_correction_id::text
    );
  end if;

  -- Resolve the corrected provider's agreement on the corrected service date.
  select resolved.agreement_id, resolved.rate_bps, resolved.basis
    into v_resolved_agreement, v_resolved_rate, v_resolved_basis
  from private.resolve_compensation_rate(
    v_organization_id, p_corrected_provider_id, v_charge.procedure_id, p_corrected_service_date
  ) as resolved;

  if v_resolved_agreement is null then
    insert into public.charge_compensation_resolutions (
      organization_id, charge_id, state, agreement_id, rate_bps, basis,
      authoritative_service_date, resolved_by, reason, idempotency_key
    ) values (
      v_organization_id, p_charge_id, 'NO_ACTIVE_AGREEMENT', null, null, null,
      p_corrected_service_date, v_actor, btrim(p_reason), 'attr-' || p_idempotency_key
    );
  else
    insert into public.charge_compensation_resolutions (
      organization_id, charge_id, state, agreement_id, rate_bps, basis,
      authoritative_service_date, resolved_by, reason, idempotency_key
    ) values (
      v_organization_id, p_charge_id, 'RESOLVED', v_resolved_agreement, v_resolved_rate,
      v_resolved_basis, p_corrected_service_date, v_actor, btrim(p_reason), 'attr-' || p_idempotency_key
    );
    v_allocated := private.charge_net_allocated(p_charge_id, v_organization_id);
    v_net_cost := coalesce((
      select sum(entry.amount_centavos) from public.charge_direct_costs as entry
      where entry.charge_id = p_charge_id and entry.organization_id = v_organization_id and entry.event_type = 'APPROVAL'
    ), 0::bigint) - coalesce((
      select sum(entry.amount_centavos) from public.charge_direct_costs as entry
      where entry.charge_id = p_charge_id and entry.organization_id = v_organization_id and entry.event_type = 'REVERSAL'
    ), 0::bigint);
    v_target := private.earning_cumulative_target(v_resolved_basis, v_allocated, v_net_cost, v_resolved_rate);
    if v_target <> 0 then
      insert into public.provider_earning_entries (
        organization_id, provider_id, charge_id, entry_type, cause,
        eligible_basis_centavos, net_approved_cost_centavos, rate_bps,
        earning_centavos, created_by, idempotency_key
      ) values (
        v_organization_id, p_corrected_provider_id, p_charge_id, 'ACCRUAL', 'ATTRIBUTION',
        v_allocated, v_net_cost, v_resolved_rate, v_target, v_actor,
        'attr-acc-' || p_charge_id::text || '-' || v_new_correction_id::text
      );
    end if;
  end if;

  perform private.record_billing_audit(
    v_organization_id, v_charge.branch_id, 'billing.attribution.corrected', 'charge',
    p_charge_id, v_charge.patient_id,
    jsonb_build_object(
      'charge_id', p_charge_id::text,
      'attribution_previous_provider', v_previous_provider,
      'attribution_corrected_provider', p_corrected_provider_id,
      'service_date', p_corrected_service_date::text,
      'reason', btrim(p_reason),
      'idempotency_key', p_idempotency_key
    )
  );

  return query select v_new_correction_id;
end;
$$;
revoke all on function public.correct_charge_attribution(uuid,uuid,uuid,date,text,text)
from public, anon, authenticated, service_role;
-- Void a charge. Reverses every net allocation and associated earnings under
-- row locks, then appends the unique charge-void event. Requires billing.adjust
-- at the charge-origin branch and payment.record at every affected receiving
-- branch; released cleared money becomes unallocated patient credit.
create function public.void_charge(
  p_acting_branch_id uuid,
  p_charge_id uuid,
  p_reason text,
  p_idempotency_key text
)
returns table(void_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor uuid := (select auth.uid());
  v_charge public.charges%rowtype;
  v_payment_org uuid;
  v_void_id uuid;
  r_allocation record;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or v_actor is null then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  select charge.* into v_charge
  from public.charges as charge
  where charge.id = p_charge_id and charge.organization_id = v_organization_id
  for update;

  if not found then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if not private.has_billing_permission_at_branch(v_charge.branch_id, 'billing.adjust') then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_reason is null or btrim(p_reason) = '' or length(p_reason) > 500 then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  if exists (select 1 from public.charge_voids as void where void.charge_id = p_charge_id) then
    raise exception using errcode = 'P0001', message = 'invalid state';
  end if;

  -- Every affected receiving branch requires payment.record.
  for r_allocation in
    select distinct payment.branch_id as receiving_branch_id
    from public.payment_allocations as allocation
    join public.payments as payment on payment.id = allocation.payment_id and payment.organization_id = allocation.organization_id
    where allocation.charge_id = p_charge_id and allocation.organization_id = v_organization_id
      and not exists (
        select 1 from public.payment_allocation_reversals as reversal
        where reversal.allocation_id = allocation.id and reversal.organization_id = v_organization_id
          and reversal.amount_centavos = allocation.amount_centavos
      )
  loop
    if not private.has_billing_permission_at_branch(r_allocation.receiving_branch_id, 'payment.record') then
      raise insufficient_privilege using message = 'not authorized';
    end if;
  end loop;

  for r_allocation in
    select allocation.id as allocation_id, allocation.amount_centavos,
           (select coalesce(sum(reversal.amount_centavos), 0::bigint) from public.payment_allocation_reversals as reversal
            where reversal.allocation_id = allocation.id and reversal.organization_id = v_organization_id) as reversed_amount
    from public.payment_allocations as allocation
    where allocation.charge_id = p_charge_id and allocation.organization_id = v_organization_id
      for update of allocation
  loop
    if r_allocation.reversed_amount < r_allocation.amount_centavos then
      insert into public.payment_allocation_reversals (
        organization_id, allocation_id, cause, amount_centavos, reason, reversed_by, idempotency_key
      ) values (
        v_organization_id, r_allocation.allocation_id, 'VOID',
        r_allocation.amount_centavos - r_allocation.reversed_amount,
        btrim(p_reason), v_actor, 'void-alloc-' || r_allocation.allocation_id::text || '-' || p_idempotency_key
      );
    end if;
  end loop;

  perform private.sync_charge_earnings(v_organization_id, p_charge_id, 'VOID');

  insert into public.charge_voids (organization_id, charge_id, reason, voided_by)
  values (v_organization_id, p_charge_id, btrim(p_reason), v_actor) returning id into v_void_id;

  perform private.record_billing_audit(
    v_organization_id, v_charge.branch_id, 'billing.charge.voided', 'charge',
    p_charge_id, v_charge.patient_id,
    jsonb_build_object('charge_id', p_charge_id::text, 'reason', btrim(p_reason), 'idempotency_key', p_idempotency_key)
  );

  return query select v_void_id;
end;
$$;
revoke all on function public.void_charge(uuid,uuid,text,text)
from public, anon, authenticated, service_role;

-- Approve an append-only direct cost. The charge and allocations are locked and
-- the signed earning delta is appended for a net-compensation basis.
create function public.approve_charge_direct_cost(
  p_acting_branch_id uuid,
  p_charge_id uuid,
  p_cost_type text,
  p_amount_centavos bigint,
  p_description text,
  p_idempotency_key text
)
returns table(direct_cost_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor uuid := (select auth.uid());
  v_charge public.charges%rowtype;
  v_direct_cost_id uuid;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or v_actor is null then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  select charge.* into v_charge
  from public.charges as charge
  where charge.id = p_charge_id and charge.organization_id = v_organization_id
  for update;

  if not found then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if not private.has_billing_permission_at_branch(v_charge.branch_id, 'billing.adjust') then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_cost_type not in ('LAB','MATERIAL','OTHER')
     or p_amount_centavos <= 0 or p_amount_centavos > 99999999999
     or p_description is null or btrim(p_description) = '' or length(p_description) > 500 then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  insert into public.charge_direct_costs (
    organization_id, charge_id, event_type, cost_type, amount_centavos,
    reason, created_by, idempotency_key
  ) values (
    v_organization_id, p_charge_id, 'APPROVAL', p_cost_type, p_amount_centavos,
    btrim(p_description), v_actor, p_idempotency_key
  ) returning id into v_direct_cost_id;

  perform private.sync_charge_earnings(v_organization_id, p_charge_id, 'DIRECT_COST');

  perform private.record_billing_audit(
    v_organization_id, v_charge.branch_id, 'billing.direct_cost.approved', 'charge_direct_cost',
    v_direct_cost_id, v_charge.patient_id,
    jsonb_build_object('direct_cost_id', v_direct_cost_id::text, 'charge_id', p_charge_id::text, 'cost_type', p_cost_type, 'idempotency_key', p_idempotency_key)
  );

  return query select v_direct_cost_id;
end;
$$;
revoke all on function public.approve_charge_direct_cost(uuid,uuid,text,bigint,text,text)
from public, anon, authenticated, service_role;

-- Reverse an approved direct cost exactly once and fully.
create function public.reverse_charge_direct_cost(
  p_acting_branch_id uuid,
  p_direct_cost_id uuid,
  p_reason text,
  p_idempotency_key text
)
returns table(reversal_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor uuid := (select auth.uid());
  v_cost public.charge_direct_costs%rowtype;
  v_charge public.charges%rowtype;
  v_reversal_id uuid;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or v_actor is null then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  select cost.* into v_cost
  from public.charge_direct_costs as cost
  where cost.id = p_direct_cost_id and cost.organization_id = v_organization_id;

  if not found or v_cost.event_type <> 'APPROVAL' then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  select charge.* into v_charge
  from public.charges as charge
  where charge.id = v_cost.charge_id and charge.organization_id = v_organization_id
  for update;

  if not private.has_billing_permission_at_branch(v_charge.branch_id, 'billing.adjust') then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_reason is null or btrim(p_reason) = '' or length(p_reason) > 500 then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  if exists (select 1 from public.charge_direct_costs as reversal where reversal.reversal_of_id = p_direct_cost_id) then
    raise exception using errcode = 'P0001', message = 'invalid state';
  end if;

  insert into public.charge_direct_costs (
    organization_id, charge_id, event_type, reversal_of_id, cost_type,
    amount_centavos, reason, created_by, idempotency_key
  ) values (
    v_organization_id, v_cost.charge_id, 'REVERSAL', p_direct_cost_id, v_cost.cost_type,
    v_cost.amount_centavos, btrim(p_reason), v_actor, p_idempotency_key
  ) returning id into v_reversal_id;

  perform private.sync_charge_earnings(v_organization_id, v_cost.charge_id, 'DIRECT_COST');

  perform private.record_billing_audit(
    v_organization_id, v_charge.branch_id, 'billing.direct_cost.reversed', 'charge_direct_cost',
    v_reversal_id, v_charge.patient_id,
    jsonb_build_object('direct_cost_id', v_reversal_id::text, 'charge_id', v_cost.charge_id::text, 'cost_type', v_cost.cost_type, 'idempotency_key', p_idempotency_key)
  );

  return query select v_reversal_id;
end;
$$;
revoke all on function public.reverse_charge_direct_cost(uuid,uuid,text,text)
from public, anon, authenticated, service_role;

-- Charge adjustment. A credit may not push adjusted due below net allocations
-- unless the same transaction releases enough allocations to account credit.
create function public.post_charge_adjustment(
  p_acting_branch_id uuid,
  p_charge_id uuid,
  p_direction text,
  p_amount_centavos bigint,
  p_reason text,
  p_idempotency_key text
)
returns table(adjustment_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor uuid := (select auth.uid());
  v_charge public.charges%rowtype;
  v_adjustment_id uuid;
  v_adjusted bigint;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or v_actor is null then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  select charge.* into v_charge
  from public.charges as charge
  where charge.id = p_charge_id and charge.organization_id = v_organization_id
  for update;

  if not found then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if not private.has_billing_permission_at_branch(v_charge.branch_id, 'billing.adjust') then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_direction not in ('CREDIT','DEBIT') or p_amount_centavos <= 0 or p_amount_centavos > 99999999999
     or p_reason is null or btrim(p_reason) = '' or length(p_reason) > 500 then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  insert into public.charge_adjustments (
    organization_id, charge_id, direction, amount_centavos, reason, created_by, idempotency_key
  ) values (
    v_organization_id, p_charge_id, p_direction, p_amount_centavos, btrim(p_reason), v_actor, p_idempotency_key
  ) returning id into v_adjustment_id;

  if p_direction = 'CREDIT' then
    v_adjusted := private.charge_adjusted_amount(p_charge_id, v_organization_id);
    if v_adjusted < 0 then
      raise exception using errcode = 'P0001', message = 'invalid state';
    end if;
  end if;

  perform private.record_billing_audit(
    v_organization_id, v_charge.branch_id, 'billing.adjustment.posted', 'charge_adjustment',
    v_adjustment_id, v_charge.patient_id,
    jsonb_build_object('adjustment_id', v_adjustment_id::text, 'charge_id', p_charge_id::text, 'direction', p_direction, 'idempotency_key', p_idempotency_key)
  );

  return query select v_adjustment_id;
end;
$$;
revoke all on function public.post_charge_adjustment(uuid,uuid,text,bigint,text,text)
from public, anon, authenticated, service_role;

-- Reverse a charge adjustment exactly once and fully.
create function public.reverse_charge_adjustment(
  p_acting_branch_id uuid,
  p_adjustment_id uuid,
  p_reason text,
  p_idempotency_key text
)
returns table(reversal_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor uuid := (select auth.uid());
  v_adjustment public.charge_adjustments%rowtype;
  v_charge public.charges%rowtype;
  v_reversal_id uuid;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or v_actor is null then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  select adjustment.* into v_adjustment
  from public.charge_adjustments as adjustment
  where adjustment.id = p_adjustment_id and adjustment.organization_id = v_organization_id;

  if not found then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  select charge.* into v_charge
  from public.charges as charge
  where charge.id = v_adjustment.charge_id and charge.organization_id = v_organization_id
  for update;

  if not private.has_billing_permission_at_branch(v_charge.branch_id, 'billing.adjust') then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_reason is null or btrim(p_reason) = '' or length(p_reason) > 500 then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  if exists (select 1 from public.charge_adjustment_reversals as reversal where reversal.adjustment_id = p_adjustment_id) then
    raise exception using errcode = 'P0001', message = 'invalid state';
  end if;

  insert into public.charge_adjustment_reversals (
    organization_id, adjustment_id, reason, created_by, idempotency_key
  ) values (
    v_organization_id, p_adjustment_id, btrim(p_reason), v_actor, p_idempotency_key
  ) returning id into v_reversal_id;

  perform private.record_billing_audit(
    v_organization_id, v_charge.branch_id, 'billing.adjustment.reversed', 'charge_adjustment_reversal',
    v_reversal_id, v_charge.patient_id,
    jsonb_build_object('adjustment_id', v_reversal_id::text, 'charge_id', v_adjustment.charge_id::text, 'idempotency_key', p_idempotency_key)
  );

  return query select v_reversal_id;
end;
$$;
revoke all on function public.reverse_charge_adjustment(uuid,uuid,text,text)
from public, anon, authenticated, service_role;
-- Record cleared money received. The receiving branch requires payment.record.
create function public.record_payment(
  p_acting_branch_id uuid,
  p_patient_id uuid,
  p_payment_method_id uuid,
  p_amount_centavos bigint,
  p_reference text,
  p_idempotency_key text
)
returns table(payment_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor uuid := (select auth.uid());
  v_new_payment_id uuid;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or v_actor is null
     or not private.has_billing_permission_at_branch(p_acting_branch_id, 'payment.record') then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if not exists (select 1 from public.patients as patient
                 where patient.id = p_patient_id and patient.organization_id = v_organization_id) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if not exists (select 1 from public.payment_methods as method
                 where method.id = p_payment_method_id and method.organization_id = v_organization_id and method.active) then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  if p_amount_centavos <= 0 or p_amount_centavos > 99999999999
     or (p_reference is not null and (btrim(p_reference) = '' or length(p_reference) > 80)) then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  insert into public.payments (
    organization_id, patient_id, branch_id, payment_method_id, amount_centavos,
    reference, received_by, idempotency_key
  ) values (
    v_organization_id, p_patient_id, p_acting_branch_id, p_payment_method_id, p_amount_centavos,
    case when p_reference is null then null else btrim(p_reference) end, v_actor, p_idempotency_key
  ) returning id into v_new_payment_id;

  perform private.record_billing_audit(
    v_organization_id, p_acting_branch_id, 'billing.payment.recorded', 'payment',
    v_new_payment_id, p_patient_id,
    jsonb_build_object('payment_id', v_new_payment_id::text, 'method_code', (select code from public.payment_methods where id = p_payment_method_id), 'idempotency_key', p_idempotency_key)
  );

  return query select v_new_payment_id;
end;
$$;
revoke all on function public.record_payment(uuid,uuid,uuid,bigint,text,text)
from public, anon, authenticated, service_role;

-- Void a payment: one unique full-principal event that reverses all remaining
-- allocations/earnings and removes unallocated credit. Rejected if any refund
-- exists; rejected after void (allocations/refunds). Requires payment.record at
-- the receiving branch and every origin branch with a net allocation.
create function public.void_payment(
  p_acting_branch_id uuid,
  p_payment_id uuid,
  p_reason text,
  p_idempotency_key text
)
returns table(void_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor uuid := (select auth.uid());
  v_payment public.payments%rowtype;
  v_void_id uuid;
  r_allocation record;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or v_actor is null then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  select payment.* into v_payment
  from public.payments as payment
  where payment.id = p_payment_id and payment.organization_id = v_organization_id
  for update;

  if not found then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if not private.has_billing_permission_at_branch(v_payment.branch_id, 'payment.record') then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_reason is null or btrim(p_reason) = '' or length(p_reason) > 500 then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  if exists (select 1 from public.payment_voids as void where void.payment_id = p_payment_id) then
    raise exception using errcode = 'P0001', message = 'invalid state';
  end if;

  if exists (select 1 from public.payment_refunds as refund where refund.payment_id = p_payment_id) then
    raise exception using errcode = 'P0001', message = 'invalid state';
  end if;

  for r_allocation in
    select distinct charge.branch_id as origin_branch_id
    from public.payment_allocations as allocation
    join public.charges as charge on charge.id = allocation.charge_id and charge.organization_id = allocation.organization_id
    where allocation.payment_id = p_payment_id and allocation.organization_id = v_organization_id
      and not exists (
        select 1 from public.payment_allocation_reversals as reversal
        where reversal.allocation_id = allocation.id and reversal.organization_id = v_organization_id
          and reversal.amount_centavos = allocation.amount_centavos
      )
  loop
    if not private.has_billing_permission_at_branch(r_allocation.origin_branch_id, 'payment.record') then
      raise insufficient_privilege using message = 'not authorized';
    end if;
  end loop;

for r_allocation in
    select allocation.id as allocation_id, allocation.amount_centavos, allocation.charge_id,
           (select coalesce(sum(reversal.amount_centavos), 0::bigint) from public.payment_allocation_reversals as reversal
            where reversal.allocation_id = allocation.id and reversal.organization_id = v_organization_id) as reversed_amount
    from public.payment_allocations as allocation
    where allocation.payment_id = p_payment_id and allocation.organization_id = v_organization_id
      for update of allocation
  loop
    if r_allocation.reversed_amount < r_allocation.amount_centavos then
      insert into public.payment_allocation_reversals (
        organization_id, allocation_id, cause, amount_centavos, reason, reversed_by, idempotency_key
      ) values (
        v_organization_id, r_allocation.allocation_id, 'VOID',
        r_allocation.amount_centavos - r_allocation.reversed_amount,
        btrim(p_reason), v_actor, 'void-pay-alloc-' || r_allocation.allocation_id::text || '-' || p_idempotency_key
      );
      perform private.sync_charge_earnings(v_organization_id, r_allocation.charge_id, 'VOID');
    end if;
  end loop;

  insert into public.payment_voids (organization_id, payment_id, reason, voided_by)
  values (v_organization_id, p_payment_id, btrim(p_reason), v_actor) returning id into v_void_id;

  perform private.record_billing_audit(
    v_organization_id, v_payment.branch_id, 'billing.payment.voided', 'payment',
    p_payment_id, v_payment.patient_id,
    jsonb_build_object('payment_id', p_payment_id::text, 'reason', btrim(p_reason), 'idempotency_key', p_idempotency_key)
  );

  return query select v_void_id;
end;
$$;
revoke all on function public.void_payment(uuid,uuid,text,text)
from public, anon, authenticated, service_role;

-- Allocate cleared money to a charge under stable payment+charge locks, capped
-- by payment availability and the charge's adjusted due. Appends the earning
-- accrual delta atomically. Requires payment.record at the receiving branch and
-- the charge-origin branch.
create function public.allocate_payment(
  p_acting_branch_id uuid,
  p_payment_id uuid,
  p_charge_id uuid,
  p_patient_id uuid,
  p_amount_centavos bigint,
  p_idempotency_key text
)
returns table(allocation_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor uuid := (select auth.uid());
  v_payment public.payments%rowtype;
  v_charge public.charges%rowtype;
  v_availability bigint;
  v_due bigint;
  v_new_allocation_id uuid;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or v_actor is null then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  select payment.* into v_payment
  from public.payments as payment
  where payment.id = p_payment_id and payment.organization_id = v_organization_id
  for update;

  if not found then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  select charge.* into v_charge
  from public.charges as charge
  where charge.id = p_charge_id and charge.organization_id = v_organization_id
  for update;

  if not found then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if v_payment.patient_id <> p_patient_id or v_charge.patient_id <> p_patient_id then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if not private.has_billing_permission_at_branch(v_payment.branch_id, 'payment.record') then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if not private.has_billing_permission_at_branch(v_charge.branch_id, 'payment.record') then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_amount_centavos <= 0 or p_amount_centavos > 99999999999 then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  if private.charge_is_voided(p_charge_id, v_organization_id) then
    raise exception using errcode = 'P0001', message = 'invalid state';
  end if;

  v_availability := private.payment_availability(p_payment_id, v_organization_id);
  if p_amount_centavos > v_availability then
    raise exception using errcode = 'P0001', message = 'insufficient payment availability';
  end if;

  v_due := private.charge_due(p_charge_id, v_organization_id);
  if p_amount_centavos > v_due then
    raise exception using errcode = 'P0001', message = 'allocation exceeds adjusted due';
  end if;

  insert into public.payment_allocations (
    organization_id, payment_id, charge_id, patient_id, amount_centavos,
    allocated_by, idempotency_key
  ) values (
    v_organization_id, p_payment_id, p_charge_id, p_patient_id, p_amount_centavos,
    v_actor, p_idempotency_key
  ) returning id into v_new_allocation_id;

  perform private.sync_charge_earnings(v_organization_id, p_charge_id, 'REALLOCATION');

  perform private.record_billing_audit(
    v_organization_id, v_charge.branch_id, 'billing.payment.allocated', 'payment_allocation',
    v_new_allocation_id, p_patient_id,
    jsonb_build_object('allocation_id', v_new_allocation_id::text, 'payment_id', p_payment_id::text, 'charge_id', p_charge_id::text, 'idempotency_key', p_idempotency_key)
  );

  return query select v_new_allocation_id;
end;
$$;
revoke all on function public.allocate_payment(uuid,uuid,uuid,uuid,bigint,text)
from public, anon, authenticated, service_role;

-- Reverse part or all of an allocation, releasing it as unallocated credit and
-- appending the exact earning reversal delta. Requires payment.record at both
-- the receiving and charge-origin branches.
create function public.reverse_payment_allocation(
  p_acting_branch_id uuid,
  p_allocation_id uuid,
  p_amount_centavos bigint,
  p_reason text,
  p_idempotency_key text
)
returns table(reversal_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor uuid := (select auth.uid());
  v_allocation public.payment_allocations%rowtype;
  v_payment public.payments%rowtype;
  v_charge public.charges%rowtype;
  v_reversed bigint;
  v_reversal_id uuid;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or v_actor is null then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  select allocation.* into v_allocation
  from public.payment_allocations as allocation
  where allocation.id = p_allocation_id and allocation.organization_id = v_organization_id
  for update;

  if not found then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  select payment.* into v_payment
  from public.payments as payment
  where payment.id = v_allocation.payment_id and payment.organization_id = v_organization_id
  for update;

  select charge.* into v_charge
  from public.charges as charge
  where charge.id = v_allocation.charge_id and charge.organization_id = v_organization_id
  for update;

  if not private.has_billing_permission_at_branch(v_payment.branch_id, 'payment.record') then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if not private.has_billing_permission_at_branch(v_charge.branch_id, 'payment.record') then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_amount_centavos <= 0 or p_amount_centavos > 99999999999
     or p_reason is null or btrim(p_reason) = '' or length(p_reason) > 500 then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  select coalesce(sum(reversal.amount_centavos), 0::bigint) into v_reversed
  from public.payment_allocation_reversals as reversal
  where reversal.allocation_id = p_allocation_id and reversal.organization_id = v_organization_id;

  if v_reversed + p_amount_centavos > v_allocation.amount_centavos then
    raise exception using errcode = 'P0001', message = 'payment allocation reversal exceeds available consumption';
  end if;

  insert into public.payment_allocation_reversals (
    organization_id, allocation_id, cause, amount_centavos, reason, reversed_by, idempotency_key
  ) values (
    v_organization_id, p_allocation_id, 'MANUAL', p_amount_centavos, btrim(p_reason), v_actor, p_idempotency_key
  ) returning id into v_reversal_id;

  perform private.sync_charge_earnings(v_organization_id, v_charge.id, 'REALLOCATION');

  perform private.record_billing_audit(
    v_organization_id, v_charge.branch_id, 'billing.allocation.reversed', 'payment_allocation_reversal',
    v_reversal_id, v_allocation.patient_id,
    jsonb_build_object('allocation_id', p_allocation_id::text, 'payment_id', v_payment.id::text, 'charge_id', v_charge.id::text, 'idempotency_key', p_idempotency_key)
  );

  return query select v_reversal_id;
end;
$$;
revoke all on function public.reverse_payment_allocation(uuid,uuid,bigint,text,text)
from public, anon, authenticated, service_role;

-- Refund money with an explicit component distribution. Allocated components
-- reference an original allocation and create exactly one equal REFUND reversal
-- plus the earning reversal; unallocated components consume account credit.
create function public.refund_payment(
  p_acting_branch_id uuid,
  p_payment_id uuid,
  p_patient_id uuid,
  p_amount_centavos bigint,
  p_reason text,
  p_components jsonb,
  p_idempotency_key text
)
returns table(refund_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor uuid := (select auth.uid());
  v_payment public.payments%rowtype;
  v_component_amount bigint;
  v_sum bigint := 0;
  v_unallocated_sum bigint := 0;
  v_new_refund_id uuid;
  v_available bigint;
  r_component jsonb;
  v_component_allocation uuid;
  v_component_refund_allocation_id uuid;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or v_actor is null then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  select payment.* into v_payment
  from public.payments as payment
  where payment.id = p_payment_id and payment.organization_id = v_organization_id
  for update;

  if not found then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if v_payment.patient_id <> p_patient_id then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if not private.has_billing_permission_at_branch(v_payment.branch_id, 'payment.record') then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_amount_centavos <= 0 or p_amount_centavos > 99999999999
     or p_reason is null or btrim(p_reason) = '' or length(p_reason) > 500
     or jsonb_typeof(p_components) <> 'array' then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  if exists (select 1 from public.payment_voids as void where void.payment_id = p_payment_id) then
    raise exception using errcode = 'P0001', message = 'invalid state';
  end if;

for r_component in select * from jsonb_array_elements(p_components)
  loop
    v_component_amount := (r_component ->> 'amountCentavos')::bigint;
    if v_component_amount is null or v_component_amount <= 0 or v_component_amount > 99999999999 then
      raise invalid_parameter_value using message = 'invalid input';
    end if;
    v_sum := v_sum + v_component_amount;
    if nullif(r_component ->> 'allocationId', '')::uuid is null then
      v_unallocated_sum := v_unallocated_sum + v_component_amount;
    end if;
  end loop;

  if v_sum <> p_amount_centavos then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  -- Unallocated refund components cannot exceed current payment credit.
  v_available := private.payment_availability(p_payment_id, v_organization_id);
  if v_unallocated_sum > v_available then
    raise exception using errcode = 'P0001', message = 'refund exceeds available credit';
  end if;

  insert into public.payment_refunds (
    organization_id, payment_id, patient_id, amount_centavos, reason, refunded_by, idempotency_key
  ) values (
    v_organization_id, p_payment_id, p_patient_id, p_amount_centavos, btrim(p_reason), v_actor, p_idempotency_key
  ) returning id into v_new_refund_id;

  for r_component in select * from jsonb_array_elements(p_components)
  loop
    v_component_amount := (r_component ->> 'amountCentavos')::bigint;
    v_component_allocation := nullif(r_component ->> 'allocationId', '')::uuid;

    insert into public.payment_refund_allocations (
      organization_id, refund_id, payment_id, allocation_id, amount_centavos
    ) values (
      v_organization_id, v_new_refund_id, p_payment_id, v_component_allocation, v_component_amount
    ) returning id into v_component_refund_allocation_id;

    if v_component_allocation is null then
      continue;
    else
      if not exists (
        select 1 from public.payment_allocations as allocation
        where allocation.id = v_component_allocation and allocation.organization_id = v_organization_id
          and allocation.payment_id = p_payment_id and allocation.patient_id = p_patient_id
      ) then
        raise insufficient_privilege using message = 'not authorized';
      end if;

      insert into public.payment_allocation_reversals (
        organization_id, allocation_id, payment_refund_allocation_id, cause,
        amount_centavos, reason, reversed_by, idempotency_key
      ) values (
        v_organization_id, v_component_allocation, v_component_refund_allocation_id, 'REFUND',
        v_component_amount, btrim(p_reason), v_actor,
        'refund-rev-' || v_component_refund_allocation_id::text
      );

      perform private.sync_charge_earnings(
        v_organization_id,
        (select charge_id from public.payment_allocations where id = v_component_allocation),
        'REFUND'
      );
    end if;
  end loop;

  perform private.record_billing_audit(
    v_organization_id, v_payment.branch_id, 'billing.payment.refunded', 'payment_refund',
    v_new_refund_id, p_patient_id,
    jsonb_build_object('refund_id', v_new_refund_id::text, 'payment_id', p_payment_id::text, 'idempotency_key', p_idempotency_key)
  );

  return query select v_new_refund_id;
end;
$$;
revoke all on function public.refund_payment(uuid,uuid,uuid,bigint,text,jsonb,text)
from public, anon, authenticated, service_role;
-- Record a post-dated cheque as HELD coverage with separate proposed
-- allocations. Cheque number and bank are protected financial data: they are
-- never placed in audit metadata.
create function public.record_postdated_cheque(
  p_acting_branch_id uuid,
  p_patient_id uuid,
  p_cheque_number text,
  p_bank_name text,
  p_amount_centavos bigint,
  p_date_due date,
  p_allocations jsonb,
  p_idempotency_key text
)
returns table(cheque_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor uuid := (select auth.uid());
  v_new_cheque_id uuid;
  r_proposed jsonb;
  v_charge_id uuid;
  v_proposed_amount bigint;
  v_sum bigint := 0;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or v_actor is null
     or not private.has_billing_permission_at_branch(p_acting_branch_id, 'payment.record') then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if not exists (select 1 from public.patients as patient
                 where patient.id = p_patient_id and patient.organization_id = v_organization_id) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_cheque_number is null or btrim(p_cheque_number) = '' or length(p_cheque_number) > 80
     or p_bank_name is null or btrim(p_bank_name) = '' or length(p_bank_name) > 160
     or p_amount_centavos <= 0 or p_amount_centavos > 99999999999
     or p_date_due is null or jsonb_typeof(p_allocations) <> 'array' then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  for r_proposed in select * from jsonb_array_elements(p_allocations)
  loop
    v_charge_id := (r_proposed ->> 'chargeId')::uuid;
    v_proposed_amount := (r_proposed ->> 'amountCentavos')::bigint;
    if v_charge_id is null or v_proposed_amount is null or v_proposed_amount <= 0 or v_proposed_amount > 99999999999
       or not exists (
         select 1 from public.charges as charge
         where charge.id = v_charge_id and charge.organization_id = v_organization_id and charge.patient_id = p_patient_id
       ) then
      raise invalid_parameter_value using message = 'invalid input';
    end if;
    v_sum := v_sum + v_proposed_amount;
  end loop;

  if v_sum > p_amount_centavos then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  insert into public.postdated_cheques (
    organization_id, patient_id, branch_id, cheque_number, bank_name,
    amount_centavos, date_due, created_by, idempotency_key
  ) values (
    v_organization_id, p_patient_id, p_acting_branch_id, btrim(p_cheque_number), btrim(p_bank_name),
    p_amount_centavos, p_date_due, v_actor, p_idempotency_key
  ) returning id into v_new_cheque_id;

  for r_proposed in select * from jsonb_array_elements(p_allocations)
  loop
    v_charge_id := (r_proposed ->> 'chargeId')::uuid;
    v_proposed_amount := (r_proposed ->> 'amountCentavos')::bigint;
    insert into public.postdated_cheque_allocations (
      organization_id, cheque_id, charge_id, patient_id, amount_centavos, created_by
    ) values (
      v_organization_id, v_new_cheque_id, v_charge_id, p_patient_id, v_proposed_amount, v_actor
    );
  end loop;

  perform private.record_billing_audit(
    v_organization_id, p_acting_branch_id, 'billing.pdc.recorded', 'postdated_cheque',
    v_new_cheque_id, p_patient_id,
    jsonb_build_object('cheque_id', v_new_cheque_id::text, 'idempotency_key', p_idempotency_key)
  );

  return query select v_new_cheque_id;
end;
$$;
revoke all on function public.record_postdated_cheque(uuid,uuid,text,text,bigint,date,jsonb,text)
from public, anon, authenticated, service_role;

-- Transition a cheque between non-clearance states; the state chain trigger
-- validates legality. Clearance uses clear_postdated_cheque exclusively.
create function public.transition_postdated_cheque(
  p_acting_branch_id uuid,
  p_cheque_id uuid,
  p_to_status text,
  p_reason text,
  p_idempotency_key text
)
returns table(event_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor uuid := (select auth.uid());
  v_cheque public.postdated_cheques%rowtype;
  v_event_id uuid;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or v_actor is null then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  select cheque.* into v_cheque
  from public.postdated_cheques as cheque
  where cheque.id = p_cheque_id and cheque.organization_id = v_organization_id;

  if not found then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if not private.has_billing_permission_at_branch(v_cheque.branch_id, 'payment.record') then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_to_status = 'CLEARED' then
    raise exception using errcode = 'P0001', message = 'invalid state';
  end if;

  if p_to_status not in ('DEPOSITED','CANCELLED','REPLACED','BOUNCED')
     or p_reason is null or btrim(p_reason) = '' or length(p_reason) > 500 then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  insert into public.postdated_cheque_status_events (
    organization_id, cheque_id, from_status, to_status, actor, reason, idempotency_key
  ) values (
    v_organization_id, p_cheque_id, v_cheque.status, p_to_status, v_actor, btrim(p_reason), p_idempotency_key
  ) returning id into v_event_id;

  perform private.record_billing_audit(
    v_organization_id, v_cheque.branch_id, 'billing.pdc.transitioned', 'postdated_cheque',
    p_cheque_id, v_cheque.patient_id,
    jsonb_build_object('cheque_id', p_cheque_id::text, 'from_status', v_cheque.status, 'to_status', p_to_status, 'idempotency_key', p_idempotency_key)
  );

  return query select v_event_id;
end;
$$;
revoke all on function public.transition_postdated_cheque(uuid,uuid,text,text,text)
from public, anon, authenticated, service_role;

-- Clear a deposited cheque: one atomic transaction converts the proposed
-- allocations into a single CHEQUE payment and confirmed allocations plus
-- earning entries. Stale proposed coverage fails in full; no partial artifacts
-- remain. Requires payment.record at the receiving branch and every origin
-- branch.
create function public.clear_postdated_cheque(
  p_acting_branch_id uuid,
  p_cheque_id uuid,
  p_idempotency_key text
)
returns table(payment_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor uuid := (select auth.uid());
  v_cheque public.postdated_cheques%rowtype;
  v_method_id uuid;
  v_new_payment_id uuid;
  r_proposed record;
  v_proposed_sum bigint := 0;
  v_allocated_sum bigint := 0;
  v_charge_id uuid;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or v_actor is null then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  select cheque.* into v_cheque
  from public.postdated_cheques as cheque
  where cheque.id = p_cheque_id and cheque.organization_id = v_organization_id
  for update;

  if not found then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if not private.has_billing_permission_at_branch(v_cheque.branch_id, 'payment.record') then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if v_cheque.status <> 'DEPOSITED' then
    raise exception using errcode = 'P0001', message = 'invalid state';
  end if;

  -- Revalidate every proposed allocation against the current adjusted due; any
  -- stale proposal fails the whole clearance with no partial artifacts.
  for r_proposed in
    select proposed.id as proposed_id, proposed.charge_id, proposed.amount_centavos,
           private.charge_due(proposed.charge_id, v_organization_id) as due
    from public.postdated_cheque_allocations as proposed
    where proposed.cheque_id = p_cheque_id and proposed.organization_id = v_organization_id
    order by proposed.id
    for update of proposed
  loop
    if r_proposed.amount_centavos > r_proposed.due then
      raise exception using errcode = 'P0001', message = 'stale proposed coverage';
    end if;
    if not private.has_billing_permission_at_branch((select branch_id from public.charges where id = r_proposed.charge_id), 'payment.record') then
      raise insufficient_privilege using message = 'not authorized';
    end if;
    v_proposed_sum := v_proposed_sum + r_proposed.amount_centavos;
  end loop;

  if v_proposed_sum > v_cheque.amount_centavos then
    raise exception using errcode = 'P0001', message = 'stale proposed coverage';
  end if;

  select id into v_method_id from public.payment_methods
  where organization_id = v_organization_id and code = 'CHEQUE' and active;

  if v_method_id is null then
    raise exception using errcode = 'P0001', message = 'invalid state';
  end if;

  insert into public.payments (
    organization_id, patient_id, branch_id, payment_method_id, amount_centavos,
    reference, received_by, postdated_cheque_id, idempotency_key
  ) values (
    v_organization_id, v_cheque.patient_id, v_cheque.branch_id, v_method_id,
    v_cheque.amount_centavos, null, v_actor, p_cheque_id, p_idempotency_key
  ) returning id into v_new_payment_id;

  for r_proposed in
    select proposed.charge_id, proposed.amount_centavos
    from public.postdated_cheque_allocations as proposed
    where proposed.cheque_id = p_cheque_id and proposed.organization_id = v_organization_id
    order by proposed.id
  loop
    insert into public.payment_allocations (
      organization_id, payment_id, charge_id, patient_id, amount_centavos, allocated_by, idempotency_key
    ) values (
      v_organization_id, v_new_payment_id, r_proposed.charge_id, v_cheque.patient_id,
      r_proposed.amount_centavos, v_actor, 'clear-alloc-' || v_new_payment_id::text || '-' || r_proposed.charge_id::text
    );
    perform private.sync_charge_earnings(v_organization_id, r_proposed.charge_id, 'REALLOCATION');
  end loop;

  insert into public.postdated_cheque_status_events (
    organization_id, cheque_id, from_status, to_status, actor, reason, idempotency_key
  ) values (
    v_organization_id, p_cheque_id, v_cheque.status, 'CLEARED', v_actor, 'cleared', 'clear-event-' || p_idempotency_key
  );

  perform private.record_billing_audit(
    v_organization_id, v_cheque.branch_id, 'billing.pdc.cleared', 'postdated_cheque',
    p_cheque_id, v_cheque.patient_id,
    jsonb_build_object('cheque_id', p_cheque_id::text, 'payment_id', v_new_payment_id::text, 'idempotency_key', p_idempotency_key)
  );

  return query select v_new_payment_id;
end;
$$;
revoke all on function public.clear_postdated_cheque(uuid,uuid,text)
from public, anon, authenticated, service_role;

-- List active payment methods for the organization.
create function public.list_payment_methods(p_acting_branch_id uuid)
returns table(method_id uuid, code text, name text, active boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or (select auth.uid()) is null
     or not private.has_billing_permission_at_branch(p_acting_branch_id, 'billing.read') then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  return query
  select method.id, method.code, method.name, method.active
  from public.payment_methods as method
  where method.organization_id = v_organization_id
  order by method.code;
end;
$$;
revoke all on function public.list_payment_methods(uuid)
from public, anon, authenticated, service_role;

-- Create or update an organization payment method with optimistic versioning.
create function public.upsert_payment_method(
  p_acting_branch_id uuid,
  p_code text,
  p_name text,
  p_active boolean,
  p_payment_method_id uuid,
  p_expected_version integer,
  p_idempotency_key text
)
returns table(method_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor uuid := (select auth.uid());
  v_new_method_id uuid;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or v_actor is null
     or not private.has_billing_permission_at_branch(p_acting_branch_id, 'billing.adjust') then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_code is null or p_code !~ '^[A-Z][A-Z0-9_]*$' or length(p_code) > 40
     or p_name is null or btrim(p_name) = '' or length(p_name) > 100 then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  if p_payment_method_id is null then
    insert into public.payment_methods (organization_id, code, name, active)
    values (v_organization_id, p_code, btrim(p_name), coalesce(p_active, true))
    returning id into v_new_method_id;
  else
    update public.payment_methods as method
    set code = p_code, name = btrim(p_name), active = coalesce(p_active, method.active),
        version = method.version + 1, updated_at = statement_timestamp()
    where method.organization_id = v_organization_id and method.id = p_payment_method_id
      and (p_expected_version is null or method.version = p_expected_version)
    returning method.id into v_new_method_id;
    if v_new_method_id is null then
      raise exception using errcode = 'P0001', message = 'stale version';
    end if;
  end if;

  perform private.record_billing_audit(
    v_organization_id, p_acting_branch_id, 'billing.payment_method.upserted', 'payment_method',
    v_new_method_id, null,
    jsonb_build_object('method_code', p_code, 'idempotency_key', p_idempotency_key)
  );

  return query select v_new_method_id;
end;
$$;
revoke all on function public.upsert_payment_method(uuid,text,text,boolean,uuid,integer,text)
from public, anon, authenticated, service_role;
-- Set an effective-dated compensation agreement. Overlapping ACTIVE agreements
-- for a provider are rejected by the exclusion constraint. Ending an agreement
-- requires compensation.manage and is audited.
create function public.set_provider_compensation_agreement(
  p_acting_branch_id uuid,
  p_provider_id uuid,
  p_effective_from date,
  p_effective_to date,
  p_default_rate_bps integer,
  p_basis text,
  p_idempotency_key text
)
returns table(agreement_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor uuid := (select auth.uid());
  v_new_agreement_id uuid;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or v_actor is null
     or not private.has_billing_permission_at_branch(p_acting_branch_id, 'compensation.manage') then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if not exists (select 1 from public.providers as provider
                 where provider.id = p_provider_id and provider.organization_id = v_organization_id and provider.status = 'active') then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_effective_from is null or p_default_rate_bps not between 0 and 10000
     or p_basis not in ('GROSS','NET_DIRECT_COST')
     or (p_effective_to is not null and p_effective_to < p_effective_from) then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  insert into public.provider_compensation_agreements (
    organization_id, provider_id, effective_from, effective_to, default_rate_bps, basis, created_by
  ) values (
    v_organization_id, p_provider_id, p_effective_from, p_effective_to, p_default_rate_bps, p_basis, v_actor
  ) returning id into v_new_agreement_id;

  perform private.record_billing_audit(
    v_organization_id, p_acting_branch_id, 'billing.compensation_agreement.set', 'provider_compensation_agreement',
    v_new_agreement_id, null,
    jsonb_build_object('agreement_id', v_new_agreement_id::text, 'provider_id', p_provider_id, 'idempotency_key', p_idempotency_key)
  );

  return query select v_new_agreement_id;
end;
$$;
revoke all on function public.set_provider_compensation_agreement(uuid,uuid,date,date,integer,text,text)
from public, anon, authenticated, service_role;

-- List charges with unresolved allocated compensation so OWNER/ADMIN can resolve
-- them explicitly instead of silently treating them as 0%.
create function public.list_unresolved_charge_compensation(
  p_acting_branch_id uuid,
  p_patient_id uuid default null
)
returns table(charge_id uuid, patient_id uuid, branch_id uuid, provider_id uuid, service_date date, amount_centavos bigint, net_allocated_centavos bigint, resolution_state text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or (select auth.uid()) is null
     or not private.has_billing_permission_at_branch(p_acting_branch_id, 'compensation.manage') then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  return query
  select charge.id, charge.patient_id, charge.branch_id, charge.provider_id, charge.service_date,
         charge.amount_centavos, private.charge_net_allocated(charge.id, v_organization_id),
         coalesce((select resolution.state from private.charge_current_resolution(charge.id, v_organization_id) as resolution), 'UNRESOLVED')
  from public.charges as charge
  where charge.organization_id = v_organization_id
    and not charge.non_clinical
    and not private.charge_is_voided(charge.id, v_organization_id)
    and private.charge_net_allocated(charge.id, v_organization_id) > 0
    and (p_patient_id is null or charge.patient_id = p_patient_id)
    and coalesce((select resolution.state from private.charge_current_resolution(charge.id, v_organization_id) as resolution), 'UNRESOLVED') <> 'RESOLVED'
  order by charge.service_date, charge.id
  limit 500;
end;
$$;
revoke all on function public.list_unresolved_charge_compensation(uuid,uuid)
from public, anon, authenticated, service_role;

-- Resolve a charge's compensation server-side: if the latest resolution is
-- already RESOLVED the operation is a no-op denial; otherwise it appends the
-- eligible agreement snapshot (or NO_ACTIVE_AGREEMENT) and the cumulative
-- earning target at resolution time without rewriting the charge.
create function public.resolve_charge_compensation(
  p_acting_branch_id uuid,
  p_charge_id uuid,
  p_reason text,
  p_idempotency_key text
)
returns table(resolution_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor uuid := (select auth.uid());
  v_charge public.charges%rowtype;
  v_attribution_provider uuid;
  v_service_date date;
  v_resolved_agreement uuid;
  v_resolved_rate integer;
  v_resolved_basis text;
  v_allocated bigint;
  v_net_cost bigint;
  v_target bigint;
  v_new_resolution_id uuid;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or v_actor is null
     or not private.has_billing_permission_at_branch(p_acting_branch_id, 'compensation.manage') then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  select charge.* into v_charge
  from public.charges as charge
  where charge.id = p_charge_id and charge.organization_id = v_organization_id
  for update;

  if not found then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_reason is null or btrim(p_reason) = '' or length(p_reason) > 500 then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  if exists (select 1 from private.charge_current_resolution(p_charge_id, v_organization_id) as resolution where resolution.state = 'RESOLVED') then
    raise exception using errcode = 'P0001', message = 'invalid state';
  end if;

  select attribution.provider_id, attribution.service_date
    into v_attribution_provider, v_service_date
  from private.charge_current_attribution(p_charge_id, v_organization_id) as attribution;

  if v_attribution_provider is null then
    raise exception using errcode = 'P0001', message = 'invalid state';
  end if;

  select resolved.agreement_id, resolved.rate_bps, resolved.basis
    into v_resolved_agreement, v_resolved_rate, v_resolved_basis
  from private.resolve_compensation_rate(v_organization_id, v_attribution_provider, v_charge.procedure_id, v_service_date) as resolved;

  if v_resolved_agreement is null then
    insert into public.charge_compensation_resolutions (
      organization_id, charge_id, state, agreement_id, rate_bps, basis,
      authoritative_service_date, resolved_by, reason, idempotency_key
    ) values (
      v_organization_id, p_charge_id, 'NO_ACTIVE_AGREEMENT', null, null, null,
      v_service_date, v_actor, btrim(p_reason), p_idempotency_key
    ) returning id into v_new_resolution_id;
  else
    insert into public.charge_compensation_resolutions (
      organization_id, charge_id, state, agreement_id, rate_bps, basis,
      authoritative_service_date, resolved_by, reason, idempotency_key
    ) values (
      v_organization_id, p_charge_id, 'RESOLVED', v_resolved_agreement, v_resolved_rate,
      v_resolved_basis, v_service_date, v_actor, btrim(p_reason), p_idempotency_key
    ) returning id into v_new_resolution_id;

    v_allocated := private.charge_net_allocated(p_charge_id, v_organization_id);
    v_net_cost := coalesce((
      select sum(entry.amount_centavos) from public.charge_direct_costs as entry
      where entry.charge_id = p_charge_id and entry.organization_id = v_organization_id and entry.event_type = 'APPROVAL'
    ), 0::bigint) - coalesce((
      select sum(entry.amount_centavos) from public.charge_direct_costs as entry
      where entry.charge_id = p_charge_id and entry.organization_id = v_organization_id and entry.event_type = 'REVERSAL'
    ), 0::bigint);
    v_target := private.earning_cumulative_target(v_resolved_basis, v_allocated, v_net_cost, v_resolved_rate);
    if v_target <> 0 then
      insert into public.provider_earning_entries (
        organization_id, provider_id, charge_id, entry_type, cause,
        eligible_basis_centavos, net_approved_cost_centavos, rate_bps,
        earning_centavos, created_by, idempotency_key
      ) values (
        v_organization_id, v_attribution_provider, p_charge_id, 'ACCRUAL', 'DIRECT_COST',
        v_allocated, v_net_cost, v_resolved_rate, v_target, v_actor,
        'resolve-acc-' || p_charge_id::text || '-' || v_new_resolution_id::text
      );
    end if;
  end if;

  perform private.record_billing_audit(
    v_organization_id, v_charge.branch_id, 'billing.compensation_resolved', 'charge_compensation_resolution',
    v_new_resolution_id, v_charge.patient_id,
    jsonb_build_object('resolution_id', v_new_resolution_id::text, 'charge_id', p_charge_id::text, 'idempotency_key', p_idempotency_key)
  );

  return query select v_new_resolution_id;
end;
$$;
revoke all on function public.resolve_charge_compensation(uuid,uuid,text,text)
from public, anon, authenticated, service_role;

-- Provider-own earnings projection. compensation.manage grants any provider in
-- the organization; compensation.own.read resolves the actor's own provider and
-- is additionally scoped by branch assignment for the origin branch.
create function public.list_provider_earnings(
  p_acting_branch_id uuid,
  p_provider_id uuid default null,
  p_from date default null,
  p_to date default null
)
returns table(provider_id uuid, charge_id uuid, entry_type text, cause text, service_date date, earning_centavos bigint, rate_bps integer, occurred_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_target_provider uuid;
  v_manage boolean;
  v_own boolean;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or (select auth.uid()) is null then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  v_manage := private.has_billing_permission_at_branch(p_acting_branch_id, 'compensation.manage');
  v_own := private.has_billing_permission_at_branch(p_acting_branch_id, 'compensation.own.read');

  if not (v_manage or v_own) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if v_manage then
    if p_provider_id is not null and not exists (
      select 1 from public.providers as provider where provider.id = p_provider_id and provider.organization_id = v_organization_id
    ) then
      raise insufficient_privilege using message = 'not authorized';
    end if;
    v_target_provider := p_provider_id;
  else
    v_target_provider := private.resolve_actor_provider(v_organization_id);
    if v_target_provider is null then
      raise insufficient_privilege using message = 'not authorized';
    end if;
  end if;

  return query
  select entry.provider_id, entry.charge_id, entry.entry_type, entry.cause,
         charge.service_date, entry.earning_centavos, entry.rate_bps, entry.occurred_at
  from public.provider_earning_entries as entry
  join public.charges as charge on charge.id = entry.charge_id and charge.organization_id = entry.organization_id
  where entry.organization_id = v_organization_id
    and (v_target_provider is null or entry.provider_id = v_target_provider)
    and (p_from is null or charge.service_date >= p_from)
    and (p_to is null or charge.service_date <= p_to)
    and (v_manage or private.has_billing_permission_at_branch(charge.branch_id, 'compensation.own.read'))
  order by entry.occurred_at, entry.id
  limit 1000;
end;
$$;
revoke all on function public.list_provider_earnings(uuid,uuid,date,date)
from public, anon, authenticated, service_role;
