-- B2 completion: append-only charge-attribution corrections, the remaining
-- tenant-scoped ledger access-path indexes, and idempotent default
-- payment-method seeding (existing organizations plus an org-creation hook).
-- No browser grants or RPCs are introduced; B6 supplies the mutation boundary.

create table public.charge_attribution_corrections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  charge_id uuid not null,
  previous_provider_id uuid,
  corrected_provider_id uuid,
  previous_branch_id uuid,
  corrected_branch_id uuid,
  previous_service_date date not null,
  corrected_service_date date not null,
  reason text not null,
  occurred_at timestamptz not null default statement_timestamp(),
  corrected_by uuid references auth.users(id) on delete set null,
  idempotency_key text not null,
  constraint charge_attribution_corrections_charge_fk foreign key (organization_id,charge_id) references public.charges(organization_id,id) on delete restrict,
  constraint charge_attribution_corrections_previous_provider_fk foreign key (organization_id,previous_provider_id) references public.providers(organization_id,id) on delete restrict,
  constraint charge_attribution_corrections_corrected_provider_fk foreign key (organization_id,corrected_provider_id) references public.providers(organization_id,id) on delete restrict,
  constraint charge_attribution_corrections_previous_branch_fk foreign key (organization_id,previous_branch_id) references public.branches(organization_id,id) on delete restrict,
  constraint charge_attribution_corrections_corrected_branch_fk foreign key (organization_id,corrected_branch_id) references public.branches(organization_id,id) on delete restrict,
  constraint charge_attribution_corrections_reason_check check (btrim(reason)<>'' and length(reason)<=500),
  constraint charge_attribution_corrections_idempotency_check check (length(idempotency_key) between 1 and 128),
  constraint charge_attribution_corrections_attribution_changed_check check (
    corrected_provider_id is distinct from previous_provider_id
    or corrected_branch_id is distinct from previous_branch_id
    or corrected_service_date is distinct from previous_service_date
  ),
  unique (organization_id,id), unique (organization_id,idempotency_key)
);
revoke all on table public.charge_attribution_corrections from public, anon, authenticated, service_role;

create trigger charge_attribution_corrections_append_only before update or delete on public.charge_attribution_corrections for each row execute function private.prevent_billing_ledger_mutation();

alter table public.charge_attribution_corrections enable row level security;

create index charges_org_procedure_date_idx on public.charges(organization_id,procedure_id,service_date) where procedure_id is not null;
create index charges_org_plan_item_idx on public.charges(organization_id,treatment_plan_item_id) where treatment_plan_item_id is not null;
create index payment_methods_org_active_code_idx on public.payment_methods(organization_id,active,code);
create index procedure_direct_cost_defaults_org_procedure_active_idx on public.procedure_direct_cost_defaults(organization_id,procedure_id,active,version);

create or replace function private.seed_organization_default_payment_methods()
returns trigger language plpgsql set search_path = '' as $$
begin
  insert into public.payment_methods (organization_id, code, name)
  select new.id, default_method.code, default_method.name
  from (values
    ('CASH','Cash'),
    ('CARD','Card'),
    ('GCASH','GCash'),
    ('MAYA','Maya'),
    ('BANK_TRANSFER','Bank Transfer'),
    ('CHEQUE','Cheque'),
    ('OTHER','Other')
  ) as default_method(code, name)
  on conflict (organization_id, code) do nothing;
  return new;
end;
$$;
revoke all on function private.seed_organization_default_payment_methods() from public, anon, authenticated, service_role;

create trigger organizations_seed_default_payment_methods
after insert on public.organizations
for each row execute function private.seed_organization_default_payment_methods();

do $$
declare v_organization_id uuid;
begin
  for v_organization_id in
    select id from public.organizations
  loop
    insert into public.payment_methods (organization_id, code, name)
    select v_organization_id, default_method.code, default_method.name
    from (values
      ('CASH','Cash'),
      ('CARD','Card'),
      ('GCASH','GCash'),
      ('MAYA','Maya'),
      ('BANK_TRANSFER','Bank Transfer'),
      ('CHEQUE','Cheque'),
      ('OTHER','Other')
    ) as default_method(code, name)
    on conflict (organization_id, code) do nothing;
  end loop;
end;
$$;