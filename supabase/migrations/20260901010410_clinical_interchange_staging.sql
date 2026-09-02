-- Unified Clinical Chart workspace, task 15: the staged clinical interchange.
--
-- PARSING IS NOT A CLINICAL WRITE. A bounded upload becomes a tenant- and
-- patient-scoped staging batch of NORMALIZED candidates. The untrusted file
-- itself is never stored: only the fields the reviewed parser produced, in
-- typed columns this schema constrains again. Nothing here writes, references
-- or trusts an organization, branch or provider identifier that came out of a
-- file - every one of those is re-derived from the signed-in actor and the
-- active acting branch inside the SECURITY DEFINER boundaries in the adjacent
-- migration.
--
-- Forward-only and non-destructive: three new tables, one private request-key
-- table, three append-only guards. No existing row, function body, policy or
-- clinical record is rewritten, and nothing is granted or revoked on an object
-- that already existed.

-- ---------------------------------------------------------------------------
-- The staging batch
-- ---------------------------------------------------------------------------

create table public.clinical_import_batches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  branch_id uuid not null,
  patient_id uuid not null,
  batch_format text not null,
  source_digest text not null,
  staged_count integer not null,
  batch_status text not null default 'STAGED',
  created_by uuid not null,
  created_at timestamptz not null default statement_timestamp(),
  applied_at timestamptz,
  applied_by uuid,
  applied_encounter_id uuid,
  archived_at timestamptz,
  archived_by uuid,
  archive_reason text,
  constraint clinical_import_batches_format_check check (
    batch_format in ('EMR_JSON_V1', 'FHIR_R4_BUNDLE')
  ),
  -- The digest of the source the clinician uploaded. A digest is not the file:
  -- it lets a clinician recognize a re-upload without the platform retaining a
  -- single byte of untrusted external clinical content.
  constraint clinical_import_batches_source_digest_check check (
    source_digest ~ '^[0-9a-f]{64}$'
  ),
  constraint clinical_import_batches_staged_count_check check (
    staged_count between 0 and 500
  ),
  constraint clinical_import_batches_status_check check (
    batch_status in ('STAGED', 'APPLIED', 'ARCHIVED')
  ),
  constraint clinical_import_batches_archive_reason_check check (
    archive_reason is null or (
      pg_catalog.btrim(archive_reason) <> ''
      and pg_catalog.length(archive_reason) <= 500
    )
  ),
  constraint clinical_import_batches_applied_shape_check check (
    (batch_status = 'APPLIED') = (applied_at is not null)
    and (applied_at is null) = (applied_by is null)
    and (applied_at is null) = (applied_encounter_id is null)
  ),
  constraint clinical_import_batches_archived_shape_check check (
    (batch_status = 'ARCHIVED') = (archived_at is not null)
    and (archived_at is null) = (archived_by is null)
    and (archived_at is null) = (archive_reason is null)
  ),
  constraint clinical_import_batches_organization_id_id_key unique (organization_id, id),
  constraint clinical_import_batches_branch_fk foreign key (organization_id, branch_id)
    references public.branches (organization_id, id) on delete restrict,
  constraint clinical_import_batches_patient_fk foreign key (organization_id, patient_id)
    references public.patients (organization_id, id) on delete restrict,
  constraint clinical_import_batches_created_by_fk foreign key (organization_id, created_by)
    references public.organization_members (organization_id, user_id) on delete restrict,
  constraint clinical_import_batches_applied_by_fk foreign key (organization_id, applied_by)
    references public.organization_members (organization_id, user_id) on delete restrict,
  constraint clinical_import_batches_archived_by_fk foreign key (organization_id, archived_by)
    references public.organization_members (organization_id, user_id) on delete restrict,
  constraint clinical_import_batches_encounter_fk foreign key (organization_id, applied_encounter_id)
    references public.clinical_encounters (organization_id, id) on delete restrict
);

revoke all on table public.clinical_import_batches
from public, anon, authenticated, service_role;

comment on table public.clinical_import_batches is
  'Tenant- and patient-scoped staging batches for the clinical interchange. Holds the digest of an uploaded source and never the source itself, and carries no identifier that came out of a file. A batch is STAGED until a clinician with an active provider link either applies the candidates they selected or abandons it.';

comment on column public.clinical_import_batches.source_digest is
  'SHA-256 of the uploaded source, computed server-side. Never the source bytes, never a filename, never a URL.';

-- ---------------------------------------------------------------------------
-- The normalized candidates
-- ---------------------------------------------------------------------------

