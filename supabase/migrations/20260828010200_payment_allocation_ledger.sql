-- B3: cleared-money ledger. Payments are immutable; allocations, reversals,
-- refunds, refund components, and voids are append-only events. No browser
-- grants or RPCs are introduced here; B6 supplies the only mutation boundary
-- and enforces the cumulative under-lock caps that these tables record.

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  patient_id uuid not null,
  branch_id uuid not null,
  payment_method_id uuid not null,
  amount_centavos bigint not null,
  currency_code char(3) not null default 'PHP',
  reference text,
  received_at timestamptz not null default statement_timestamp(),
  received_by uuid references auth.users(id) on delete set null,
  postdated_cheque_id uuid,
  idempotency_key text not null,
  version integer not null default 1,
  created_at timestamptz not null default statement_timestamp(),
  constraint payments_patient_fk foreign key (organization_id,patient_id) references public.patients(organization_id,id) on delete restrict,
  constraint payments_branch_fk foreign key (organization_id,branch_id) references public.branches(organization_id,id) on delete restrict,
  constraint payments_method_fk foreign key (organization_id,payment_method_id) references public.payment_methods(organization_id,id) on delete restrict,
  constraint payments_amount_check check (amount_centavos between 1 and 99999999999),
  constraint payments_currency_check check (currency_code='PHP'),
  constraint payments_reference_check check (reference is null or (btrim(reference)<>'' and length(reference)<=80)),
  constraint payments_idempotency_check check (length(idempotency_key) between 1 and 128),
  constraint payments_version_check check (version > 0),
  unique (organization_id,id), unique (organization_id,idempotency_key)
);
revoke all on table public.payments from public, anon, authenticated, service_role;
create trigger payments_append_only before update or delete on public.payments for each row execute function private.prevent_billing_ledger_mutation();
alter table public.payments enable row level security;
create index payments_org_patient_received_idx on public.payments(organization_id,patient_id,received_at);
create index payments_org_branch_received_idx on public.payments(organization_id,branch_id,received_at);
create index payments_org_method_received_idx on public.payments(organization_id,payment_method_id,received_at);

create table public.payment_allocations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  payment_id uuid not null,
  charge_id uuid not null,
  patient_id uuid not null,
  amount_centavos bigint not null,
  allocated_at timestamptz not null default statement_timestamp(),
  allocated_by uuid references auth.users(id) on delete set null,
  idempotency_key text not null,
  constraint payment_allocations_payment_fk foreign key (organization_id,payment_id) references public.payments(organization_id,id) on delete restrict,
  constraint payment_allocations_charge_fk foreign key (organization_id,charge_id) references public.charges(organization_id,id) on delete restrict,
  constraint payment_allocations_patient_fk foreign key (organization_id,patient_id) references public.patients(organization_id,id) on delete restrict,
  constraint payment_allocations_amount_check check (amount_centavos between 1 and 99999999999),
  constraint payment_allocations_idempotency_check check (length(idempotency_key) between 1 and 128),
  unique (organization_id,id), unique (organization_id,idempotency_key)
);
revoke all on table public.payment_allocations from public, anon, authenticated, service_role;
create trigger payment_allocations_append_only before update or delete on public.payment_allocations for each row execute function private.prevent_billing_ledger_mutation();
alter table public.payment_allocations enable row level security;
create index payment_allocations_org_payment_idx on public.payment_allocations(organization_id,payment_id);
create index payment_allocations_org_charge_idx on public.payment_allocations(organization_id,charge_id);
create index payment_allocations_org_patient_idx on public.payment_allocations(organization_id,patient_id);

create table public.payment_refunds (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  payment_id uuid not null,
  patient_id uuid not null,
  amount_centavos bigint not null,
  reason text not null,
  refunded_at timestamptz not null default statement_timestamp(),
  refunded_by uuid references auth.users(id) on delete set null,
  idempotency_key text not null,
  constraint payment_refunds_payment_fk foreign key (organization_id,payment_id) references public.payments(organization_id,id) on delete restrict,
  constraint payment_refunds_patient_fk foreign key (organization_id,patient_id) references public.patients(organization_id,id) on delete restrict,
  constraint payment_refunds_amount_check check (amount_centavos between 1 and 99999999999),
  constraint payment_refunds_reason_check check (btrim(reason)<>'' and length(reason)<=500),
  constraint payment_refunds_idempotency_check check (length(idempotency_key) between 1 and 128),
  unique (organization_id,id), unique (organization_id,idempotency_key)
);
revoke all on table public.payment_refunds from public, anon, authenticated, service_role;
create trigger payment_refunds_append_only before update or delete on public.payment_refunds for each row execute function private.prevent_billing_ledger_mutation();
alter table public.payment_refunds enable row level security;
create index payment_refunds_org_payment_idx on public.payment_refunds(organization_id,payment_id);
create index payment_refunds_org_patient_idx on public.payment_refunds(organization_id,patient_id);

