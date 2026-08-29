-- B-series fix: get_financial_summary returns numeric where the function
-- signature declares bigint. The CTEs use sum(...) which is numeric in
-- PostgreSQL, but the function signature declares production_centavos,
-- collection_centavos, pending_pdc_centavos, clinic_contribution_centavos,
-- and unresolved_compensation_centavos as bigint. The first union-all
-- branch coalesce(p.centavos, 0) is numeric; PostgreSQL rejects the
-- cast back to bigint at call time with "structure of query does not
-- match function result type / Returned type numeric does not match
-- expected type bigint in column N". This blocks the finance report
-- page even when the seed user has financial.analytics.read.
--
-- The fix wraps each coalesce on a CTE sum with an explicit ::bigint
-- cast so every union-all branch produces bigint in the metric columns.
-- The 0::bigint literals already match. The function body, grants,
-- RLS, and signature are unchanged. This is forward-only and grants
-- nothing new.

create or replace function public.get_financial_summary(
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
set search_path to ''
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
           sum(case when not private.charge_is_voided(charge.id, v_organization_id) then charge.amount_centavos end)::bigint as centavos
    from public.charges as charge
    where charge.organization_id = v_organization_id
      and (p_branch_id is null or charge.branch_id = p_branch_id)
      and (p_from is null or charge.service_date >= p_from)
      and (p_to is null or charge.service_date <= p_to)
    group by 1
  ),
  collections as (
    select date_trunc('day', payment.received_at)::date as day,
           sum(payment.amount_centavos)::bigint as centavos
    from public.payments as payment
    where payment.organization_id = v_organization_id
      and (p_branch_id is null or payment.branch_id = p_branch_id)
      and (p_from is null or date_trunc('day', payment.received_at)::date >= p_from)
      and (p_to is null or date_trunc('day', payment.received_at)::date <= p_to)
    group by 1
  ),
  pending as (
    select date_trunc('day', cheque.created_at)::date as day,
           sum(cheque.amount_centavos)::bigint as centavos
    from public.postdated_cheques as cheque
    where cheque.organization_id = v_organization_id
      and (p_branch_id is null or cheque.branch_id = p_branch_id)
      and cheque.status in ('HELD', 'DEPOSITED', 'BOUNCED')
    group by 1
  ),
  contribution as (
    select date_trunc('day', entry.occurred_at)::date as day,
           sum(entry.earning_centavos)::bigint as earnings
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
    coalesce(p.centavos, 0)::bigint, 0::bigint, 0::bigint, 0::bigint, 0::bigint
  from production p
  union all
  select coalesce(to_char(c.day, 'YYYY-MM-DD'), ''), 'COLLECTION'::text, 'Collections'::text,
    null::uuid, null::uuid, null::uuid, null::text,
    0::bigint, coalesce(c.centavos, 0)::bigint, 0::bigint, 0::bigint, 0::bigint
  from collections c
  union all
  select coalesce(to_char(pd.day, 'YYYY-MM-DD'), ''), 'PENDING_PDC'::text, 'Pending PDC'::text,
    null::uuid, null::uuid, null::uuid, null::text,
    0::bigint, 0::bigint, coalesce(pd.centavos, 0)::bigint, 0::bigint, 0::bigint
  from pending pd
  union all
  select coalesce(to_char(co.day, 'YYYY-MM-DD'), ''), 'CLINIC_CONTRIBUTION'::text, 'Clinic contribution'::text,
    null::uuid, null::uuid, null::uuid, null::text,
    0::bigint, 0::bigint, 0::bigint, coalesce(co.earnings, 0)::bigint, 0::bigint
  from contribution co
  order by 1, 2;
end;
$$;

-- Grants are unchanged: this migration does not introduce any new
-- privilege-bearing object. The existing revoke + migration 20260828010701
-- terminal file (if added later) owns the authenticated grant.
revoke all on function public.get_financial_summary(uuid,uuid,date,date)
from public, anon, authenticated, service_role;

comment on function public.get_financial_summary(uuid,uuid,date,date) is
  'Bounded financial summary projection. Requires financial.analytics.read (or compensation.manage) at the acting branch. CTE sum() columns are cast to bigint to match the function signature; the migration fixes the numeric/bigint union-all mismatch introduced in 20260828010700.';
