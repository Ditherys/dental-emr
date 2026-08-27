-- P14-02: clinical schema — tenant+branch encounters that link appointment,
-- patient, and treating provider; versioned clinical notes with an immutable
-- finalized state and a non-destructive amendment chain; bounded medical/
-- allergy/medication history; and prescriptions. Every table is RLS-enforced
-- with zero base grants and no browser policies; all reads and writes flow
-- through the P14-03 SECURITY DEFINER RPCs. This object migration grants
-- nothing; the three trigger functions are revoked from every role.

create or replace function private.protect_finalized_clinical_note()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'FINALIZED' then
    raise check_violation using
      message = 'finalized clinical notes are immutable; create an amendment';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

revoke all on function private.protect_finalized_clinical_note()
from public, anon, authenticated, service_role;

comment on function private.protect_finalized_clinical_note() is
  'Rejects UPDATE and DELETE of a FINALIZED clinical note so history can only grow through amendment children.';

create or replace function private.validate_clinical_note_amendment_scope()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_parent_encounter_id uuid;
  v_parent_status text;
begin
  if new.parent_note_id is null then
    return new;
  end if;

  select parent.encounter_id, parent.status
  into v_parent_encounter_id, v_parent_status
  from public.clinical_notes as parent
  where parent.organization_id = new.organization_id
    and parent.id = new.parent_note_id
  for key share;

  if not found then
    raise foreign_key_violation using
      message = 'amendment parent must belong to the same organization';
  end if;

  if v_parent_encounter_id is distinct from new.encounter_id then
    raise check_violation using
      message = 'amendment parent must belong to the same encounter';
  end if;

  if v_parent_status <> 'FINALIZED' then
    raise check_violation using
      message = 'amendment parent must be finalized';
  end if;

  return new;
end;
$$;

revoke all on function private.validate_clinical_note_amendment_scope()
from public, anon, authenticated, service_role;

comment on function private.validate_clinical_note_amendment_scope() is
  'Guards the amendment chain: a child AMENDMENT note must point at a FINALIZED parent note in the same encounter and organization.';

create or replace function private.protect_finalized_prescription()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'FINALIZED' then
    raise check_violation using
      message = 'finalized prescriptions are immutable; create a new prescription';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

revoke all on function private.protect_finalized_prescription()
from public, anon, authenticated, service_role;

comment on function private.protect_finalized_prescription() is
  'Rejects UPDATE and DELETE of a FINALIZED prescription, mirroring the finalized-note immutability.';

create table public.clinical_encounters (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete restrict,
  branch_id uuid not null,
  patient_id uuid not null,
  appointment_id uuid,
  treating_provider_id uuid not null,
  status text not null default 'OPEN',
  version integer not null default 1,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  finalized_at timestamptz,
  constraint clinical_encounters_organization_branch_fk foreign key (
    organization_id,
    branch_id
  ) references public.branches(organization_id, id) on delete restrict,
  constraint clinical_encounters_organization_patient_fk foreign key (
    organization_id,
    patient_id
  ) references public.patients(organization_id, id) on delete restrict,
  constraint clinical_encounters_organization_appointment_fk foreign key (
    organization_id,
    appointment_id
  ) references public.appointments(organization_id, id) on delete restrict,
  constraint clinical_encounters_organization_provider_fk foreign key (
    organization_id,
    treating_provider_id
  ) references public.providers(organization_id, id) on delete restrict,
  constraint clinical_encounters_status_check check (
    status in ('OPEN', 'FINALIZED')
  ),
  constraint clinical_encounters_version_positive_check check (version > 0),
  constraint clinical_encounters_organization_id_id_key unique (organization_id, id),
  constraint clinical_encounters_finalized_state_check check (
    (status = 'FINALIZED') = (finalized_at is not null)
  )
);

revoke all on table public.clinical_encounters
from public, anon, authenticated, service_role;

alter table public.clinical_encounters enable row level security;

comment on table public.clinical_encounters is
  'Tenant+branch clinical encounters linking appointment, patient, and treating provider; no browser policy exists.';

create index clinical_encounters_organization_patient_status_idx
  on public.clinical_encounters (organization_id, patient_id, status);

create index clinical_encounters_organization_branch_status_idx
  on public.clinical_encounters (organization_id, branch_id, status);

create trigger clinical_encounters_set_updated_at
before update on public.clinical_encounters
for each row execute function private.set_updated_at();