create table public.payment_refund_allocations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  refund_id uuid not null,
  payment_id uuid not null,
  allocation_id uuid,
  amount_centavos bigint not null,
  constraint payment_refund_allocations_refund_fk foreign key (organization_id,refund_id) references public.payment_refunds(organization_id,id) on delete restrict,
  constraint payment_refund_allocations_payment_fk foreign key (organization_id,payment_id) references public.payments(organization_id,id) on delete restrict,
  constraint payment_refund_allocations_allocation_fk foreign key (organization_id,allocation_id) references public.payment_allocations(organization_id,id) on delete restrict,
  constraint payment_refund_allocations_amount_check check (amount_centavos between 1 and 99999999999),
  unique (organization_id,id)
);
revoke all on table public.payment_refund_allocations from public, anon, authenticated, service_role;
create trigger payment_refund_allocations_append_only before update or delete on public.payment_refund_allocations for each row execute function private.prevent_billing_ledger_mutation();
alter table public.payment_refund_allocations enable row level security;
create index payment_refund_allocations_org_refund_idx on public.payment_refund_allocations(organization_id,refund_id);
create index payment_refund_allocations_org_allocation_idx on public.payment_refund_allocations(organization_id,allocation_id) where allocation_id is not null;

create table public.payment_allocation_reversals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  allocation_id uuid not null,
  payment_refund_allocation_id uuid,
  cause text not null,
  amount_centavos bigint not null,
  reason text not null,
  reversed_at timestamptz not null default statement_timestamp(),
  reversed_by uuid references auth.users(id) on delete set null,
  idempotency_key text not null,
  constraint payment_allocation_reversals_allocation_fk foreign key (organization_id,allocation_id) references public.payment_allocations(organization_id,id) on delete restrict,
  constraint payment_allocation_reversals_refund_component_fk foreign key (organization_id,payment_refund_allocation_id) references public.payment_refund_allocations(organization_id,id) on delete restrict,
  constraint payment_allocation_reversals_cause_check check (cause in ('MANUAL','REFUND','VOID')),
  constraint payment_allocation_reversals_amount_check check (amount_centavos between 1 and 99999999999),
  constraint payment_allocation_reversals_reason_check check (btrim(reason)<>'' and length(reason)<=500),
  constraint payment_allocation_reversals_idempotency_check check (length(idempotency_key) between 1 and 128),
  constraint payment_allocation_reversals_refund_cause_link_check check ((cause='REFUND') = (payment_refund_allocation_id is not null)),
  unique (organization_id,id), unique (organization_id,idempotency_key)
);
revoke all on table public.payment_allocation_reversals from public, anon, authenticated, service_role;
create trigger payment_allocation_reversals_append_only before update or delete on public.payment_allocation_reversals for each row execute function private.prevent_billing_ledger_mutation();
alter table public.payment_allocation_reversals enable row level security;
create unique index payment_allocation_reversals_one_refund_component_idx on public.payment_allocation_reversals(organization_id,payment_refund_allocation_id) where payment_refund_allocation_id is not null;
create index payment_allocation_reversals_org_allocation_idx on public.payment_allocation_reversals(organization_id,allocation_id);

create table public.payment_voids (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  payment_id uuid not null,
  reason text not null,
  voided_at timestamptz not null default statement_timestamp(),
  voided_by uuid references auth.users(id) on delete set null,
  constraint payment_voids_payment_fk foreign key (organization_id,payment_id) references public.payments(organization_id,id) on delete restrict,
  constraint payment_voids_reason_check check (btrim(reason)<>'' and length(reason)<=500),
  unique (organization_id,payment_id), unique (organization_id,id)
);
revoke all on table public.payment_voids from public, anon, authenticated, service_role;
create trigger payment_voids_append_only before update or delete on public.payment_voids for each row execute function private.prevent_billing_ledger_mutation();
alter table public.payment_voids enable row level security;

create or replace function private.validate_payment_allocation_patient_scope()
returns trigger language plpgsql set search_path = '' as $$
declare v_payment_patient uuid; v_charge_patient uuid;
begin
  select payment.patient_id into v_payment_patient
  from public.payments as payment where payment.id = new.payment_id;
  select charge.patient_id into v_charge_patient
  from public.charges as charge where charge.id = new.charge_id;
  if v_payment_patient is null or v_charge_patient is null
     or v_payment_patient <> new.patient_id or v_charge_patient <> new.patient_id then
    raise check_violation using message = 'payment allocation patient must match the payment and charge patient';
  end if;
  return new;
end;
$$;
revoke all on function private.validate_payment_allocation_patient_scope() from public, anon, authenticated, service_role;

create trigger payment_allocations_validate_patient_scope
before insert on public.payment_allocations
for each row execute function private.validate_payment_allocation_patient_scope();

