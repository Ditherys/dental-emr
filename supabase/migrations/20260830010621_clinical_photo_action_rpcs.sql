-- O12/O13 clinical-photo action boundary.
-- Generic patient attachments remain demographics-write-only. These narrow
-- RPCs let a dentist upload only an image source for a patient they can edit,
-- while all object bytes still travel through the private server adapter.

do $do$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'clinical_photographs'
      and column_name = 'archived_at'
  ) then
    alter table public.clinical_photographs
      add column archived_at timestamptz,
      add column archived_by uuid,
      add column archive_reason text,
      add constraint clinical_photographs_archive_state_check
        check ((archived_at is null and archived_by is null and archive_reason is null)
          or (archived_at is not null and archived_by is not null and archive_reason is not null
            and length(archive_reason) between 1 and 1000)),
      add constraint clinical_photographs_organization_archived_by_fkey
        foreign key (organization_id, archived_by)
        references public.organization_members(organization_id, user_id)
        on delete restrict;
  end if;
end;
$do$;

create or replace function public.create_clinical_photo_source_upload(
  p_acting_branch_id uuid,
  p_patient_id uuid,
  p_mime_type text,
  p_size_bytes bigint default null
)
returns table(file_id uuid, object_key text, version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor_user_id uuid := (select auth.uid());
  v_file_id uuid;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch
  where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or v_actor_user_id is null
     or not private.has_clinical_permission_at_branch(
       p_acting_branch_id, 'patient.clinical.write'
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_mime_type not in ('image/jpeg', 'image/png', 'image/webp')
     or (p_size_bytes is not null and
       (p_size_bytes <= 0 or p_size_bytes > 26214400)) then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  if not exists (
    select 1 from public.patients as patient
    where patient.organization_id = v_organization_id
      and patient.id = p_patient_id
      and patient.status <> 'archived'
  ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  v_file_id := pg_catalog.gen_random_uuid();
  insert into public.file_objects (
    id, organization_id, patient_id, object_key, mime_type, size_bytes,
    uploaded_by
  ) values (
    v_file_id, v_organization_id, p_patient_id,
    'org/' || v_organization_id::text || '/patients/' || p_patient_id::text
      || '/files/' || v_file_id::text,
    p_mime_type, p_size_bytes, v_actor_user_id
  ) returning id, public.file_objects.object_key, public.file_objects.version
    into file_id, object_key, version;

  insert into public.audit_events (
    organization_id, branch_id, actor_user_id, actor_type, category, action,
    entity_type, entity_id, patient_id, result, metadata
  ) values (
    v_organization_id, p_acting_branch_id, v_actor_user_id, 'USER', 'CLINICAL',
    'clinical.photo.source_upload_created', 'file_object', file_id,
    p_patient_id, 'SUCCESS', '{}'::jsonb
  );
  return next;
end;
$$;

revoke all on function public.create_clinical_photo_source_upload(uuid,uuid,text,bigint)
from public, anon, authenticated, service_role;

create or replace function public.get_clinical_photo_source_upload(
  p_acting_branch_id uuid,
  p_patient_id uuid,
  p_file_id uuid
)
returns table(
  file_id uuid,
  object_key text,
  mime_type text,
  size_bytes bigint,
  status text,
  version integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch
  where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or (select auth.uid()) is null
     or not private.has_clinical_permission_at_branch(
       p_acting_branch_id, 'patient.clinical.write'
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  return query
  select file_object.id, file_object.object_key, file_object.mime_type,
    file_object.size_bytes, file_object.status, file_object.version
  from public.file_objects as file_object
  where file_object.organization_id = v_organization_id
    and file_object.patient_id = p_patient_id
    and file_object.id = p_file_id;

  if not found then
    raise insufficient_privilege using message = 'not authorized';
  end if;
end;
$$;

revoke all on function public.get_clinical_photo_source_upload(uuid,uuid,uuid)
from public, anon, authenticated, service_role;

create or replace function public.confirm_clinical_photo_source_upload(
  p_acting_branch_id uuid,
  p_patient_id uuid,
  p_file_id uuid,
  p_expected_version integer,
  p_verified_size_bytes bigint
)
returns table(file_id uuid, version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor_user_id uuid := (select auth.uid());
  v_file public.file_objects%rowtype;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch
  where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or v_actor_user_id is null
     or not private.has_clinical_permission_at_branch(
       p_acting_branch_id, 'patient.clinical.write'
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_expected_version is null or p_expected_version < 1
     or p_verified_size_bytes is null or p_verified_size_bytes <= 0
     or p_verified_size_bytes > 26214400 then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  select file_object.* into v_file
  from public.file_objects as file_object
  where file_object.organization_id = v_organization_id
    and file_object.patient_id = p_patient_id
    and file_object.id = p_file_id
  for update;

  if not found then
    raise insufficient_privilege using message = 'not authorized';
  end if;
  if v_file.version <> p_expected_version then
    raise exception using errcode = 'P0001', message = 'stale version';
  end if;
  if v_file.status <> 'pending' then
    raise exception using errcode = 'P0001', message = 'invalid state';
  end if;

  update public.file_objects
  set status = 'available', size_bytes = p_verified_size_bytes,
      version = v_file.version + 1
  where organization_id = v_organization_id and id = p_file_id
  returning id, public.file_objects.version into file_id, version;

  insert into public.audit_events (
    organization_id, branch_id, actor_user_id, actor_type, category, action,
    entity_type, entity_id, patient_id, result, metadata
  ) values (
    v_organization_id, p_acting_branch_id, v_actor_user_id, 'USER', 'CLINICAL',
    'clinical.photo.source_upload_confirmed', 'file_object', file_id,
    p_patient_id, 'SUCCESS', '{}'::jsonb
  );
  return next;
end;
$$;

revoke all on function public.confirm_clinical_photo_source_upload(uuid,uuid,uuid,integer,bigint)
from public, anon, authenticated, service_role;

create or replace function public.get_clinical_photo_derivative(
  p_acting_branch_id uuid,
  p_patient_id uuid,
  p_photo_id uuid,
  p_variant text
)
returns table(
  photo_id uuid,
  variant text,
  object_key text,
  mime_type text,
  width integer,
  height integer,
  size_bytes bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor_user_id uuid := (select auth.uid());
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch
  where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or v_actor_user_id is null
     or not private.has_clinical_permission_at_branch(
       p_acting_branch_id, 'patient.clinical.read'
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;
  if p_variant not in ('thumbnail', 'preview', 'display') then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  return query
  select derivative.photo_id, derivative.variant, derivative.object_key,
    derivative.mime_type, derivative.width, derivative.height,
    derivative.size_bytes
  from public.clinical_photo_derivatives as derivative
  join public.clinical_photographs as photo
    on photo.organization_id = derivative.organization_id
   and photo.id = derivative.photo_id
   and photo.patient_id = p_patient_id
   and photo.processing_status = 'READY'
   and photo.archived_at is null
  where derivative.organization_id = v_organization_id
    and derivative.photo_id = p_photo_id
    and derivative.variant = p_variant;

  if not found then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  insert into public.audit_events (
    organization_id, branch_id, actor_user_id, actor_type, category, action,
    entity_type, entity_id, patient_id, result, metadata
  ) values (
    v_organization_id, p_acting_branch_id, v_actor_user_id, 'USER', 'CLINICAL',
    'clinical.photo.accessed', 'clinical_photograph', p_photo_id,
    p_patient_id, 'SUCCESS', '{}'::jsonb
  );
end;
$$;

revoke all on function public.get_clinical_photo_derivative(uuid,uuid,uuid,text)
from public, anon, authenticated, service_role;

create or replace function public.archive_clinical_photo(
  p_acting_branch_id uuid,
  p_patient_id uuid,
  p_photo_id uuid,
  p_expected_version integer,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor_user_id uuid := (select auth.uid());
  v_photo public.clinical_photographs%rowtype;
begin
  perform private.require_aal2();
  select branch.organization_id into v_organization_id
  from public.branches as branch
  where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or v_actor_user_id is null
     or not private.has_clinical_permission_at_branch(
       p_acting_branch_id, 'patient.clinical.write'
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;
  if p_expected_version is null or p_expected_version < 1
     or p_reason is null or length(p_reason) < 1 or length(p_reason) > 1000
     or btrim(p_reason) <> p_reason or p_reason ~ '[[:cntrl:]]' then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  select photo.* into v_photo
  from public.clinical_photographs as photo
  where photo.organization_id = v_organization_id
    and photo.patient_id = p_patient_id
    and photo.id = p_photo_id
  for update;
  if not found then
    raise insufficient_privilege using message = 'not authorized';
  end if;
  if v_photo.version <> p_expected_version then
    raise exception using errcode = 'P0001', message = 'stale version';
  end if;
  if v_photo.archived_at is not null then
    raise exception using errcode = 'P0001', message = 'invalid state';
  end if;

  update public.clinical_photographs
  set archived_at = statement_timestamp(), archived_by = v_actor_user_id,
      archive_reason = p_reason, version = v_photo.version + 1
  where organization_id = v_organization_id and id = p_photo_id;

  insert into public.audit_events (
    organization_id, branch_id, actor_user_id, actor_type, category, action,
    entity_type, entity_id, patient_id, result, metadata
  ) values (
    v_organization_id, p_acting_branch_id, v_actor_user_id, 'USER', 'CLINICAL',
    'clinical.photo.archived', 'clinical_photograph', p_photo_id,
    p_patient_id, 'SUCCESS', '{}'::jsonb
  );
  return true;
end;
$$;

revoke all on function public.archive_clinical_photo(uuid,uuid,uuid,integer,text)
from public, anon, authenticated, service_role;

-- Archived records are immutable; retain the existing rename/pair signatures
-- while adding a database guard so a forged direct RPC cannot mutate them.
do $do$
declare
  v_definition text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.rename_clinical_photo(uuid,uuid,integer,text)'::regprocedure
  ) into v_definition;
  if v_definition is null then
    raise exception using errcode = '55000', message = 'expected clinical photo rename RPC is missing';
  end if;
  if v_definition not like '%v_photo.archived_at is not null%' then
    v_definition := pg_catalog.replace(
      v_definition,
      'if v_photo.version<>p_expected_version then raise exception using errcode=''P0001'',message=''stale version''; end if;',
      'if v_photo.archived_at is not null then raise exception using errcode=''P0001'',message=''invalid state''; end if; if v_photo.version<>p_expected_version then raise exception using errcode=''P0001'',message=''stale version''; end if;'
    );
    v_definition := pg_catalog.replace(
      v_definition,
      'if v_photo.version <> p_expected_version then raise exception using errcode = ''P0001'', message = ''stale version''; end if;',
      'if v_photo.archived_at is not null then raise exception using errcode = ''P0001'', message = ''invalid state''; end if; if v_photo.version <> p_expected_version then raise exception using errcode = ''P0001'', message = ''stale version''; end if;'
    );
    if v_definition not like '%v_photo.archived_at is not null%' then
      raise exception using errcode = '55000', message = 'could not bind archived clinical photo rename guard';
    end if;
    execute v_definition;
  end if;
end;
$do$;

do $do$
declare
  v_definition text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.pair_clinical_photos(uuid,uuid,uuid)'::regprocedure
  ) into v_definition;
  if v_definition is null then
    raise exception using errcode = '55000', message = 'expected clinical photo pairing RPC is missing';
  end if;
  if v_definition not like '%v_before.archived_at is not null%' then
    v_definition := pg_catalog.replace(
      v_definition,
      'if v_before.id is null or v_after.id is null or v_before.patient_id is distinct from v_after.patient_id or v_before.category<>''BEFORE'' or v_after.category<>''AFTER'' or p_before_photo_id=p_after_photo_id then raise invalid_parameter_value using message=''invalid input''; end if;',
      'if v_before.id is null or v_after.id is null or v_before.patient_id is distinct from v_after.patient_id or v_before.category<>''BEFORE'' or v_after.category<>''AFTER'' or v_before.archived_at is not null or v_after.archived_at is not null or p_before_photo_id=p_after_photo_id then raise invalid_parameter_value using message=''invalid input''; end if;'
    );
    if v_definition not like '%v_before.archived_at is not null%' then
      raise exception using errcode = '55000', message = 'could not bind archived clinical photo pairing guard';
    end if;
    execute v_definition;
  end if;
end;
$do$;

-- Archived clinical photos remain in canonical metadata for audit/history, but
-- ordinary gallery reads and private derivative delivery exclude them.
do $do$
declare
  v_definition text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.list_clinical_photos(uuid,uuid)'::regprocedure
  ) into v_definition;
  if v_definition is null then
    raise exception using errcode = '55000', message = 'expected clinical photo list RPC is missing';
  end if;
  if v_definition not like '%p.processing_status%' then
    raise exception using errcode = '55000', message = 'unexpected clinical photo list RPC body';
  end if;
  if v_definition not like '%p.archived_at is null%' then
    v_definition := pg_catalog.replace(
      v_definition,
      'where p.organization_id=v_org and p.patient_id=p_patient_id order by',
      'where p.organization_id=v_org and p.patient_id=p_patient_id and p.archived_at is null order by'
    );
    v_definition := pg_catalog.replace(
      v_definition,
      'where p.organization_id = v_org and p.patient_id = p_patient_id order by',
      'where p.organization_id = v_org and p.patient_id = p_patient_id and p.archived_at is null order by'
    );
    if v_definition not like '%p.archived_at is null%' then
      raise exception using errcode = '55000', message = 'could not bind archived clinical photo filter';
    end if;
    execute v_definition;
  end if;
end;
$do$;
