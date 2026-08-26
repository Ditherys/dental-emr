-- P11-02: immutable document records. Each row stores the finalized,
-- reproducible template version and data snapshot captured at generation time;
-- re-render always uses the snapshot, so output is stable regardless of later
-- record edits. This migration grants nothing and opens no RLS policy; the
-- P11-03 RPC boundary owns all reads and writes.

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete restrict,
  branch_id uuid not null,
  patient_id uuid not null,
  document_type text not null,
  template_version text not null,
  data_snapshot jsonb not null,
  include_set jsonb not null default '{}'::jsonb,
  status text not null default 'GENERATED',
  generated_by uuid references auth.users(id) on delete set null,
  generated_at timestamptz not null default statement_timestamp(),
  version integer not null default 1,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint documents_organization_branch_fk foreign key (
    organization_id,
    branch_id
  ) references public.branches(organization_id, id) on delete restrict,
  constraint documents_organization_patient_fk foreign key (
    organization_id,
    patient_id
  ) references public.patients(organization_id, id) on delete restrict,
  constraint documents_type_check check (
    document_type in (
      'PATIENT_RECORD_SUMMARY', 'APPOINTMENT_SLIP', 'REFERRAL_LETTER'
    )
  ),
  constraint documents_template_version_bounded_check check (
    pg_catalog.btrim(template_version) <> ''
    and pg_catalog.length(template_version) <= 32
  ),
  constraint documents_data_snapshot_check check (
    jsonb_typeof(data_snapshot) = 'object'
    and pg_catalog.pg_column_size(data_snapshot) <= 16384
  ),
  constraint documents_include_set_check check (
    jsonb_typeof(include_set) = 'object'
    and pg_catalog.pg_column_size(include_set) <= 2048
  ),
  constraint documents_status_check check (status in ('GENERATED')),
  constraint documents_version_positive_check check (version > 0)
);

comment on column public.documents.data_snapshot is
  'The finalized, reproducible structured data captured at generation time. Never the full patient record: only the authorized, selected sections built server-side by generate_document.';

revoke all on table public.documents
from public, anon, authenticated, service_role;

alter table public.documents enable row level security;

create index documents_organization_patient_type_idx
  on public.documents (organization_id, patient_id, document_type);

create index documents_organization_branch_generated_at_idx
  on public.documents (organization_id, branch_id, generated_at);

create trigger documents_set_updated_at
before update on public.documents
for each row execute function private.set_updated_at();