-- P15-01: canonical, renderer-independent odontogram condition history. FDI
-- tooth numbering (permanent 11-48 or primary 51-85), bounded surface/status/
-- finding vocabularies, bounded notes, optimistic versioning, and a voided
-- history that is never destroyed. The table is RLS-enforced with zero base
-- grants and no browser policies; all reads and writes flow through the
-- P15-02 SECURITY DEFINER RPCs. This object migration grants nothing.

create table public.tooth_conditions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete restrict,
  patient_id uuid not null,
  tooth_code text not null,
  surface text not null default 'FULL',
  status text not null default 'ACTIVE',
  finding_type text not null default 'OTHER',
  notes text,
  recorded_by uuid references auth.users(id) on delete set null,
  recorded_at timestamptz not null default statement_timestamp(),
  voided_at timestamptz,
  version integer not null default 1,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint tooth_conditions_organization_patient_fk foreign key (
    organization_id,
    patient_id
  ) references public.patients(organization_id, id) on delete restrict,
  constraint tooth_conditions_tooth_code_check check (
    tooth_code ~ '^(1[1-8]|2[1-8]|3[1-8]|4[1-8]|5[1-5]|6[1-5]|7[1-5]|8[1-5])$'
  ),
  constraint tooth_conditions_surface_check check (
    surface in ('O', 'B', 'L', 'M', 'D', 'I', 'F', 'FULL')
  ),
  constraint tooth_conditions_status_check check (
    status in ('ACTIVE', 'PLANNED', 'COMPLETED', 'REFERRED')
  ),
  constraint tooth_conditions_finding_type_check check (
    finding_type in (
      'CARIES',
      'RESTORATION',
      'CROWN',
      'BRIDGE',
      'MISSING',
      'SEALANT',
      'FRACTURE',
      'OTHER'
    )
  ),
  constraint tooth_conditions_notes_bounded_check check (
    notes is null or pg_catalog.length(notes) <= 2000
  ),
  constraint tooth_conditions_version_positive_check check (version > 0),
  constraint tooth_conditions_voided_state_check check (
    voided_at is null or status in ('ACTIVE', 'PLANNED')
  ),
  constraint tooth_conditions_organization_id_id_key unique (organization_id, id)
);

revoke all on table public.tooth_conditions
from public, anon, authenticated, service_role;

alter table public.tooth_conditions enable row level security;

comment on table public.tooth_conditions is
  'Tenant-scoped odontogram condition history with FDI tooth codes, bounded clinical vocabularies, and voided-state preservation; no browser policy exists.';

create index tooth_conditions_organization_patient_voided_idx
  on public.tooth_conditions (organization_id, patient_id, voided_at);

create index tooth_conditions_organization_patient_tooth_code_idx
  on public.tooth_conditions (organization_id, patient_id, tooth_code);

create trigger tooth_conditions_set_updated_at
before update on public.tooth_conditions
for each row execute function private.set_updated_at();