create table public.clinical_import_candidates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  batch_id uuid not null,
  ordinal integer not null,
  candidate_kind text not null,
  classification text not null,
  tooth_code text,
  clinical_code text,
  surfaces text[] not null default '{}',
  clinical_date date,
  note text,
  unsupported_label text,
  unsupported_reason text,
  applied_at timestamptz,
  constraint clinical_import_candidates_ordinal_check check (ordinal between 1 and 500),
  constraint clinical_import_candidates_kind_check check (
    candidate_kind in ('TOOTH_FINDING', 'UNSUPPORTED')
  ),
  constraint clinical_import_candidates_classification_check check (
    classification in ('NEW', 'DUPLICATE', 'CONFLICT', 'UNSUPPORTED')
  ),
  constraint clinical_import_candidates_tooth_code_check check (
    tooth_code is null
    or tooth_code ~ '^(1[1-8]|2[1-8]|3[1-8]|4[1-8]|5[1-5]|6[1-5]|7[1-5]|8[1-5])$'
  ),
  constraint clinical_import_candidates_clinical_code_check check (
    clinical_code is null
    or clinical_code in (
      'CARIES', 'RESTORATION', 'CROWN', 'MISSING', 'SEALANT', 'FRACTURE', 'OTHER'
    )
  ),
  constraint clinical_import_candidates_surfaces_check check (
    pg_catalog.cardinality(surfaces) between 0 and 7
    and surfaces <@ array['O', 'B', 'L', 'M', 'D', 'I', 'F']::text[]
  ),
  constraint clinical_import_candidates_note_check check (
    note is null or (
      pg_catalog.btrim(note) <> '' and pg_catalog.length(note) <= 2000
    )
  ),
  -- A bounded token, never a payload and never clinical text: it exists so a
  -- clinician can see that something in the file was not understood.
  constraint clinical_import_candidates_unsupported_label_check check (
    unsupported_label is null or unsupported_label ~ '^[A-Za-z][A-Za-z0-9_]{0,63}$'
  ),
  constraint clinical_import_candidates_unsupported_reason_check check (
    unsupported_reason is null
    or unsupported_reason in (
      'UNSUPPORTED_RESOURCE', 'UNSUPPORTED_RECORD_KIND', 'INVALID_CANDIDATE'
    )
  ),
  constraint clinical_import_candidates_shape_check check (
    case candidate_kind
      when 'TOOTH_FINDING' then
        tooth_code is not null
        and clinical_code is not null
        and clinical_date is not null
        and unsupported_label is null
        and unsupported_reason is null
        and classification <> 'UNSUPPORTED'
      else
        tooth_code is null
        and clinical_code is null
        and clinical_date is null
        and note is null
        and pg_catalog.cardinality(surfaces) = 0
        and unsupported_label is not null
        and unsupported_reason is not null
        and classification = 'UNSUPPORTED'
    end
  ),
  -- An unsupported candidate can never carry an application, whatever else
  -- goes wrong: it is visible, it is not appliable.
  constraint clinical_import_candidates_applied_shape_check check (
    applied_at is null or candidate_kind = 'TOOTH_FINDING'
  ),
  constraint clinical_import_candidates_batch_ordinal_key unique (batch_id, ordinal),
  constraint clinical_import_candidates_organization_id_id_key unique (organization_id, id),
  constraint clinical_import_candidates_batch_fk foreign key (organization_id, batch_id)
    references public.clinical_import_batches (organization_id, id) on delete restrict
);

revoke all on table public.clinical_import_candidates
from public, anon, authenticated, service_role;

comment on table public.clinical_import_candidates is
  'Normalized import candidates in typed, constrained columns. The uploaded document is never stored here in any form: an unrecognized resource survives only as a bounded label and a fixed reason so the clinician can see it was not understood, and it can never be applied.';

-- ---------------------------------------------------------------------------
-- Registered exports
-- ---------------------------------------------------------------------------

create table public.clinical_export_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  branch_id uuid not null,
  patient_id uuid not null,
  export_format text not null,
  export_scope text not null,
  clinical_date date not null,
  requested_by uuid not null,
  created_at timestamptz not null default statement_timestamp(),
  constraint clinical_export_records_format_check check (
    export_format in ('EMR_JSON_V1', 'FHIR_R4_BUNDLE', 'PDF', 'SVG', 'PNG')
  ),
  constraint clinical_export_records_scope_check check (
    export_scope in ('CHART_CURRENT', 'PROGRESS_RECORD', 'CHART_AND_PROGRESS')
  ),
  constraint clinical_export_records_organization_id_id_key unique (organization_id, id),
  constraint clinical_export_records_branch_fk foreign key (organization_id, branch_id)
    references public.branches (organization_id, id) on delete restrict,
  constraint clinical_export_records_patient_fk foreign key (organization_id, patient_id)
    references public.patients (organization_id, id) on delete restrict,
  constraint clinical_export_records_requested_by_fk foreign key (organization_id, requested_by)
    references public.organization_members (organization_id, user_id) on delete restrict
);

revoke all on table public.clinical_export_records
from public, anon, authenticated, service_role;

comment on table public.clinical_export_records is
  'One row per authorized export of a patient chart, registered before the document is generated or the download is created. It records who exported what shape of record, and never the exported content, a filename, a signed URL or a token.';

-- ---------------------------------------------------------------------------
-- Actor-scoped request keys
-- ---------------------------------------------------------------------------

