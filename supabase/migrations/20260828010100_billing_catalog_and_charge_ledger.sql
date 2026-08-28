-- B2: additive catalog and immutable charge-ledger foundation. No browser
-- grants or RPCs are introduced here; B6 supplies the only mutation boundary.

alter table public.procedures
  add column default_fee_centavos bigint,
  add column currency_code char(3) not null default 'PHP',
  add constraint procedures_default_fee_centavos_check check (
    default_fee_centavos is null or default_fee_centavos between 0 and 99999999999
  ),
  add constraint procedures_currency_code_check check (currency_code = 'PHP');

alter table public.treatment_plan_items
  add column estimated_fee_centavos bigint,
  add constraint treatment_plan_items_estimated_fee_centavos_check check (
    estimated_fee_centavos is null or estimated_fee_centavos between 0 and 99999999999
  );

do $$
begin
  if exists (select 1 from public.treatment_plan_items where estimated_fee is not null and (estimated_fee * 100 <> trunc(estimated_fee * 100) or estimated_fee * 100 > 99999999999)) then
    raise exception 'treatment plan estimate cannot be represented exactly in centavos';
  end if;
end;
$$;

update public.treatment_plan_items
set estimated_fee_centavos = (estimated_fee * 100)::bigint
where estimated_fee is not null;

create table public.payment_methods (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete restrict,
  code text not null, name text not null, active boolean not null default true, version integer not null default 1,
  created_at timestamptz not null default statement_timestamp(), updated_at timestamptz not null default statement_timestamp(),
  constraint payment_methods_code_check check (code ~ '^[A-Z][A-Z0-9_]*$' and length(code) <= 40),
  constraint payment_methods_name_check check (btrim(name) <> '' and length(name) <= 100),
  constraint payment_methods_version_check check (version > 0),
  unique (organization_id, code), unique (organization_id, id)
);
revoke all on table public.payment_methods from public, anon, authenticated, service_role;

create table public.procedure_direct_cost_defaults (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete restrict,
  procedure_id uuid not null, cost_type text not null, description text not null, amount_centavos bigint not null,
  active boolean not null default true, version integer not null default 1, created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default statement_timestamp(), updated_at timestamptz not null default statement_timestamp(),
  constraint procedure_direct_cost_defaults_procedure_fk foreign key (organization_id, procedure_id) references public.procedures(organization_id,id) on delete restrict,
  constraint procedure_direct_cost_defaults_type_check check (cost_type in ('LAB','MATERIAL','OTHER')),
  constraint procedure_direct_cost_defaults_amount_check check (amount_centavos between 0 and 99999999999),
  constraint procedure_direct_cost_defaults_description_check check (btrim(description) <> '' and length(description) <= 500),
  unique (organization_id,id)
);
revoke all on table public.procedure_direct_cost_defaults from public, anon, authenticated, service_role;

create table public.charges (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete restrict,
  patient_id uuid not null, branch_id uuid not null, provider_id uuid, procedure_id uuid, treatment_plan_item_id uuid,
  amount_centavos bigint not null, currency_code char(3) not null default 'PHP', service_date date not null, posted_at timestamptz not null default statement_timestamp(),
  zero_amount_reason text, non_clinical boolean not null default false, idempotency_key text not null, created_by uuid references auth.users(id) on delete set null,
  version integer not null default 1, created_at timestamptz not null default statement_timestamp(),
  constraint charges_patient_fk foreign key (organization_id,patient_id) references public.patients(organization_id,id) on delete restrict,
  constraint charges_branch_fk foreign key (organization_id,branch_id) references public.branches(organization_id,id) on delete restrict,
  constraint charges_provider_fk foreign key (organization_id,provider_id) references public.providers(organization_id,id) on delete restrict,
  constraint charges_procedure_fk foreign key (organization_id,procedure_id) references public.procedures(organization_id,id) on delete restrict,
  constraint charges_plan_item_fk foreign key (organization_id,treatment_plan_item_id) references public.treatment_plan_items(organization_id,id) on delete restrict,
  constraint charges_amount_check check (amount_centavos between 0 and 99999999999), constraint charges_currency_check check (currency_code='PHP'),
  constraint charges_zero_reason_check check ((amount_centavos > 0 and zero_amount_reason is null) or (amount_centavos = 0 and zero_amount_reason is not null and btrim(zero_amount_reason) <> '' and length(zero_amount_reason) <= 500)),
  constraint charges_provider_classification_check check ((provider_id is not null and not non_clinical) or (provider_id is null and non_clinical)),
  constraint charges_idempotency_check check (length(idempotency_key) between 1 and 128), unique (organization_id,id), unique (organization_id,idempotency_key)
);
revoke all on table public.charges from public, anon, authenticated, service_role;

