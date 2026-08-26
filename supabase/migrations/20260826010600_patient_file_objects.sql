-- P4-03: tenant-owned patient file metadata pointing at opaque object-storage
-- keys. Binary objects stay in external storage; this migration grants nothing.

create table public.file_objects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  patient_id uuid not null,
  object_key text not null,
  mime_type text not null,
  size_bytes bigint not null,
  checksum_sha256 text not null,
  uploaded_by uuid not null,
  status text not null default 'pending',
  version integer not null default 1,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  archived_at timestamptz,
  constraint file_objects_organization_patient_fk foreign key (
    organization_id,
    patient_id
  ) references public.patients(organization_id, id) on delete restrict,
  constraint file_objects_organization_uploaded_by_fk foreign key (
    organization_id,
    uploaded_by
  ) references public.organization_members(organization_id, user_id) on delete restrict,
  constraint file_objects_object_key_key unique (object_key),
  constraint file_objects_object_key_format_check check (
    object_key ~ '^org/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/patients/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/files/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ),
  -- The key's embedded org/patient segments must equal the row's own tenant
  -- scope; uuid::text is the canonical lowercase hyphenated form.
  constraint file_objects_object_key_scope_check check (
    pg_catalog.split_part(object_key, '/', 2) = organization_id::text
    and pg_catalog.split_part(object_key, '/', 4) = patient_id::text
  ),
  constraint file_objects_mime_type_bounded_check check (
    pg_catalog.btrim(mime_type) <> ''
    and pg_catalog.length(mime_type) <= 255
    and mime_type ~ '^[a-zA-Z0-9][a-zA-Z0-9!#$&^_.+-]*/[a-zA-Z0-9][a-zA-Z0-9!#$&^_.+-]*$'
  ),
  constraint file_objects_size_positive_check check (size_bytes > 0),
  constraint file_objects_checksum_format_check check (
    checksum_sha256 ~ '^[0-9a-f]{64}$'
  ),
  constraint file_objects_status_check check (
    status in ('pending', 'available', 'archived')
  ),
  constraint file_objects_version_positive_check check (version > 0),
  constraint file_objects_archive_state_check check (
    (status = 'archived') = (archived_at is not null)
  )
);

revoke all on table public.file_objects
from public, anon, authenticated, service_role;

alter table public.file_objects enable row level security;

comment on table public.file_objects is
  'Tenant-owned patient file metadata; binaries live in S3-compatible object storage and object keys stay opaque.';

create index file_objects_organization_patient_status_idx
  on public.file_objects (organization_id, patient_id, status);

create trigger file_objects_set_updated_at
before update on public.file_objects
for each row execute function private.set_updated_at();

-- Row visibility reuses the patient directory read permission; base-table
-- privileges stay revoked from every browser role until P4-04/P4-05 RPCs land.
create policy file_objects_select_shared_directory
on public.file_objects
for select
to authenticated
using ((select private.has_shared_patient_permission(
  organization_id,
  'patient.demographics.read'
)));