create or replace function private.validate_refund_component_reversal_equality()
returns trigger language plpgsql set search_path = '' as $$
declare v_component_amount bigint;
begin
  if new.payment_refund_allocation_id is not null then
    select component.amount_centavos into v_component_amount
    from public.payment_refund_allocations as component
    where component.id = new.payment_refund_allocation_id;
    if v_component_amount is null or new.amount_centavos <> v_component_amount then
      raise check_violation using message = 'refund allocation reversal must exactly equal its refund component';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.validate_refund_component_reversal_equality() from public, anon, authenticated, service_role;

create trigger payment_allocation_reversals_validate_refund_component
before insert on public.payment_allocation_reversals
for each row execute function private.validate_refund_component_reversal_equality();

-- Derived-balance helpers. These are intentionally private and used only by the
-- B6 SECURITY DEFINER RPCs; they reference tables with a pinned search path.

create or replace function private.payment_availability(p_payment_id uuid, p_organization_id uuid)
returns bigint language sql stable set search_path = '' as $$
  select case
    when exists (
      select 1 from public.payment_voids as void
      where void.payment_id = p_payment_id and void.organization_id = p_organization_id
    ) then 0::bigint
    else payment.amount_centavos
  end
    - coalesce((select sum(refund.amount_centavos) from public.payment_refunds as refund where refund.payment_id = p_payment_id and refund.organization_id = p_organization_id), 0::bigint)
    - coalesce((select sum(allocation.amount_centavos) from public.payment_allocations as allocation where allocation.payment_id = p_payment_id and allocation.organization_id = p_organization_id), 0::bigint)
    + coalesce((select sum(reversal.amount_centavos) from public.payment_allocation_reversals as reversal join public.payment_allocations as allocation on allocation.id = reversal.allocation_id and allocation.organization_id = p_organization_id where allocation.payment_id = p_payment_id), 0::bigint)
  from public.payments as payment
  where payment.id = p_payment_id and payment.organization_id = p_organization_id;
$$;
revoke all on function private.payment_availability(uuid,uuid) from public, anon, authenticated, service_role;

create or replace function private.charge_adjusted_amount(p_charge_id uuid, p_organization_id uuid)
returns bigint language sql stable set search_path = '' as $$
  select charge.amount_centavos
    - coalesce((select sum(adjustment.amount_centavos) from public.charge_adjustments as adjustment
      where adjustment.charge_id = p_charge_id and adjustment.organization_id = p_organization_id
        and adjustment.direction = 'CREDIT'
        and not exists (select 1 from public.charge_adjustment_reversals as reversal
          where reversal.adjustment_id = adjustment.id and reversal.organization_id = p_organization_id)), 0::bigint)
    + coalesce((select sum(adjustment.amount_centavos) from public.charge_adjustments as adjustment
      where adjustment.charge_id = p_charge_id and adjustment.organization_id = p_organization_id
        and adjustment.direction = 'DEBIT'
        and not exists (select 1 from public.charge_adjustment_reversals as reversal
          where reversal.adjustment_id = adjustment.id and reversal.organization_id = p_organization_id)), 0::bigint)
  from public.charges as charge
  where charge.id = p_charge_id and charge.organization_id = p_organization_id;
$$;
revoke all on function private.charge_adjusted_amount(uuid,uuid) from public, anon, authenticated, service_role;

create or replace function private.charge_net_allocated(p_charge_id uuid, p_organization_id uuid)
returns bigint language sql stable set search_path = '' as $$
  select coalesce((select sum(allocation.amount_centavos) from public.payment_allocations as allocation where allocation.charge_id = p_charge_id and allocation.organization_id = p_organization_id), 0::bigint)
    - coalesce((select sum(reversal.amount_centavos) from public.payment_allocation_reversals as reversal join public.payment_allocations as allocation on allocation.id = reversal.allocation_id and allocation.organization_id = p_organization_id where allocation.charge_id = p_charge_id), 0::bigint);
$$;
revoke all on function private.charge_net_allocated(uuid,uuid) from public, anon, authenticated, service_role;

create or replace function private.charge_due(p_charge_id uuid, p_organization_id uuid)
returns bigint language sql stable set search_path = '' as $$
  select private.charge_adjusted_amount(p_charge_id, p_organization_id)
    - private.charge_net_allocated(p_charge_id, p_organization_id);
$$;
revoke all on function private.charge_due(uuid,uuid) from public, anon, authenticated, service_role;

create or replace function private.patient_account_balance(p_patient_id uuid, p_organization_id uuid)
returns bigint language sql stable set search_path = '' as $$
  select coalesce((select sum(private.charge_due(charge.id, p_organization_id)) from public.charges as charge
    where charge.patient_id = p_patient_id and charge.organization_id = p_organization_id
      and not exists (select 1 from public.charge_voids as void where void.charge_id = charge.id and void.organization_id = p_organization_id)), 0::bigint)
    - coalesce((select sum(private.payment_availability(payment.id, p_organization_id)) from public.payments as payment
      where payment.patient_id = p_patient_id and payment.organization_id = p_organization_id), 0::bigint);
$$;
revoke all on function private.patient_account_balance(uuid,uuid) from public, anon, authenticated, service_role;