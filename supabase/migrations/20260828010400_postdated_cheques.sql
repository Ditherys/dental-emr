-- B5: post-dated cheques. The cheque's current state is a database-maintained
-- projection kept in sync by the append-only status-event chain; proposed
-- allocations stay separate from confirmed payment allocations until CLEARED
-- atomically converts them. No browser grants or RPCs are introduced here; B6
-- supplies the only mutation boundary. Cheque numbers and bank details are
-- protected financial data never copied into ordinary audit/log metadata.

create table public.postdated_cheques (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  patient_id uuid not null,
  branch_id uuid not null,
  cheque_number text not null,
  bank_name text not null,
  amount_centavos bigint not null,
  currency_code char(3) not null default 'PHP',
  date_due date not null,
  status text not null default 'HELD',
  current_status_event_id uuid,
  version integer not null default 1,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  idempotency_key text not null,
  constraint postdated_cheques_patient_fk foreign key (organization_id,patient_id) references public.patients(organization_id,id) on delete restrict,
  constraint postdated_cheques_branch_fk foreign key (organization_id,branch_id) references public.branches(organization_id,id) on delete restrict,
  constraint postdated_cheques_cheque_number_check check (btrim(cheque_number)<>'' and length(cheque_number)<=80),
  constraint postdated_cheques_bank_check check (btrim(bank_name)<>'' and length(bank_name)<=160),
  constraint postdated_cheques_amount_check check (amount_centavos between 1 and 99999999999),
  constraint postdated_cheques_currency_check check (currency_code='PHP'),
  constraint postdated_cheques_status_check check (status in ('HELD','DEPOSITED','CLEARED','BOUNCED','CANCELLED','REPLACED')),
  constraint postdated_cheques_version_check check (version > 0),
  constraint postdated_cheques_idempotency_check check (length(idempotency_key) between 1 and 128),
  unique (organization_id,id), unique (organization_id,idempotency_key)
);
revoke all on table public.postdated_cheques from public, anon, authenticated, service_role;
alter table public.postdated_cheques enable row level security;
create index postdated_cheques_org_patient_status_idx on public.postdated_cheques(organization_id,patient_id,status);
create index postdated_cheques_org_branch_status_idx on public.postdated_cheques(organization_id,branch_id,status);

create table public.postdated_cheque_allocations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  cheque_id uuid not null,
  charge_id uuid not null,
  patient_id uuid not null,
  amount_centavos bigint not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default statement_timestamp(),
  constraint postdated_cheque_allocations_cheque_fk foreign key (organization_id,cheque_id) references public.postdated_cheques(organization_id,id) on delete restrict,
  constraint postdated_cheque_allocations_charge_fk foreign key (organization_id,charge_id) references public.charges(organization_id,id) on delete restrict,
  constraint postdated_cheque_allocations_patient_fk foreign key (organization_id,patient_id) references public.patients(organization_id,id) on delete restrict,
  constraint postdated_cheque_allocations_amount_check check (amount_centavos between 1 and 99999999999),
  unique (organization_id,id)
);
revoke all on table public.postdated_cheque_allocations from public, anon, authenticated, service_role;
alter table public.postdated_cheque_allocations enable row level security;
create index postdated_cheque_allocations_org_cheque_idx on public.postdated_cheque_allocations(organization_id,cheque_id);
create index postdated_cheque_allocations_org_charge_idx on public.postdated_cheque_allocations(organization_id,charge_id);

create table public.postdated_cheque_status_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  cheque_id uuid not null,
  from_status text not null,
  to_status text not null,
  occurred_at timestamptz not null default statement_timestamp(),
  actor uuid references auth.users(id) on delete set null,
  reason text not null,
  idempotency_key text not null,
  constraint postdated_cheque_status_events_cheque_fk foreign key (organization_id,cheque_id) references public.postdated_cheques(organization_id,id) on delete restrict,
  constraint postdated_cheque_status_events_status_check check (from_status in ('HELD','DEPOSITED','BOUNCED') and to_status in ('DEPOSITED','CLEARED','BOUNCED','CANCELLED','REPLACED')),
  constraint postdated_cheque_status_events_reason_check check (btrim(reason)<>'' and length(reason)<=500),
  constraint postdated_cheque_status_events_idempotency_check check (length(idempotency_key) between 1 and 128),
  unique (organization_id,id), unique (organization_id,idempotency_key)
);
revoke all on table public.postdated_cheque_status_events from public, anon, authenticated, service_role;
create trigger postdated_cheque_status_events_append_only before update or delete on public.postdated_cheque_status_events for each row execute function private.prevent_billing_ledger_mutation();
alter table public.postdated_cheque_status_events enable row level security;
create index postdated_cheque_status_events_org_cheque_occurred_idx on public.postdated_cheque_status_events(organization_id,cheque_id,occurred_at);

