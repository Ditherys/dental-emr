-- P3-03: provider and specialty mutations. This object migration grants nothing.

create or replace function public.create_provider(
  p_acting_branch_id uuid,
  p_provider jsonb
)
returns table(provider_id uuid, version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor_user_id uuid := (select auth.uid());
  v_linked_user_id uuid;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch
  where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or v_actor_user_id is null
     or not private.can_manage_provider_configuration(v_organization_id) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if jsonb_typeof(p_provider) <> 'object'
     or not (p_provider ?& array['firstName', 'lastName', 'providerType'])
     or exists (
       select 1 from jsonb_object_keys(p_provider) as key
       where key not in (
         'firstName', 'middleName', 'lastName', 'suffix', 'professionalTitle',
         'licenseNumber', 'contactPhone', 'contactEmail', 'providerType',
         'status', 'websiteVisible', 'bio', 'linkedUserId'
       )
     )
     or (p_provider ? 'firstName' and jsonb_typeof(p_provider -> 'firstName') <> 'string')
     or (p_provider ? 'lastName' and jsonb_typeof(p_provider -> 'lastName') <> 'string')
     or (p_provider ? 'providerType' and jsonb_typeof(p_provider -> 'providerType') <> 'string')
     or (p_provider ? 'status' and jsonb_typeof(p_provider -> 'status') <> 'string')
     or (p_provider ? 'websiteVisible' and jsonb_typeof(p_provider -> 'websiteVisible') <> 'boolean')
     or (p_provider ? 'linkedUserId' and jsonb_typeof(p_provider -> 'linkedUserId') not in ('string', 'null'))
     or exists (
       select 1 from jsonb_object_keys(p_provider) as key
       where key in ('middleName', 'suffix', 'professionalTitle', 'licenseNumber', 'contactPhone', 'contactEmail', 'bio')
         and jsonb_typeof(p_provider -> key) not in ('string', 'null')
     ) then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  if p_provider ? 'linkedUserId' and jsonb_typeof(p_provider -> 'linkedUserId') = 'string' then
    begin v_linked_user_id := (p_provider ->> 'linkedUserId')::uuid;
    exception when others then raise invalid_parameter_value using message = 'invalid input'; end;
  end if;
  if p_provider ? 'linkedUserId' then perform private.require_aal2(); end if;

  if pg_catalog.btrim(p_provider ->> 'firstName') = ''
     or pg_catalog.btrim(p_provider ->> 'lastName') = ''
     or pg_catalog.length(p_provider ->> 'firstName') > 120
     or pg_catalog.length(p_provider ->> 'lastName') > 120
     or coalesce(pg_catalog.length(nullif(pg_catalog.btrim(p_provider ->> 'middleName'), '')), 0) > 120
     or coalesce(pg_catalog.length(nullif(pg_catalog.btrim(p_provider ->> 'suffix'), '')), 0) > 40
     or coalesce(pg_catalog.length(nullif(pg_catalog.btrim(p_provider ->> 'professionalTitle'), '')), 0) > 120
     or coalesce(pg_catalog.length(nullif(pg_catalog.btrim(p_provider ->> 'licenseNumber'), '')), 0) > 80
     or coalesce(pg_catalog.length(nullif(pg_catalog.btrim(p_provider ->> 'contactPhone'), '')), 0) > 40
     or coalesce(pg_catalog.length(nullif(pg_catalog.btrim(p_provider ->> 'contactEmail'), '')), 0) > 254
     or coalesce(pg_catalog.length(nullif(pg_catalog.btrim(p_provider ->> 'bio'), '')), 0) > 4000
     or (p_provider ? 'status' and p_provider ->> 'status' not in ('active', 'inactive')) then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  insert into public.providers (
    organization_id, linked_user_id, first_name, middle_name, last_name, suffix,
    professional_title, license_number, contact_phone, contact_email, provider_type,
    status, website_visible, bio
  ) values (
    v_organization_id, v_linked_user_id, pg_catalog.btrim(p_provider ->> 'firstName'),
    nullif(pg_catalog.btrim(p_provider ->> 'middleName'), ''), pg_catalog.btrim(p_provider ->> 'lastName'),
    nullif(pg_catalog.btrim(p_provider ->> 'suffix'), ''), nullif(pg_catalog.btrim(p_provider ->> 'professionalTitle'), ''),
    nullif(pg_catalog.btrim(p_provider ->> 'licenseNumber'), ''), nullif(pg_catalog.btrim(p_provider ->> 'contactPhone'), ''),
    nullif(pg_catalog.btrim(p_provider ->> 'contactEmail'), ''), p_provider ->> 'providerType',
    coalesce(p_provider ->> 'status', 'active'), coalesce((p_provider ->> 'websiteVisible')::boolean, false),
    nullif(pg_catalog.btrim(p_provider ->> 'bio'), '')
  ) returning id, public.providers.version into provider_id, version;

  insert into public.audit_events (organization_id, branch_id, actor_user_id, actor_type, category, action, entity_type, entity_id, result, metadata)
  values (v_organization_id, p_acting_branch_id, v_actor_user_id, 'USER', 'PROVIDER_CONFIGURATION', 'provider.created', 'provider', provider_id, 'SUCCESS', '{}'::jsonb);
  return next;
end;
$$;

revoke all on function public.create_provider(uuid, jsonb) from public, anon, authenticated, service_role;

create or replace function public.update_provider(
  p_acting_branch_id uuid, p_provider_id uuid, p_expected_version integer, p_patch jsonb
)
returns table(provider_id uuid, version integer)
language plpgsql security definer set search_path = '' as $$
declare
  v_organization_id uuid; v_actor_user_id uuid := (select auth.uid()); v_provider public.providers%rowtype; v_linked_user_id uuid;
begin
  select branch.organization_id into v_organization_id from public.branches as branch where branch.id = p_acting_branch_id and branch.status = 'active';
  if v_organization_id is null or v_actor_user_id is null or not private.can_manage_provider_configuration(v_organization_id) then raise insufficient_privilege using message = 'not authorized'; end if;
  if p_expected_version is null or p_expected_version < 1 or jsonb_typeof(p_patch) <> 'object'
     or not (p_patch ?| array['firstName','middleName','lastName','suffix','professionalTitle','licenseNumber','contactPhone','contactEmail','providerType','status','websiteVisible','bio','linkedUserId'])
     or exists (select 1 from jsonb_object_keys(p_patch) as key where key not in ('firstName','middleName','lastName','suffix','professionalTitle','licenseNumber','contactPhone','contactEmail','providerType','status','websiteVisible','bio','linkedUserId'))
     or (p_patch ? 'firstName' and jsonb_typeof(p_patch -> 'firstName') <> 'string')
     or (p_patch ? 'lastName' and jsonb_typeof(p_patch -> 'lastName') <> 'string')
     or (p_patch ? 'providerType' and jsonb_typeof(p_patch -> 'providerType') <> 'string')
     or (p_patch ? 'status' and jsonb_typeof(p_patch -> 'status') <> 'string')
     or (p_patch ? 'websiteVisible' and jsonb_typeof(p_patch -> 'websiteVisible') <> 'boolean')
     or (p_patch ? 'linkedUserId' and jsonb_typeof(p_patch -> 'linkedUserId') not in ('string','null'))
     or exists (select 1 from jsonb_object_keys(p_patch) as key where key in ('middleName','suffix','professionalTitle','licenseNumber','contactPhone','contactEmail','bio') and jsonb_typeof(p_patch -> key) not in ('string','null')) then
    raise invalid_parameter_value using message = 'invalid input';
  end if;
  if p_patch ? 'linkedUserId' then
    perform private.require_aal2();
    if jsonb_typeof(p_patch -> 'linkedUserId') = 'string' then begin v_linked_user_id := (p_patch ->> 'linkedUserId')::uuid; exception when others then raise invalid_parameter_value using message = 'invalid input'; end; end if;
  end if;
  select provider.* into v_provider from public.providers as provider where provider.id = p_provider_id and provider.organization_id = v_organization_id for update;
  if not found then raise insufficient_privilege using message = 'not authorized'; end if;
  if v_provider.version <> p_expected_version then raise exception using errcode = 'P0001', message = 'stale version'; end if;
  if v_provider.status = 'archived' or (p_patch ? 'status' and p_patch ->> 'status' not in ('active','inactive')) then raise invalid_parameter_value using message = 'invalid input'; end if;
  if (p_patch ? 'firstName' and (pg_catalog.btrim(p_patch ->> 'firstName') = '' or pg_catalog.length(p_patch ->> 'firstName') > 120))
     or (p_patch ? 'lastName' and (pg_catalog.btrim(p_patch ->> 'lastName') = '' or pg_catalog.length(p_patch ->> 'lastName') > 120))
     or coalesce(pg_catalog.length(nullif(pg_catalog.btrim(p_patch ->> 'middleName'), '')), 0) > 120
     or coalesce(pg_catalog.length(nullif(pg_catalog.btrim(p_patch ->> 'suffix'), '')), 0) > 40
     or coalesce(pg_catalog.length(nullif(pg_catalog.btrim(p_patch ->> 'professionalTitle'), '')), 0) > 120
     or coalesce(pg_catalog.length(nullif(pg_catalog.btrim(p_patch ->> 'licenseNumber'), '')), 0) > 80
     or coalesce(pg_catalog.length(nullif(pg_catalog.btrim(p_patch ->> 'contactPhone'), '')), 0) > 40
     or coalesce(pg_catalog.length(nullif(pg_catalog.btrim(p_patch ->> 'contactEmail'), '')), 0) > 254
     or coalesce(pg_catalog.length(nullif(pg_catalog.btrim(p_patch ->> 'bio'), '')), 0) > 4000 then raise invalid_parameter_value using message = 'invalid input'; end if;
  update public.providers set
    first_name = case when p_patch ? 'firstName' then pg_catalog.btrim(p_patch ->> 'firstName') else v_provider.first_name end,
    middle_name = case when p_patch ? 'middleName' then nullif(pg_catalog.btrim(p_patch ->> 'middleName'), '') else v_provider.middle_name end,
    last_name = case when p_patch ? 'lastName' then pg_catalog.btrim(p_patch ->> 'lastName') else v_provider.last_name end,
    suffix = case when p_patch ? 'suffix' then nullif(pg_catalog.btrim(p_patch ->> 'suffix'), '') else v_provider.suffix end,
    professional_title = case when p_patch ? 'professionalTitle' then nullif(pg_catalog.btrim(p_patch ->> 'professionalTitle'), '') else v_provider.professional_title end,
    license_number = case when p_patch ? 'licenseNumber' then nullif(pg_catalog.btrim(p_patch ->> 'licenseNumber'), '') else v_provider.license_number end,
    contact_phone = case when p_patch ? 'contactPhone' then nullif(pg_catalog.btrim(p_patch ->> 'contactPhone'), '') else v_provider.contact_phone end,
    contact_email = case when p_patch ? 'contactEmail' then nullif(pg_catalog.btrim(p_patch ->> 'contactEmail'), '') else v_provider.contact_email end,
    provider_type = case when p_patch ? 'providerType' then p_patch ->> 'providerType' else v_provider.provider_type end,
    status = case when p_patch ? 'status' then p_patch ->> 'status' else v_provider.status end,
    website_visible = case when p_patch ? 'websiteVisible' then (p_patch ->> 'websiteVisible')::boolean else v_provider.website_visible end,
    bio = case when p_patch ? 'bio' then nullif(pg_catalog.btrim(p_patch ->> 'bio'), '') else v_provider.bio end,
    linked_user_id = case when p_patch ? 'linkedUserId' then v_linked_user_id else v_provider.linked_user_id end,
    version = v_provider.version + 1
  where id = v_provider.id and organization_id = v_organization_id returning id, public.providers.version into provider_id, version;
  insert into public.audit_events (organization_id, branch_id, actor_user_id, actor_type, category, action, entity_type, entity_id, result, metadata)
  values (v_organization_id, p_acting_branch_id, v_actor_user_id, 'USER', 'PROVIDER_CONFIGURATION', 'provider.updated', 'provider', provider_id, 'SUCCESS', '{}'::jsonb);
  return next;
end;
$$;

revoke all on function public.update_provider(uuid, uuid, integer, jsonb) from public, anon, authenticated, service_role;

create or replace function public.archive_provider(p_acting_branch_id uuid, p_provider_id uuid, p_expected_version integer)
returns table(provider_id uuid, version integer)
language plpgsql security definer set search_path = '' as $$
declare v_organization_id uuid; v_actor_user_id uuid := (select auth.uid()); v_provider public.providers%rowtype;
begin
  perform private.require_aal2();
  select branch.organization_id into v_organization_id from public.branches as branch where branch.id = p_acting_branch_id and branch.status = 'active';
  if v_organization_id is null or v_actor_user_id is null or not private.can_manage_provider_configuration(v_organization_id) then raise insufficient_privilege using message = 'not authorized'; end if;
  if p_expected_version is null or p_expected_version < 1 then raise invalid_parameter_value using message = 'invalid input'; end if;
  select provider.* into v_provider from public.providers as provider where provider.id = p_provider_id and provider.organization_id = v_organization_id for update;
  if not found then raise insufficient_privilege using message = 'not authorized'; end if;
  if v_provider.version <> p_expected_version then raise exception using errcode = 'P0001', message = 'stale version'; end if;
  if v_provider.status = 'archived' then raise exception using errcode = 'P0001', message = 'invalid state'; end if;
  update public.providers set status = 'archived', archived_at = pg_catalog.statement_timestamp(), version = v_provider.version + 1 where id = v_provider.id and organization_id = v_organization_id returning id, public.providers.version into provider_id, version;
  insert into public.audit_events (organization_id, branch_id, actor_user_id, actor_type, category, action, entity_type, entity_id, result, metadata) values (v_organization_id, p_acting_branch_id, v_actor_user_id, 'USER', 'PROVIDER_CONFIGURATION', 'provider.archived', 'provider', provider_id, 'SUCCESS', '{}'::jsonb);
  return next;
end;
$$;

revoke all on function public.archive_provider(uuid, uuid, integer) from public, anon, authenticated, service_role;

create or replace function public.create_specialty(p_acting_branch_id uuid, p_code text, p_name text)
returns table(specialty_id uuid, version integer)
language plpgsql security definer set search_path = '' as $$
declare v_organization_id uuid; v_actor_user_id uuid := (select auth.uid());
begin
  select branch.organization_id into v_organization_id from public.branches as branch where branch.id = p_acting_branch_id and branch.status = 'active';
  if v_organization_id is null or v_actor_user_id is null or not private.can_manage_provider_configuration(v_organization_id) then raise insufficient_privilege using message = 'not authorized'; end if;
  if p_code is null or p_name is null or p_code <> pg_catalog.upper(p_code) or p_code !~ '^[A-Z][A-Z0-9_]*$' or pg_catalog.length(p_code) > 80 or pg_catalog.btrim(p_name) = '' or pg_catalog.length(p_name) > 160 then raise invalid_parameter_value using message = 'invalid input'; end if;
  insert into public.specialties (organization_id, code, name) values (v_organization_id, p_code, pg_catalog.btrim(p_name)) returning id, public.specialties.version into specialty_id, version;
  insert into public.audit_events (organization_id, branch_id, actor_user_id, actor_type, category, action, entity_type, entity_id, result, metadata) values (v_organization_id, p_acting_branch_id, v_actor_user_id, 'USER', 'PROVIDER_CONFIGURATION', 'specialty.created', 'specialty', specialty_id, 'SUCCESS', '{}'::jsonb);
  return next;
end;
$$;

revoke all on function public.create_specialty(uuid, text, text) from public, anon, authenticated, service_role;

create or replace function public.update_specialty(p_acting_branch_id uuid, p_specialty_id uuid, p_expected_version integer, p_patch jsonb)
returns table(specialty_id uuid, version integer)
language plpgsql security definer set search_path = '' as $$
declare v_organization_id uuid; v_actor_user_id uuid := (select auth.uid()); v_specialty public.specialties%rowtype;
begin
  select branch.organization_id into v_organization_id from public.branches as branch where branch.id = p_acting_branch_id and branch.status = 'active';
  if v_organization_id is null or v_actor_user_id is null or not private.can_manage_provider_configuration(v_organization_id) then raise insufficient_privilege using message = 'not authorized'; end if;
  if p_expected_version is null or p_expected_version < 1 or jsonb_typeof(p_patch) <> 'object' or not (p_patch ?| array['code','name','isActive']) or exists (select 1 from jsonb_object_keys(p_patch) as key where key not in ('code','name','isActive')) or (p_patch ? 'code' and jsonb_typeof(p_patch -> 'code') <> 'string') or (p_patch ? 'name' and jsonb_typeof(p_patch -> 'name') <> 'string') or (p_patch ? 'isActive' and jsonb_typeof(p_patch -> 'isActive') <> 'boolean') then raise invalid_parameter_value using message = 'invalid input'; end if;
  select specialty.* into v_specialty from public.specialties as specialty where specialty.id = p_specialty_id and specialty.organization_id = v_organization_id for update;
  if not found then raise insufficient_privilege using message = 'not authorized'; end if;
  if v_specialty.version <> p_expected_version then raise exception using errcode = 'P0001', message = 'stale version'; end if;
  if (p_patch ? 'code' and (p_patch ->> 'code' <> pg_catalog.upper(p_patch ->> 'code') or p_patch ->> 'code' !~ '^[A-Z][A-Z0-9_]*$' or pg_catalog.length(p_patch ->> 'code') > 80)) or (p_patch ? 'name' and (pg_catalog.btrim(p_patch ->> 'name') = '' or pg_catalog.length(p_patch ->> 'name') > 160)) then raise invalid_parameter_value using message = 'invalid input'; end if;
  update public.specialties set code = case when p_patch ? 'code' then p_patch ->> 'code' else v_specialty.code end, name = case when p_patch ? 'name' then pg_catalog.btrim(p_patch ->> 'name') else v_specialty.name end, is_active = case when p_patch ? 'isActive' then (p_patch ->> 'isActive')::boolean else v_specialty.is_active end, version = v_specialty.version + 1 where id = v_specialty.id and organization_id = v_organization_id returning id, public.specialties.version into specialty_id, version;
  insert into public.audit_events (organization_id, branch_id, actor_user_id, actor_type, category, action, entity_type, entity_id, result, metadata) values (v_organization_id, p_acting_branch_id, v_actor_user_id, 'USER', 'PROVIDER_CONFIGURATION', 'specialty.updated', 'specialty', specialty_id, 'SUCCESS', '{}'::jsonb);
  return next;
end;
$$;

revoke all on function public.update_specialty(uuid, uuid, integer, jsonb) from public, anon, authenticated, service_role;

create or replace function public.set_provider_branches(p_acting_branch_id uuid, p_provider_id uuid, p_expected_version integer, p_branch_ids uuid[])
returns table(provider_id uuid, version integer)
language plpgsql security definer set search_path = '' as $$
declare v_organization_id uuid; v_actor_user_id uuid := (select auth.uid()); v_provider public.providers%rowtype;
begin
  select branch.organization_id into v_organization_id from public.branches as branch where branch.id = p_acting_branch_id and branch.status = 'active';
  if v_organization_id is null or v_actor_user_id is null or not private.can_manage_provider_configuration(v_organization_id) then raise insufficient_privilege using message = 'not authorized'; end if;
  if p_expected_version is null or p_expected_version < 1 or p_branch_ids is null or cardinality(p_branch_ids) <> (select count(distinct branch_id) from unnest(p_branch_ids) as branch_id) then raise invalid_parameter_value using message = 'invalid input'; end if;
  select provider.* into v_provider from public.providers as provider where provider.id = p_provider_id and provider.organization_id = v_organization_id for update;
  if not found then raise insufficient_privilege using message = 'not authorized'; end if;
  if v_provider.version <> p_expected_version then raise exception using errcode = 'P0001', message = 'stale version'; end if;
  if v_provider.status = 'archived' or (select count(*) from public.branches as branch where branch.organization_id = v_organization_id and branch.status = 'active' and branch.id = any(p_branch_ids)) <> cardinality(p_branch_ids) then raise invalid_parameter_value using message = 'invalid input'; end if;
  delete from public.provider_branches as provider_branch where provider_branch.organization_id = v_organization_id and provider_branch.provider_id = v_provider.id;
  insert into public.provider_branches (organization_id, provider_id, branch_id) select v_organization_id, v_provider.id, branch_id from unnest(p_branch_ids) as branch_id;
  update public.providers set version = v_provider.version + 1 where id = v_provider.id and organization_id = v_organization_id returning id, public.providers.version into provider_id, version;
  insert into public.audit_events (organization_id, branch_id, actor_user_id, actor_type, category, action, entity_type, entity_id, result, metadata) values (v_organization_id, p_acting_branch_id, v_actor_user_id, 'USER', 'PROVIDER_CONFIGURATION', 'provider.branches.updated', 'provider', provider_id, 'SUCCESS', '{}'::jsonb);
  return next;
end;
$$;

revoke all on function public.set_provider_branches(uuid, uuid, integer, uuid[]) from public, anon, authenticated, service_role;

create or replace function public.set_provider_specialties(p_acting_branch_id uuid, p_provider_id uuid, p_expected_version integer, p_specialties jsonb)
returns table(provider_id uuid, version integer)
language plpgsql security definer set search_path = '' as $$
declare v_organization_id uuid; v_actor_user_id uuid := (select auth.uid()); v_provider public.providers%rowtype; v_count integer;
begin
  select branch.organization_id into v_organization_id from public.branches as branch where branch.id = p_acting_branch_id and branch.status = 'active';
  if v_organization_id is null or v_actor_user_id is null or not private.can_manage_provider_configuration(v_organization_id) then raise insufficient_privilege using message = 'not authorized'; end if;
  if p_expected_version is null or p_expected_version < 1 or jsonb_typeof(p_specialties) <> 'array' or exists (select 1 from jsonb_array_elements(p_specialties) as item where jsonb_typeof(item) <> 'object' or not (item ?& array['specialtyId','isPrimary']) or exists (select 1 from jsonb_object_keys(item) as key where key not in ('specialtyId','isPrimary')) or jsonb_typeof(item -> 'specialtyId') <> 'string' or jsonb_typeof(item -> 'isPrimary') <> 'boolean') then raise invalid_parameter_value using message = 'invalid input'; end if;
  begin
    perform (item ->> 'specialtyId')::uuid from jsonb_array_elements(p_specialties) as item;
  exception when others then raise invalid_parameter_value using message = 'invalid input'; end;
  if (select count(*) from jsonb_array_elements(p_specialties)) <> (select count(distinct item ->> 'specialtyId') from jsonb_array_elements(p_specialties) as item) or (select count(*) from jsonb_array_elements(p_specialties) as item where (item ->> 'isPrimary')::boolean) > 1 then raise invalid_parameter_value using message = 'invalid input'; end if;
  select provider.* into v_provider from public.providers as provider where provider.id = p_provider_id and provider.organization_id = v_organization_id for update;
  if not found then raise insufficient_privilege using message = 'not authorized'; end if;
  if v_provider.version <> p_expected_version then raise exception using errcode = 'P0001', message = 'stale version'; end if;
  if v_provider.status = 'archived' then raise invalid_parameter_value using message = 'invalid input'; end if;
  select count(*) into v_count from public.specialties as specialty join jsonb_array_elements(p_specialties) as item on specialty.id = (item ->> 'specialtyId')::uuid where specialty.is_active and (specialty.organization_id is null or specialty.organization_id = v_organization_id);
  if v_count <> jsonb_array_length(p_specialties) then raise invalid_parameter_value using message = 'invalid input'; end if;
  delete from public.provider_specialties as provider_specialty where provider_specialty.organization_id = v_organization_id and provider_specialty.provider_id = v_provider.id;
  insert into public.provider_specialties (organization_id, provider_id, specialty_id, is_primary) select v_organization_id, v_provider.id, (item ->> 'specialtyId')::uuid, (item ->> 'isPrimary')::boolean from jsonb_array_elements(p_specialties) as item;
  update public.providers set version = v_provider.version + 1 where id = v_provider.id and organization_id = v_organization_id returning id, public.providers.version into provider_id, version;
  insert into public.audit_events (organization_id, branch_id, actor_user_id, actor_type, category, action, entity_type, entity_id, result, metadata) values (v_organization_id, p_acting_branch_id, v_actor_user_id, 'USER', 'PROVIDER_CONFIGURATION', 'provider.specialties.updated', 'provider', provider_id, 'SUCCESS', '{}'::jsonb);
  return next;
end;
$$;

revoke all on function public.set_provider_specialties(uuid, uuid, integer, jsonb) from public, anon, authenticated, service_role;
