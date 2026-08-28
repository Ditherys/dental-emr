-- B9: bounded financial analytics. Two narrow SECURITY DEFINER aggregate
-- projections. Requires financial.analytics.read at the acting branch (or
-- compensation.manage for the summary) and billing.read for the pending PDC
-- report. No base-table grants.

create function public.get_financial_summary(
  p_acting_branch_id uuid,
  p_branch_id uuid default null,
  p_from date default null,
  p_to date default null
)
returns table(
  period text,
  metric_code text,
  metric_label text,
  branch_id uuid,
  provider_id uuid,
  procedure_id uuid,
  payment_method_code text,
  production_centavos bigint,
  collection_centavos bigint,
  pending_pdc_centavos bigint,
  clinic_contribution_centavos bigint,
  unresolved_compensation_centavos bigint
)
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v_organization_id uuid;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or (select auth.uid()) is null then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if not (
    private.has_billing_permission_at_branch(p_acting_branch_id, 'financial.analytics.read')
    or private.has_billing_permission_at_branch(p_acting_branch_id, 'compensation.manage')
  ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  return query
  with production as (
    select date_trunc('day', charge.posted_at)::date as day,
           sum(case when not private.charge_is_voided(charge.id, v_organization_id) then charge.amount_centavos end) as centavos
    from public.charges as charge
    where charge.organization_id = v_organization_id
      and (p_branch_id is null or charge.branch_id = p_branch_id)
      and (p_from is null or charge.service_date >= p_from)
      and (p_to is null or charge.service_date <= p_to)
    group by 1
  ),
  collections as (
    select date_trunc('day', payment.received_at)::date as day,
           sum(payment.amount_centavos) as centavos
    from public.payments as payment
    where payment.organization_id = v_organization_id
      and (p_branch_id is null or payment.branch_id = p_branch_id)
      and (p_from is null or date_trunc('day', payment.received_at)::date >= p_from)
      and (p_to is null or date_trunc('day', payment.received_at)::date <= p_to)
    group by 1
  ),
  pending as (
    select date_trunc('day', cheque.created_at)::date as day,
           sum(cheque.amount_centavos) as centavos
    from public.postdated_cheques as cheque
    where cheque.organization_id = v_organization_id
      and (p_branch_id is null or cheque.branch_id = p_branch_id)
      and cheque.status in ('HELD', 'DEPOSITED', 'BOUNCED')
    group by 1
  ),
  contribution as (
    select date_trunc('day', entry.occurred_at)::date as day,
           sum(entry.earning_centavos) as earnings
    from public.provider_earning_entries as entry
    where entry.organization_id = v_organization_id
      and (p_from is null or date_trunc('day', entry.occurred_at)::date >= p_from)
      and (p_to is null or date_trunc('day', entry.occurred_at)::date <= p_to)
    group by 1
  )
  select
    coalesce(to_char(p.day, 'YYYY-MM-DD'), '') as period,
    'PRODUCTION'::text, 'Production'::text,
    null::uuid, null::uuid, null::uuid, null::text,
    coalesce(p.centavos, 0), 0::bigint, 0::bigint, 0::bigint, 0::bigint
  from production p
  union all
  select coalesce(to_char(c.day, 'YYYY-MM-DD'), ''), 'COLLECTION'::text, 'Collections'::text,
    null::uuid, null::uuid, null::uuid, null::text,
    0::bigint, coalesce(c.centavos, 0), 0::bigint, 0::bigint, 0::bigint
  from collections c
  union all
  select coalesce(to_char(pd.day, 'YYYY-MM-DD'), ''), 'PENDING_PDC'::text, 'Pending PDC'::text,
    null::uuid, null::uuid, null::uuid, null::text,
    0::bigint, 0::bigint, coalesce(pd.centavos, 0), 0::bigint, 0::bigint
  from pending pd
  union all
  select coalesce(to_char(co.day, 'YYYY-MM-DD'), ''), 'CLINIC_CONTRIBUTION'::text, 'Clinic contribution'::text,
    null::uuid, null::uuid, null::uuid, null::text,
    0::bigint, 0::bigint, 0::bigint, coalesce(co.earnings, 0), 0::bigint
  from contribution co
  order by 1, 2;
end;
$$;
revoke all on function public.get_financial_summary(uuid,uuid,date,date)
from public, anon, authenticated, service_role;

create function public.list_pending_pdc(
  p_acting_branch_id uuid,
  p_branch_id uuid default null
)
returns table(
  cheque_id uuid,
  patient_id uuid,
  branch_id uuid,
  amount_centavos bigint,
  date_due date,
  status text,
  bank_name text,
  cheque_number text,
  days_until_due integer
)
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v_organization_id uuid;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or (select auth.uid()) is null then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if not private.has_billing_permission_at_branch(p_acting_branch_id, 'billing.read') then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  return query
  select cheque.id, cheque.patient_id, cheque.branch_id, cheque.amount_centavos,
         cheque.date_due, cheque.status, cheque.bank_name, cheque.cheque_number,
         (cheque.date_due - statement_timestamp()::date)::integer
  from public.postdated_cheques as cheque
  where cheque.organization_id = v_organization_id
    and cheque.status in ('HELD', 'DEPOSITED', 'BOUNCED')
    and (p_branch_id is null or cheque.branch_id = p_branch_id)
  order by cheque.date_due, cheque.id
  limit 500;
end;
$$;
revoke all on function public.list_pending_pdc(uuid,uuid)
from public, anon, authenticated, service_role;