create table private.clinical_interchange_idempotency (
  organization_id uuid not null references public.organizations(id) on delete restrict,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  operation text not null check (
    operation in ('IMPORT_STAGE', 'IMPORT_APPLY', 'EXPORT_RECORD')
  ),
  idempotency_key uuid not null,
  batch_id uuid,
  export_id uuid,
  encounter_id uuid,
  result_count integer,
  created_at timestamptz not null default statement_timestamp(),
  primary key (organization_id, actor_user_id, operation, idempotency_key),
  foreign key (organization_id, batch_id)
    references public.clinical_import_batches (organization_id, id) on delete restrict,
  foreign key (organization_id, export_id)
    references public.clinical_export_records (organization_id, id) on delete restrict,
  foreign key (organization_id, encounter_id)
    references public.clinical_encounters (organization_id, id) on delete restrict
);

revoke all on table private.clinical_interchange_idempotency
from public, anon, authenticated, service_role;

comment on table private.clinical_interchange_idempotency is
  'Actor-scoped request keys for the clinical interchange. A replayed staging, apply or export request returns the stored result instead of staging a second batch, appending a second clinical entry, or registering a second export. Never readable by a browser role.';

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

create index clinical_import_batches_patient_created_idx
  on public.clinical_import_batches (organization_id, patient_id, created_at desc, id);

create index clinical_import_batches_open_idx
  on public.clinical_import_batches (organization_id, patient_id)
  where batch_status = 'STAGED';

create index clinical_import_candidates_batch_idx
  on public.clinical_import_candidates (organization_id, batch_id, ordinal);

create index clinical_export_records_patient_created_idx
  on public.clinical_export_records (organization_id, patient_id, created_at desc, id);

-- ---------------------------------------------------------------------------
-- Append-only guards
--
-- A staged batch is an account of what a file said. Rewriting one after the
-- fact would make the account unreliable exactly where it matters: what a
-- clinician was shown when they decided. Only the bounded lifecycle columns
-- may ever move, and only forward.
-- ---------------------------------------------------------------------------

create function private.protect_clinical_import_batch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise insufficient_privilege using message = 'import batches are append-only';
  end if;

  if old.batch_status <> 'STAGED'
     or new.batch_status not in ('APPLIED', 'ARCHIVED')
     or new.id is distinct from old.id
     or new.organization_id is distinct from old.organization_id
     or new.branch_id is distinct from old.branch_id
     or new.patient_id is distinct from old.patient_id
     or new.batch_format is distinct from old.batch_format
     or new.source_digest is distinct from old.source_digest
     or new.staged_count is distinct from old.staged_count
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise insufficient_privilege using message = 'import batches are append-only';
  end if;

  return new;
end;
$$;

revoke all on function private.protect_clinical_import_batch()
from public, anon, authenticated, service_role;

create trigger clinical_import_batches_append_only
before update or delete on public.clinical_import_batches
for each row execute function private.protect_clinical_import_batch();

create function private.protect_clinical_import_candidate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise insufficient_privilege using message = 'import candidates are append-only';
  end if;

  -- The single legal update: recording that this candidate was applied, once.
  if old.applied_at is not null
     or new.applied_at is null
     or new.id is distinct from old.id
     or new.organization_id is distinct from old.organization_id
     or new.batch_id is distinct from old.batch_id
     or new.ordinal is distinct from old.ordinal
     or new.candidate_kind is distinct from old.candidate_kind
     or new.classification is distinct from old.classification
     or new.tooth_code is distinct from old.tooth_code
     or new.clinical_code is distinct from old.clinical_code
     or new.surfaces is distinct from old.surfaces
     or new.clinical_date is distinct from old.clinical_date
     or new.note is distinct from old.note
     or new.unsupported_label is distinct from old.unsupported_label
     or new.unsupported_reason is distinct from old.unsupported_reason then
    raise insufficient_privilege using message = 'import candidates are append-only';
  end if;

  return new;
end;
$$;

revoke all on function private.protect_clinical_import_candidate()
from public, anon, authenticated, service_role;

create trigger clinical_import_candidates_append_only
before update or delete on public.clinical_import_candidates
for each row execute function private.protect_clinical_import_candidate();

create function private.protect_clinical_export_record()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise insufficient_privilege using message = 'export records are append-only';
  return null;
end;
$$;

revoke all on function private.protect_clinical_export_record()
from public, anon, authenticated, service_role;

create trigger clinical_export_records_append_only
before update or delete on public.clinical_export_records
for each row execute function private.protect_clinical_export_record();

-- ---------------------------------------------------------------------------
-- Row level security
--
-- Deny by default, as every other clinical table in this schema does. No
-- browser role holds a table privilege here at all; the only reachable surface
-- is the narrow SECURITY DEFINER boundary in the adjacent migration.
-- ---------------------------------------------------------------------------

alter table public.clinical_import_batches enable row level security;
alter table public.clinical_import_candidates enable row level security;
alter table public.clinical_export_records enable row level security;
