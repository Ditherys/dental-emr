-- B4: provider compensation. Agreements are effective-dated with an active
-- no-overlap exclusion; procedure overrides are agreement-scoped; earning
-- entries and compensation resolutions are append-only. No browser grants or
-- RPCs are introduced here; B6 supplies the only mutation boundary.

create table public.provider_compensation_agreements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  provider_id uuid not null,
  effective_from date not null,
  effective_to date,
  default_rate_bps integer not null,
  basis text not null default 'GROSS',
  status text not null default 'ACTIVE',
  version integer not null default 1,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint provider_compensation_agreements_provider_fk foreign key (organization_id,provider_id) references public.providers(organization_id,id) on delete restrict,
  constraint provider_compensation_agreements_rate_check check (default_rate_bps between 0 and 10000),
  constraint provider_compensation_agreements_basis_check check (basis in ('GROSS','NET_DIRECT_COST')),
  constraint provider_compensation_agreements_status_check check (status in ('ACTIVE','ENDED')),
  constraint provider_compensation_agreements_range_check check (effective_from <= effective_to),
  constraint provider_compensation_agreements_version_check check (version > 0),
  constraint provider_compensation_agreements_active_overlap_exclusion exclude using gist (
    provider_id with =,
    daterange(effective_from, coalesce(effective_to,'infinity'::date), '[]') with &&
  ) where (status = 'ACTIVE'),
  unique (organization_id,id)
);
revoke all on table public.provider_compensation_agreements from public, anon, authenticated, service_role;
alter table public.provider_compensation_agreements enable row level security;
create index provider_compensation_agreements_org_provider_effective_idx on public.provider_compensation_agreements(organization_id,provider_id,effective_from);

create table public.provider_procedure_compensation_rates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  agreement_id uuid not null,
  provider_id uuid not null,
  procedure_id uuid not null,
  rate_bps integer not null,
  basis text,
  version integer not null default 1,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint provider_procedure_compensation_rates_agreement_fk foreign key (organization_id,agreement_id) references public.provider_compensation_agreements(organization_id,id) on delete restrict,
  constraint provider_procedure_compensation_rates_provider_fk foreign key (organization_id,provider_id) references public.providers(organization_id,id) on delete restrict,
  constraint provider_procedure_compensation_rates_procedure_fk foreign key (organization_id,procedure_id) references public.procedures(organization_id,id) on delete restrict,
  constraint provider_procedure_compensation_rates_rate_check check (rate_bps between 0 and 10000),
  constraint provider_procedure_compensation_rates_basis_check check (basis is null or basis in ('GROSS','NET_DIRECT_COST')),
  constraint provider_procedure_compensation_rates_version_check check (version > 0),
  unique (organization_id,agreement_id,procedure_id), unique (organization_id,id)
);
revoke all on table public.provider_procedure_compensation_rates from public, anon, authenticated, service_role;
alter table public.provider_procedure_compensation_rates enable row level security;
create index provider_procedure_compensation_rates_org_provider_procedure_idx on public.provider_procedure_compensation_rates(organization_id,provider_id,procedure_id);

create table public.provider_earning_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  provider_id uuid not null,
  charge_id uuid not null,
  allocation_id uuid,
  entry_type text not null,
  cause text,
  eligible_basis_centavos bigint not null,
  net_approved_cost_centavos bigint,
  rate_bps integer not null,
  earning_centavos bigint not null,
  reversal_of_id uuid,
  occurred_at timestamptz not null default statement_timestamp(),
  created_by uuid references auth.users(id) on delete set null,
  idempotency_key text not null,
  constraint provider_earning_entries_provider_fk foreign key (organization_id,provider_id) references public.providers(organization_id,id) on delete restrict,
  constraint provider_earning_entries_charge_fk foreign key (organization_id,charge_id) references public.charges(organization_id,id) on delete restrict,
  constraint provider_earning_entries_allocation_fk foreign key (organization_id,allocation_id) references public.payment_allocations(organization_id,id) on delete restrict,
  constraint provider_earning_entries_reversal_fk foreign key (organization_id,reversal_of_id) references public.provider_earning_entries(organization_id,id) on delete restrict,
  constraint provider_earning_entries_type_check check (entry_type in ('ACCRUAL','REVERSAL')),
  constraint provider_earning_entries_cause_check check (cause is null or cause in ('DIRECT_COST','ATTRIBUTION','REFUND','VOID','REALLOCATION')),
  constraint provider_earning_entries_basis_check check (eligible_basis_centavos between 0 and 99999999999),
  constraint provider_earning_entries_cost_check check (net_approved_cost_centavos is null or net_approved_cost_centavos between 0 and 99999999999),
  constraint provider_earning_entries_rate_check check (rate_bps between 0 and 10000),
  constraint provider_earning_entries_idempotency_check check (length(idempotency_key) between 1 and 128),
  unique (organization_id,id), unique (organization_id,idempotency_key)
);
revoke all on table public.provider_earning_entries from public, anon, authenticated, service_role;
create trigger provider_earning_entries_append_only before update or delete on public.provider_earning_entries for each row execute function private.prevent_billing_ledger_mutation();
alter table public.provider_earning_entries enable row level security;
create index provider_earning_entries_org_provider_charge_idx on public.provider_earning_entries(organization_id,provider_id,charge_id);
create index provider_earning_entries_org_charge_idx on public.provider_earning_entries(organization_id,charge_id);

