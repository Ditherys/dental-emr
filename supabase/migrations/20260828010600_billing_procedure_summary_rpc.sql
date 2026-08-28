-- B8: small bounded procedure payment summary projection. Aggregates per
-- procedure across a patient's charges, adjustments, allocations, refunds,
-- voids, and pending PDC for one patient and one procedure. Required: the
-- charge must belong to the same organization and the same patient. Reuses
-- billing.read at the charge-origin branch and payment.record at every
-- payment-receiving branch the projection touches. No base grants; the audit
-- helper is invoked by other mutations only.

create function public.summarize_procedure_charges(
  p_acting_branch_id uuid,
  p_patient_id uuid,
  p_procedure_id uuid
)
returns table(
  procedure_id uuid,
  patient_id uuid,
  branch_id uuid,
  charged_centavos bigint,
  adjusted_centavos bigint,
  paid_centavos bigint,
  pending_pdc_centavos bigint,
  remaining_centavos bigint,
  payment_status text
)
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v_organization_id uuid;
  v_charge_branch uuid;
  v_charged bigint := 0::bigint;
  v_debit_adjustments bigint := 0::bigint;
  v_credit_adjustments bigint := 0::bigint;
  v_refunded bigint := 0::bigint;
  v_paid_to_charges bigint := 0::bigint;
  v_voided bigint := 0::bigint;
  v_pending_pdc bigint := 0::bigint;
  v_remaining bigint := 0::bigint;
  v_payment_status text := 'UNPAID';
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or (select auth.uid()) is null then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if not private.has_billing_permission_at_branch(p_acting_branch_id, 'billing.read') then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if not exists (
    select 1 from public.patients as patient
    where patient.id = p_patient_id and patient.organization_id = v_organization_id
  ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  select charge.branch_id into v_charge_branch
  from public.charges as charge
  where charge.organization_id = v_organization_id
    and charge.patient_id = p_patient_id
    and charge.procedure_id = p_procedure_id
  order by charge.service_date, charge.id
  limit 1;

  if v_charge_branch is null then
    return query
    select p_procedure_id, p_patient_id, p_acting_branch_id,
           0::bigint, 0::bigint, 0::bigint, 0::bigint, 0::bigint, 'UNPAID'::text;
    return;
  end if;

  if not private.has_billing_permission_at_branch(v_charge_branch, 'billing.read') then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  select
    coalesce(sum(case when not private.charge_is_voided(charge.id, v_organization_id) then charge.amount_centavos end), 0::bigint),
    coalesce(sum(case when not private.charge_is_voided(charge.id, v_organization_id) then
      coalesce((
        select sum(adj.amount_centavos) from public.charge_adjustments as adj
        where adj.charge_id = charge.id and adj.organization_id = v_organization_id
          and adj.direction = 'DEBIT'
          and not exists (select 1 from public.charge_adjustment_reversals as rev where rev.adjustment_id = adj.id and rev.organization_id = v_organization_id)
      ), 0::bigint) end), 0::bigint),
    coalesce(sum(case when not private.charge_is_voided(charge.id, v_organization_id) then
      coalesce((
        select sum(adj.amount_centavos) from public.charge_adjustments as adj
        where adj.charge_id = charge.id and adj.organization_id = v_organization_id
          and adj.direction = 'CREDIT'
          and not exists (select 1 from public.charge_adjustment_reversals as rev where rev.adjustment_id = adj.id and rev.organization_id = v_organization_id)
      ), 0::bigint) end), 0::bigint)
  into v_charged, v_debit_adjustments, v_credit_adjustments
  from public.charges as charge
  where charge.organization_id = v_organization_id
    and charge.patient_id = p_patient_id
    and charge.procedure_id = p_procedure_id;

  select coalesce(sum(refund.amount_centavos), 0::bigint) into v_refunded
  from public.payment_refunds as refund
  join public.payments as payment on payment.id = refund.payment_id and payment.organization_id = refund.organization_id
  where refund.organization_id = v_organization_id
    and refund.patient_id = p_patient_id
    and exists (
      select 1 from public.payment_allocations as allocation
      where allocation.organization_id = v_organization_id
        and allocation.payment_id = payment.id
        and allocation.patient_id = p_patient_id
        and exists (
          select 1 from public.charges as charge
          where charge.id = allocation.charge_id and charge.organization_id = v_organization_id
            and charge.patient_id = p_patient_id and charge.procedure_id = p_procedure_id
        )
    );

  select coalesce(sum(allocation.amount_centavos), 0::bigint) into v_paid_to_charges
  from public.payment_allocations as allocation
  where allocation.organization_id = v_organization_id
    and allocation.patient_id = p_patient_id
    and exists (
      select 1 from public.charges as charge
      where charge.id = allocation.charge_id and charge.organization_id = v_organization_id
        and charge.patient_id = p_patient_id and charge.procedure_id = p_procedure_id
    );

  select coalesce(sum(reversal.amount_centavos), 0::bigint) into v_refunded
  from public.payment_allocation_reversals as reversal
  join public.payment_allocations as allocation on allocation.id = reversal.allocation_id and allocation.organization_id = reversal.organization_id
  where reversal.organization_id = v_organization_id
    and allocation.patient_id = p_patient_id
    and reversal.cause = 'REFUND'
    and exists (
      select 1 from public.charges as charge
      where charge.id = allocation.charge_id and charge.organization_id = v_organization_id
        and charge.patient_id = p_patient_id and charge.procedure_id = p_procedure_id
    );

  v_paid_to_charges := v_paid_to_charges - v_refunded;

  select coalesce(sum(cheque.amount_centavos), 0::bigint) into v_pending_pdc
  from public.postdated_cheques as cheque
  where cheque.organization_id = v_organization_id
    and cheque.patient_id = p_patient_id
    and cheque.status in ('HELD', 'DEPOSITED', 'BOUNCED')
    and exists (
      select 1 from public.postdated_cheque_allocations as proposed
      where proposed.organization_id = v_organization_id
        and proposed.cheque_id = cheque.id
        and exists (
          select 1 from public.charges as charge
          where charge.id = proposed.charge_id and charge.organization_id = v_organization_id
            and charge.patient_id = p_patient_id and charge.procedure_id = p_procedure_id
        )
    );

  select coalesce(sum(case when private.charge_is_voided(charge.id, v_organization_id) then charge.amount_centavos end), 0::bigint) into v_voided
  from public.charges as charge
  where charge.organization_id = v_organization_id
    and charge.patient_id = p_patient_id
    and charge.procedure_id = p_procedure_id;

  v_remaining := v_charged + v_debit_adjustments - v_credit_adjustments - v_paid_to_charges - v_voided;
  if v_remaining < 0 then v_remaining := 0; end if;

  if v_voided > 0 and v_remaining = 0 then
    v_payment_status := 'PAID';
  elsif v_paid_to_charges >= v_charged + v_debit_adjustments - v_credit_adjustments then
    v_payment_status := 'PAID';
  elsif v_paid_to_charges > 0 or v_pending_pdc > 0 then
    v_payment_status := 'PARTIAL';
  else
    v_payment_status := 'UNPAID';
  end if;

  return query
  select p_procedure_id, p_patient_id, v_charge_branch,
         v_charged, v_debit_adjustments - v_credit_adjustments,
         v_paid_to_charges, v_pending_pdc, v_remaining, v_payment_status;
end;
$$;
revoke all on function public.summarize_procedure_charges(uuid,uuid,uuid)
from public, anon, authenticated, service_role;

comment on function public.summarize_procedure_charges(uuid,uuid,uuid) is
  'Bounded per-procedure patient payment projection; requires billing.read at the charge-origin branch.';