create table public.charge_direct_costs (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete restrict, charge_id uuid not null,
  event_type text not null, reversal_of_id uuid, cost_type text not null, amount_centavos bigint not null, reason text not null, occurred_at timestamptz not null default statement_timestamp(), created_by uuid references auth.users(id) on delete set null, idempotency_key text not null,
  constraint charge_direct_costs_charge_fk foreign key (organization_id,charge_id) references public.charges(organization_id,id) on delete restrict,
  constraint charge_direct_costs_reversal_fk foreign key (organization_id,reversal_of_id) references public.charge_direct_costs(organization_id,id) on delete restrict,
  constraint charge_direct_costs_type_check check (event_type in ('APPROVAL','REVERSAL') and cost_type in ('LAB','MATERIAL','OTHER')),
  constraint charge_direct_costs_amount_check check (amount_centavos > 0 and amount_centavos <= 99999999999),
  constraint charge_direct_costs_reason_check check (btrim(reason)<>'' and length(reason)<=500), unique (organization_id,id), unique (organization_id,idempotency_key)
);
revoke all on table public.charge_direct_costs from public, anon, authenticated, service_role;
create unique index charge_direct_costs_one_reversal_idx on public.charge_direct_costs(organization_id,reversal_of_id) where reversal_of_id is not null;

create table public.charge_adjustments (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete restrict, charge_id uuid not null, direction text not null, amount_centavos bigint not null, reason text not null, occurred_at timestamptz not null default statement_timestamp(), created_by uuid references auth.users(id) on delete set null, idempotency_key text not null,
  constraint charge_adjustments_charge_fk foreign key (organization_id,charge_id) references public.charges(organization_id,id) on delete restrict,
  constraint charge_adjustments_check check (direction in ('CREDIT','DEBIT') and amount_centavos > 0 and amount_centavos <= 99999999999 and btrim(reason)<>'' and length(reason)<=500), unique (organization_id,id), unique (organization_id,idempotency_key)
);
revoke all on table public.charge_adjustments from public, anon, authenticated, service_role;
create table public.charge_adjustment_reversals (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete restrict, adjustment_id uuid not null, reason text not null, occurred_at timestamptz not null default statement_timestamp(), created_by uuid references auth.users(id) on delete set null, idempotency_key text not null,
  constraint charge_adjustment_reversals_adjustment_fk foreign key (organization_id,adjustment_id) references public.charge_adjustments(organization_id,id) on delete restrict,
  constraint charge_adjustment_reversals_reason_check check (btrim(reason)<>'' and length(reason)<=500), unique (organization_id,adjustment_id), unique (organization_id,id), unique (organization_id,idempotency_key)
);
revoke all on table public.charge_adjustment_reversals from public, anon, authenticated, service_role;
create table public.charge_voids (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete restrict, charge_id uuid not null, reason text not null, voided_at timestamptz not null default statement_timestamp(), voided_by uuid references auth.users(id) on delete set null,
  constraint charge_voids_charge_fk foreign key (organization_id,charge_id) references public.charges(organization_id,id) on delete restrict, constraint charge_voids_reason_check check (btrim(reason)<>'' and length(reason)<=500), unique (organization_id,charge_id), unique (organization_id,id)
);
revoke all on table public.charge_voids from public, anon, authenticated, service_role;

create function private.prevent_billing_ledger_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise check_violation using message = 'billing ledger entries are append-only';
end;
$$;
revoke all on function private.prevent_billing_ledger_mutation() from public, anon, authenticated, service_role;

create trigger charge_direct_costs_append_only before update or delete on public.charge_direct_costs for each row execute function private.prevent_billing_ledger_mutation();
create trigger charge_adjustments_append_only before update or delete on public.charge_adjustments for each row execute function private.prevent_billing_ledger_mutation();
create trigger charge_adjustment_reversals_append_only before update or delete on public.charge_adjustment_reversals for each row execute function private.prevent_billing_ledger_mutation();
create trigger charge_voids_append_only before update or delete on public.charge_voids for each row execute function private.prevent_billing_ledger_mutation();

alter table public.payment_methods enable row level security; alter table public.procedure_direct_cost_defaults enable row level security; alter table public.charges enable row level security; alter table public.charge_direct_costs enable row level security; alter table public.charge_adjustments enable row level security; alter table public.charge_adjustment_reversals enable row level security; alter table public.charge_voids enable row level security;
create index charges_org_patient_date_idx on public.charges(organization_id,patient_id,service_date); create index charges_org_branch_date_idx on public.charges(organization_id,branch_id,service_date); create index charges_org_provider_date_idx on public.charges(organization_id,provider_id,service_date) where provider_id is not null;