create table public.charge_compensation_resolutions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  charge_id uuid not null,
  state text not null,
  agreement_id uuid,
  rate_bps integer,
  basis text,
  authoritative_service_date date not null,
  resolved_by uuid references auth.users(id) on delete set null,
  reason text not null,
  occurred_at timestamptz not null default statement_timestamp(),
  idempotency_key text not null,
  constraint charge_compensation_resolutions_charge_fk foreign key (organization_id,charge_id) references public.charges(organization_id,id) on delete restrict,
  constraint charge_compensation_resolutions_agreement_fk foreign key (organization_id,agreement_id) references public.provider_compensation_agreements(organization_id,id) on delete restrict,
  constraint charge_compensation_resolutions_state_check check (state in ('RESOLVED','NO_ACTIVE_AGREEMENT')),
  constraint charge_compensation_resolutions_rate_check check (rate_bps is null or rate_bps between 0 and 10000),
  constraint charge_compensation_resolutions_basis_check check (basis is null or basis in ('GROSS','NET_DIRECT_COST')),
  constraint charge_compensation_resolutions_reason_check check (btrim(reason)<>'' and length(reason)<=500),
  constraint charge_compensation_resolutions_idempotency_check check (length(idempotency_key) between 1 and 128),
  constraint charge_compensation_resolutions_state_consistency_check check (
    (state='RESOLVED' and agreement_id is not null and rate_bps is not null and basis is not null)
    or (state='NO_ACTIVE_AGREEMENT' and agreement_id is null and rate_bps is null and basis is null)
  ),
  unique (organization_id,id), unique (organization_id,idempotency_key)
);
revoke all on table public.charge_compensation_resolutions from public, anon, authenticated, service_role;
create trigger charge_compensation_resolutions_append_only before update or delete on public.charge_compensation_resolutions for each row execute function private.prevent_billing_ledger_mutation();
alter table public.charge_compensation_resolutions enable row level security;
create index charge_compensation_resolutions_org_charge_occurred_idx on public.charge_compensation_resolutions(organization_id,charge_id,occurred_at);

create or replace function private.earning_cumulative_target(p_basis text, p_allocated_centavos bigint, p_net_approved_cost_centavos bigint, p_rate_bps integer)
returns bigint language sql immutable set search_path = '' as $$
  select (
    case
      when p_basis = 'GROSS' then p_allocated_centavos
      else greatest(p_allocated_centavos - coalesce(p_net_approved_cost_centavos, 0), 0)
    end * p_rate_bps + 5000
  ) / 10000;
$$;
revoke all on function private.earning_cumulative_target(text,bigint,bigint,integer) from public, anon, authenticated, service_role;

create or replace function private.resolve_compensation_rate(
  p_organization_id uuid,
  p_provider_id uuid,
  p_procedure_id uuid,
  p_service_date date
)
returns table(agreement_id uuid, rate_bps integer, basis text)
language sql stable set search_path = '' as $$
  select agreement.id, coalesce(override.rate_bps, agreement.default_rate_bps), coalesce(override.basis, agreement.basis)
  from public.provider_compensation_agreements as agreement
  left join public.provider_procedure_compensation_rates as override
    on override.organization_id = agreement.organization_id
   and override.agreement_id = agreement.id
   and override.provider_id = agreement.provider_id
   and override.procedure_id = p_procedure_id
  where agreement.organization_id = p_organization_id
    and agreement.provider_id = p_provider_id
    and agreement.status = 'ACTIVE'
    and agreement.effective_from <= p_service_date
    and (agreement.effective_to is null or agreement.effective_to >= p_service_date)
  order by agreement.effective_from desc
  limit 1;
$$;
revoke all on function private.resolve_compensation_rate(uuid,uuid,uuid,date) from public, anon, authenticated, service_role;

create or replace function private.validate_procedure_compensation_provider_scope()
returns trigger language plpgsql set search_path = '' as $$
declare v_agreement_provider uuid;
begin
  select agreement.provider_id into v_agreement_provider
  from public.provider_compensation_agreements as agreement
  where agreement.id = new.agreement_id;
  if v_agreement_provider is null or v_agreement_provider <> new.provider_id then
    raise check_violation using message = 'procedure compensation rate provider must match its agreement provider';
  end if;
  return new;
end;
$$;
revoke all on function private.validate_procedure_compensation_provider_scope() from public, anon, authenticated, service_role;

create trigger provider_procedure_compensation_rates_validate_provider_scope
before insert or update of provider_id, agreement_id on public.provider_procedure_compensation_rates
for each row execute function private.validate_procedure_compensation_provider_scope();