create table public.clinical_notes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete restrict,
  encounter_id uuid not null,
  parent_note_id uuid,
  note_type text not null,
  content text not null,
  status text not null default 'DRAFT',
  finalized_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  version integer not null default 1,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint clinical_notes_organization_encounter_fk foreign key (
    organization_id,
    encounter_id
  ) references public.clinical_encounters(organization_id, id) on delete restrict,
  constraint clinical_notes_organization_parent_note_fk foreign key (
    organization_id,
    parent_note_id
  ) references public.clinical_notes(organization_id, id) on delete restrict,
  constraint clinical_notes_note_type_check check (
    note_type in (
      'PROGRESS',
      'CONSULTATION',
      'PROCEDURE',
      'POST_OP',
      'REFERRAL',
      'FREE_FORM',
      'AMENDMENT'
    )
  ),
  constraint clinical_notes_status_check check (
    status in ('DRAFT', 'FINALIZED')
  ),
  constraint clinical_notes_content_bounded_check check (
    pg_catalog.btrim(content) <> ''
    and pg_catalog.length(content) <= 20000
  ),
  constraint clinical_notes_version_positive_check check (version > 0),
  constraint clinical_notes_organization_id_id_key unique (organization_id, id),
  constraint clinical_notes_amendment_parent_check check (
    (note_type = 'AMENDMENT') = (parent_note_id is not null)
  ),
  constraint clinical_notes_finalized_state_check check (
    (status = 'FINALIZED') = (finalized_at is not null)
  )
);

revoke all on table public.clinical_notes
from public, anon, authenticated, service_role;

alter table public.clinical_notes enable row level security;

comment on table public.clinical_notes is
  'Versioned clinical notes with an immutable FINALIZED state; amendments are child rows preserving full history.';

create index clinical_notes_organization_encounter_status_idx
  on public.clinical_notes (organization_id, encounter_id, status, created_at);

create index clinical_notes_organization_parent_note_idx
  on public.clinical_notes (organization_id, parent_note_id)
  where parent_note_id is not null;

create trigger clinical_notes_protect_finalized
before update or delete on public.clinical_notes
for each row execute function private.protect_finalized_clinical_note();

create trigger clinical_notes_validate_amendment_scope
before insert or update of parent_note_id on public.clinical_notes
for each row execute function private.validate_clinical_note_amendment_scope();

create trigger clinical_notes_set_updated_at
before update on public.clinical_notes
for each row execute function private.set_updated_at();

create table public.patient_medical_conditions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete restrict,
  patient_id uuid not null,
  condition_name text not null,
  status text not null default 'active',
  onset_date date,
  resolved_date date,
  notes text,
  recorded_by uuid references auth.users(id) on delete set null,
  recorded_at timestamptz not null default statement_timestamp(),
  voided_at timestamptz,
  version integer not null default 1,
  constraint patient_medical_conditions_organization_patient_fk foreign key (
    organization_id,
    patient_id
  ) references public.patients(organization_id, id) on delete restrict,
  constraint patient_medical_conditions_condition_name_bounded_check check (
    pg_catalog.btrim(condition_name) <> ''
    and pg_catalog.length(condition_name) <= 200
  ),
  constraint patient_medical_conditions_status_check check (
    status in ('active', 'resolved', 'voided')
  ),
  constraint patient_medical_conditions_notes_bounded_check check (
    notes is null or pg_catalog.length(notes) <= 2000
  ),
  constraint patient_medical_conditions_voided_state_check check (
    (voided_at is not null) = (status = 'voided')
  ),
  constraint patient_medical_conditions_version_positive_check check (version > 0),
  constraint patient_medical_conditions_organization_id_id_key unique (organization_id, id)
);

revoke all on table public.patient_medical_conditions
from public, anon, authenticated, service_role;

alter table public.patient_medical_conditions enable row level security;

comment on table public.patient_medical_conditions is
  'Tenant-scoped medical condition history with voided-state preservation; record-audited via RPCs.';

create index patient_medical_conditions_organization_patient_status_idx
  on public.patient_medical_conditions (organization_id, patient_id, status, recorded_at);

create table public.patient_allergies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete restrict,
  patient_id uuid not null,
  allergen text not null,
  reaction text,
  severity text,
  status text not null default 'active',
  recorded_by uuid references auth.users(id) on delete set null,
  recorded_at timestamptz not null default statement_timestamp(),
  voided_at timestamptz,
  version integer not null default 1,
  constraint patient_allergies_organization_patient_fk foreign key (
    organization_id,
    patient_id
  ) references public.patients(organization_id, id) on delete restrict,
  constraint patient_allergies_allergen_bounded_check check (
    pg_catalog.btrim(allergen) <> ''
    and pg_catalog.length(allergen) <= 200
  ),
  constraint patient_allergies_reaction_bounded_check check (
    reaction is null or pg_catalog.length(reaction) <= 500
  ),
  constraint patient_allergies_severity_check check (
    severity is null or severity in ('MILD', 'MODERATE', 'SEVERE')
  ),
  constraint patient_allergies_status_check check (
    status in ('active', 'resolved', 'voided')
  ),
  constraint patient_allergies_voided_state_check check (
    (voided_at is not null) = (status = 'voided')
  ),
  constraint patient_allergies_version_positive_check check (version > 0),
  constraint patient_allergies_organization_id_id_key unique (organization_id, id)
);

