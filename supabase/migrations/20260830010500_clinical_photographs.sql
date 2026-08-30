-- O12 private clinical photographs. Binary content remains in the MinIO/R2 adapter.
-- The composite key lets every clinical-photo relationship prove the tenant
-- boundary at the database level even though file_objects also has a global id.
alter table public.file_objects add constraint file_objects_organization_id_id_key unique (organization_id,id);

create table public.clinical_photographs (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null,
 patient_id uuid not null, source_file_id uuid not null, procedure_case_id uuid,
 category text not null check (category in ('BEFORE','PROGRESS','AFTER','DIAGNOSTIC','INTRAORAL','EXTRAORAL','OTHER')),
 display_filename text not null check (length(display_filename) between 1 and 255 and btrim(display_filename)=display_filename and display_filename !~ '[\\/\\0<>:"|?*]' and display_filename !~ '[[:cntrl:]]'),
 original_client_filename text not null check (length(original_client_filename) between 1 and 255),
 capture_at timestamptz not null, tooth_codes text[] not null default '{}', surfaces text[] not null default '{}', note text,
 source_checksum_sha256 text check (source_checksum_sha256 is null or source_checksum_sha256 ~ '^[0-9a-f]{64}$'), source_size_bytes bigint check (source_size_bytes is null or source_size_bytes > 0),
 processing_status text not null default 'PENDING' check (processing_status in ('PENDING','PROCESSING','READY','FAILED')),
 created_by uuid not null, version integer not null default 1,
 unique (organization_id,id), unique (organization_id,id,patient_id), unique (organization_id,source_file_id),
  foreign key (organization_id,patient_id) references public.patients(organization_id,id) on delete restrict,
 foreign key (organization_id,source_file_id) references public.file_objects(organization_id,id) on delete restrict,
 foreign key (organization_id,created_by) references public.organization_members(organization_id,user_id) on delete restrict,
 foreign key (organization_id,procedure_case_id) references public.procedure_cases(organization_id,id) on delete restrict
);
revoke all on table public.clinical_photographs from public,anon,authenticated,service_role;
create table public.clinical_photo_pairings (
 organization_id uuid not null, patient_id uuid not null, before_photo_id uuid not null, after_photo_id uuid not null,
 created_by uuid not null, created_at timestamptz not null default statement_timestamp(),
 primary key (organization_id,before_photo_id,after_photo_id), unique (organization_id,before_photo_id), unique (organization_id,after_photo_id),
 check (before_photo_id <> after_photo_id),
 foreign key (organization_id,patient_id) references public.patients(organization_id,id) on delete restrict,
 foreign key (organization_id,created_by) references public.organization_members(organization_id,user_id) on delete restrict,
 foreign key (organization_id,before_photo_id,patient_id) references public.clinical_photographs(organization_id,id,patient_id) on delete restrict,
 foreign key (organization_id,after_photo_id,patient_id) references public.clinical_photographs(organization_id,id,patient_id) on delete restrict
);
revoke all on table public.clinical_photo_pairings from public,anon,authenticated,service_role;
create table public.clinical_photo_derivatives (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, photo_id uuid not null,
 variant text not null check (variant in ('thumbnail','preview','display')), object_key text not null,
 mime_type text not null, width integer not null, height integer not null, size_bytes bigint not null,
 checksum_sha256 text not null check (checksum_sha256 ~ '^[0-9a-f]{64}$'), processing_attempts integer not null default 0,
 created_at timestamptz not null default statement_timestamp(), unique (organization_id,photo_id,variant), unique (object_key),
 foreign key (organization_id,photo_id) references public.clinical_photographs(organization_id,id) on delete restrict,
 check (width > 0 and height > 0 and size_bytes > 0),
 check (object_key ~ '^org/[0-9a-f-]+/patients/[0-9a-f-]+/clinical-photos/[0-9a-f-]+/(thumbnail|preview|display)\.[a-z]+$')
);
revoke all on table public.clinical_photo_derivatives from public,anon,authenticated,service_role;
create index clinical_photographs_patient_capture_idx on public.clinical_photographs(organization_id,patient_id,capture_at desc,id);
create index clinical_photographs_category_idx on public.clinical_photographs(organization_id,patient_id,category,capture_at desc);
create index clinical_photographs_case_idx on public.clinical_photographs(organization_id,procedure_case_id);
create index clinical_photo_derivatives_photo_idx on public.clinical_photo_derivatives(organization_id,photo_id);
revoke all on table public.clinical_photographs, public.clinical_photo_pairings, public.clinical_photo_derivatives from public,anon,authenticated,service_role;
alter table public.clinical_photographs enable row level security; alter table public.clinical_photo_pairings enable row level security; alter table public.clinical_photo_derivatives enable row level security;