-- The projection must reconcile to the event chain: only a legal transition
-- from the cheque's current state may be appended, and the same transaction
-- moves the projection forward. Context validation runs BEFORE the row is
-- checked so terminal/stale attempts surface the precise reason, and the
-- projection update runs AFTER the event row is accepted.
create or replace function private.validate_postdated_cheque_transition_context()
returns trigger language plpgsql set search_path = '' as $$
declare v_current_status text;
begin
  select cheque.status into v_current_status
  from public.postdated_cheques as cheque
  where cheque.id = new.cheque_id and cheque.organization_id = new.organization_id
  for update;

  if v_current_status is null then
    raise check_violation using message = 'postdated cheque does not exist';
  end if;

  if v_current_status in ('CLEARED','CANCELLED','REPLACED') then
    raise check_violation using message = 'postdated cheque is terminal and cannot transition';
  end if;

  if new.from_status <> v_current_status then
    raise check_violation using message = 'postdated cheque transition must start from the current state';
  end if;

  if not (
    (new.from_status='HELD' and new.to_status in ('DEPOSITED','CANCELLED','REPLACED'))
    or (new.from_status='DEPOSITED' and new.to_status in ('CLEARED','BOUNCED','CANCELLED','REPLACED'))
    or (new.from_status='BOUNCED' and new.to_status='REPLACED')
  ) then
    raise check_violation using message = 'postdated cheque transition is not allowed';
  end if;

  return new;
end;
$$;
revoke all on function private.validate_postdated_cheque_transition_context() from public, anon, authenticated, service_role;

create trigger postdated_cheque_status_events_validate_context
before insert on public.postdated_cheque_status_events
for each row execute function private.validate_postdated_cheque_transition_context();

create or replace function private.apply_postdated_cheque_status_event()
returns trigger language plpgsql set search_path = '' as $$
begin
  update public.postdated_cheques as cheque
  set status = new.to_status, current_status_event_id = new.id, updated_at = statement_timestamp()
  where cheque.id = new.cheque_id and cheque.organization_id = new.organization_id;

  return new;
end;
$$;
revoke all on function private.apply_postdated_cheque_status_event() from public, anon, authenticated, service_role;

create trigger postdated_cheque_status_events_apply
after insert on public.postdated_cheque_status_events
for each row execute function private.apply_postdated_cheque_status_event();

create or replace function private.validate_postdated_cheque_allocation_patient_scope()
returns trigger language plpgsql set search_path = '' as $$
declare v_cheque_patient uuid; v_charge_patient uuid;
begin
  select cheque.patient_id into v_cheque_patient
  from public.postdated_cheques as cheque where cheque.id = new.cheque_id;
  select charge.patient_id into v_charge_patient
  from public.charges as charge where charge.id = new.charge_id;
  if v_cheque_patient is null or v_charge_patient is null
     or v_cheque_patient <> new.patient_id or v_charge_patient <> new.patient_id then
    raise check_violation using message = 'postdated cheque allocation patient must match the cheque and charge patient';
  end if;
  return new;
end;
$$;
revoke all on function private.validate_postdated_cheque_allocation_patient_scope() from public, anon, authenticated, service_role;

create trigger postdated_cheque_allocations_validate_patient_scope
before insert on public.postdated_cheque_allocations
for each row execute function private.validate_postdated_cheque_allocation_patient_scope();

-- A cleared cheque is the PDC source for the single CHEQUE payment created by
-- clearance; that payment link is tenant-safe.
alter table public.payments
  add constraint payments_postdated_cheque_fk foreign key (organization_id,postdated_cheque_id)
  references public.postdated_cheques(organization_id,id) on delete restrict;