revoke all on table public.patient_allergies
from public, anon, authenticated, service_role;

alter table public.patient_allergies enable row level security;

comment on table public.patient_allergies is
  'Tenant-scoped allergy history with bounded severity vocabulary and voided-state preservation.';

create index patient_allergies_organization_patient_status_idx
  on public.patient_allergies (organization_id, patient_id, status, recorded_at);

create table public.patient_medications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete restrict,
  patient_id uuid not null,
  medication_name text not null,
  dose text,
  frequency text,
  status text not null default 'active',
  start_date date,
  end_date date,
  notes text,
  recorded_by uuid references auth.users(id) on delete set null,
  recorded_at timestamptz not null default statement_timestamp(),
  voided_at timestamptz,
  version integer not null default 1,
  constraint patient_medications_organization_patient_fk foreign key (
    organization_id,
    patient_id
  ) references public.patients(organization_id, id) on delete restrict,
  constraint patient_medications_medication_name_bounded_check check (
    pg_catalog.btrim(medication_name) <> ''
    and pg_catalog.length(medication_name) <= 200
  ),
  constraint patient_medications_dose_bounded_check check (
    dose is null or pg_catalog.length(dose) <= 200
  ),
  constraint patient_medications_frequency_bounded_check check (
    frequency is null or pg_catalog.length(frequency) <= 200
  ),
  constraint patient_medications_status_check check (
    status in ('active', 'resolved', 'voided')
  ),
  constraint patient_medications_notes_bounded_check check (
    notes is null or pg_catalog.length(notes) <= 2000
  ),
  constraint patient_medications_voided_state_check check (
    (voided_at is not null) = (status = 'voided')
  ),
  constraint patient_medications_version_positive_check check (version > 0),
  constraint patient_medications_organization_id_id_key unique (organization_id, id)
);

revoke all on table public.patient_medications
from public, anon, authenticated, service_role;

alter table public.patient_medications enable row level security;

comment on table public.patient_medications is
  'Tenant-scoped medication history with bounded dose/frequency vocabulary and voided-state preservation.';

create index patient_medications_organization_patient_status_idx
  on public.patient_medications (organization_id, patient_id, status, recorded_at);

create table public.prescriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete restrict,
  encounter_id uuid not null,
  patient_id uuid not null,
  provider_id uuid not null,
  items jsonb not null,
  status text not null default 'DRAFT',
  finalized_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  version integer not null default 1,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint prescriptions_organization_encounter_fk foreign key (
    organization_id,
    encounter_id
  ) references public.clinical_encounters(organization_id, id) on delete restrict,
  constraint prescriptions_organization_patient_fk foreign key (
    organization_id,
    patient_id
  ) references public.patients(organization_id, id) on delete restrict,
  constraint prescriptions_organization_provider_fk foreign key (
    organization_id,
    provider_id
  ) references public.providers(organization_id, id) on delete restrict,
  constraint prescriptions_items_bounded_check check (
    jsonb_typeof(items) = 'array'
    and pg_catalog.pg_column_size(items) <= 16384
  ),
  constraint prescriptions_status_check check (
    status in ('DRAFT', 'FINALIZED')
  ),
  constraint prescriptions_version_positive_check check (version > 0),
  constraint prescriptions_organization_id_id_key unique (organization_id, id),
  constraint prescriptions_finalized_state_check check (
    (status = 'FINALIZED') = (finalized_at is not null)
  )
);

revoke all on table public.prescriptions
from public, anon, authenticated, service_role;

alter table public.prescriptions enable row level security;

comment on table public.prescriptions is
  'Encounter-linked prescriptions with an immutable FINALIZED state; items are a bounded allowlisted array.';

create index prescriptions_organization_encounter_status_idx
  on public.prescriptions (organization_id, encounter_id, status);

create index prescriptions_organization_patient_status_idx
  on public.prescriptions (organization_id, patient_id, status);

create trigger prescriptions_protect_finalized
before update or delete on public.prescriptions
for each row execute function private.protect_finalized_prescription();

create trigger prescriptions_set_updated_at
before update on public.prescriptions
for each row execute function private.set_updated_at();