-- P3-04: bounded provider configuration reads. This object migration grants nothing.

create function public.list_provider_directory(p_acting_branch_id uuid)
returns table(
  provider_id uuid,
  display_name text,
  provider_type text,
  status text,
  website_visible boolean,
  primary_specialty_label text,
  branch_count bigint
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
     or not private.can_read_provider_configuration(v_organization_id) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  return query
  select
    provider.id,
    pg_catalog.concat_ws(' ', provider.first_name, provider.middle_name, provider.last_name, provider.suffix),
    provider.provider_type,
    provider.status,
    provider.website_visible,
    primary_specialty.name,
    count(provider_branch.id)
  from public.providers as provider
  left join public.provider_specialties as provider_specialty
    on provider_specialty.organization_id = provider.organization_id
   and provider_specialty.provider_id = provider.id
   and provider_specialty.is_active
   and provider_specialty.is_primary
  left join public.specialties as primary_specialty
    on primary_specialty.id = provider_specialty.specialty_id
  left join public.provider_branches as provider_branch
    on provider_branch.organization_id = provider.organization_id
   and provider_branch.provider_id = provider.id
   and provider_branch.is_active
  where provider.organization_id = v_organization_id
    and provider.status <> 'archived'
  group by provider.id, primary_specialty.name
  order by provider.last_name, provider.first_name, provider.id;
end;
$$;

revoke all on function public.list_provider_directory(uuid) from public, anon, authenticated, service_role;

create function public.get_provider_configuration(
  p_acting_branch_id uuid,
  p_provider_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_result jsonb;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch
  where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or (select auth.uid()) is null
     or not private.can_read_provider_configuration(v_organization_id) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  select jsonb_build_object(
    'providerId', provider.id,
    'firstName', provider.first_name,
    'middleName', provider.middle_name,
    'lastName', provider.last_name,
    'suffix', provider.suffix,
    'professionalTitle', provider.professional_title,
    'licenseNumber', provider.license_number,
    'contactPhone', provider.contact_phone,
    'contactEmail', provider.contact_email,
    'providerType', provider.provider_type,
    'status', provider.status,
    'websiteVisible', provider.website_visible,
    'bio', provider.bio,
    'linkedUserId', provider.linked_user_id,
    'version', provider.version,
    'branchIds', coalesce((
      select jsonb_agg(provider_branch.branch_id order by provider_branch.branch_id)
      from public.provider_branches as provider_branch
      where provider_branch.organization_id = provider.organization_id
        and provider_branch.provider_id = provider.id
        and provider_branch.is_active
    ), '[]'::jsonb),
    'specialties', coalesce((
      select jsonb_agg(jsonb_build_object(
        'specialtyId', provider_specialty.specialty_id,
        'isPrimary', provider_specialty.is_primary
      ) order by provider_specialty.specialty_id)
      from public.provider_specialties as provider_specialty
      where provider_specialty.organization_id = provider.organization_id
        and provider_specialty.provider_id = provider.id
        and provider_specialty.is_active
    ), '[]'::jsonb)
  ) into v_result
  from public.providers as provider
  where provider.organization_id = v_organization_id
    and provider.id = p_provider_id;

  if v_result is null then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  return v_result;
end;
$$;

revoke all on function public.get_provider_configuration(uuid, uuid) from public, anon, authenticated, service_role;

create function public.list_specialties(p_acting_branch_id uuid)
returns table(
  specialty_id uuid,
  code text,
  name text,
  is_active boolean,
  is_global boolean,
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
     or not private.can_read_provider_configuration(v_organization_id) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  return query
  select specialty.id, specialty.code, specialty.name, specialty.is_active,
    specialty.organization_id is null, specialty.version
  from public.specialties as specialty
  where specialty.organization_id is null or specialty.organization_id = v_organization_id
  order by specialty.organization_id is not null, specialty.name, specialty.id;
end;
$$;

revoke all on function public.list_specialties(uuid) from public, anon, authenticated, service_role;
