-- P12-02: the public clinic-site read boundary and the site.manage-gated
-- settings RPCs.
--
-- get_public_site is the SINGLE deliberate unauthenticated surface of the
-- whole system (plan 012). It is SECURITY DEFINER with an empty search_path,
-- requires no authentication, and returns only the bounded website-safe
-- projection below -- business name, a representative active website-visible
-- branch address, the admin-editable public settings, website_visible active
-- providers (display name, bio, primary specialty label), and website_visible
-- active procedures (name, description). It never reads or returns clinical,
-- patient, billing, workforce, internal, or audit data; an unknown or
-- inactive org slug yields NULL rather than an error.
--
-- The settings RPCs derive the organization from an active acting branch and
-- require site.manage (OWNER/ADMIN only, P12-01). update_public_site_settings
-- accepts exactly the allowlisted settings keys, bounds values to the table
-- CHECK lengths, applies an optimistic version, and appends one
-- site.settings_updated audit event with empty metadata.
--
-- This object migration grants nothing; the 20260827012401 terminal owns the
-- only grants, including the deliberate anon grant on get_public_site.

create or replace function private.has_site_permission_at_branch(
  p_acting_branch_id uuid,
  p_permission_code text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_permission_code in ('site.manage') and exists (
    select 1
    from public.branches as branch
    join public.organizations as organization
      on organization.id = branch.organization_id
     and organization.status = 'active'
    join public.organization_members as organization_member
      on organization_member.organization_id = organization.id
     and organization_member.user_id = (select auth.uid())
     and organization_member.membership_status = 'active'
    join public.member_roles as member_role
      on member_role.organization_id = organization_member.organization_id
     and member_role.organization_member_id = organization_member.id
    join public.roles as role
      on role.id = member_role.role_id
     and (role.organization_id is null or role.organization_id = organization.id)
    join public.role_permissions as role_permission
      on role_permission.role_id = role.id
    join public.permissions as permission
      on permission.id = role_permission.permission_id
     and permission.code = p_permission_code
    where branch.id = p_acting_branch_id
      and branch.status = 'active'
      and (
        member_role.branch_id is null
        or (
          member_role.branch_id = branch.id
          and exists (
            select 1
            from public.branch_memberships as branch_membership
            where branch_membership.organization_id = organization.id
              and branch_membership.organization_member_id = organization_member.id
              and branch_membership.branch_id = branch.id
              and branch_membership.access_status = 'active'
          )
        )
      )
  );
$$;

revoke all on function private.has_site_permission_at_branch(uuid, text)
from public, anon, authenticated, service_role;

comment on function private.has_site_permission_at_branch(uuid, text) is
  'Current-user site.manage check scoped to an active acting branch with org-wide or exact-branch role coverage.';

create function public.get_public_site(
  p_org_slug text
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'organizationName', organization.business_name,
    'address', branch_address.address,
    'heroHeading', settings.hero_heading,
    'heroSubtext', settings.hero_subtext,
    'aboutText', settings.about_text,
    'contactPhone', settings.contact_phone,
    'contactEmail', settings.contact_email,
    'addressOverride', settings.address_override,
    'operatingHours', settings.operating_hours,
    'privacyNotice', settings.privacy_notice,
    'messengerLink', settings.messenger_link,
    'bookingLink', settings.booking_link,
    'socialLinks', settings.social_links,
    'providers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'displayName', provider.display_name,
        'bio', provider.bio,
        'primarySpecialtyLabel', provider.primary_specialty_label
      ) order by provider.display_name)
      from (
        select
          btrim(concat_ws(' ', source.first_name, source.middle_name, source.last_name, source.suffix)) as display_name,
          source.bio,
          (
            select specialty.name
            from public.provider_specialties as provider_specialty
            join public.specialties as specialty
              on specialty.id = provider_specialty.specialty_id
            where provider_specialty.organization_id = source.organization_id
              and provider_specialty.provider_id = source.id
              and provider_specialty.is_primary
              and provider_specialty.is_active
            limit 1
          ) as primary_specialty_label
        from public.providers as source
        where source.organization_id = organization.id
          and source.status = 'active'
          and source.website_visible
        order by source.last_name, source.first_name, source.id
        limit 50
      ) as provider
    ), '[]'::jsonb),
    'procedures', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', source.name,
        'description', source.description
      ) order by source.name)
      from (
        select source.name, source.description
        from public.procedures as source
        where source.organization_id = organization.id
          and source.status = 'active'
          and source.website_visible
        order by source.name, source.id
        limit 100
      ) as source
    ), '[]'::jsonb)
  )
  from public.organizations as organization
  left join public.public_site_settings as settings
    on settings.organization_id = organization.id
  left join lateral (
    select concat_ws(', ',
      branch.address_line1,
      branch.address_line2,
      branch.city,
      branch.province,
      branch.postal_code
    ) as address
    from public.branches as branch
    where branch.organization_id = organization.id
      and branch.status = 'active'
      and branch.website_visible
    order by branch.created_at, branch.id
    limit 1
  ) as branch_address on true
  where organization.status = 'active'
    and organization.slug = p_org_slug;
$$;

revoke all on function public.get_public_site(text)
from public, anon, authenticated, service_role;

comment on function public.get_public_site(text) is
  'The single deliberate unauthenticated clinic-site projection. Resolves the active organization by slug and returns only website-safe public fields: business name, the representative active website-visible branch address, admin-editable settings, website_visible active providers (display name, bio, primary specialty label), and website_visible active procedures (name, description). It never reads or returns clinical, patient, billing, workforce, internal, or audit data; an unknown or inactive slug returns NULL.';

create function public.get_public_site_settings(
  p_acting_branch_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_settings jsonb;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch
  where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or (select auth.uid()) is null
     or not private.has_site_permission_at_branch(
       p_acting_branch_id, 'site.manage'
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  select jsonb_build_object(
    'heroHeading', settings.hero_heading,
    'heroSubtext', settings.hero_subtext,
    'aboutText', settings.about_text,
    'contactPhone', settings.contact_phone,
    'contactEmail', settings.contact_email,
    'addressOverride', settings.address_override,
    'operatingHours', settings.operating_hours,
    'privacyNotice', settings.privacy_notice,
    'messengerLink', settings.messenger_link,
    'bookingLink', settings.booking_link,
    'socialLinks', settings.social_links,
    'version', settings.version
  )
  into v_settings
  from public.public_site_settings as settings
  where settings.organization_id = v_organization_id;

  return v_settings;
end;
$$;

revoke all on function public.get_public_site_settings(uuid)
from public, anon, authenticated, service_role;

comment on function public.get_public_site_settings(uuid) is
  'site.manage-gated read of every admin-editable public site setting plus the optimistic version used by update_public_site_settings.';

create function public.update_public_site_settings(
  p_acting_branch_id uuid,
  p_expected_version integer,
  p_settings jsonb
)
returns table(organization_id uuid, version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor_user_id uuid := (select auth.uid());
  v_settings jsonb := coalesce(p_settings, '{}'::jsonb);
  v_organization_id_out uuid;
  v_version_out integer;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch
  where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or v_actor_user_id is null
     or not private.has_site_permission_at_branch(
       p_acting_branch_id, 'site.manage'
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if jsonb_typeof(v_settings) <> 'object'
     or v_settings - array[
       'heroHeading',
       'heroSubtext',
       'aboutText',
       'contactPhone',
       'contactEmail',
       'addressOverride',
       'operatingHours',
       'privacyNotice',
       'messengerLink',
       'bookingLink',
       'socialLinks'
     ]::text[] <> '{}'::jsonb then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  if (v_settings ? 'heroHeading' and (jsonb_typeof(v_settings -> 'heroHeading') <> 'string' or pg_catalog.length(v_settings ->> 'heroHeading') > 200))
     or (v_settings ? 'heroSubtext' and (jsonb_typeof(v_settings -> 'heroSubtext') <> 'string' or pg_catalog.length(v_settings ->> 'heroSubtext') > 500))
     or (v_settings ? 'aboutText' and (jsonb_typeof(v_settings -> 'aboutText') <> 'string' or pg_catalog.length(v_settings ->> 'aboutText') > 5000))
     or (v_settings ? 'contactPhone' and (jsonb_typeof(v_settings -> 'contactPhone') <> 'string' or pg_catalog.length(v_settings ->> 'contactPhone') > 40))
     or (v_settings ? 'contactEmail' and (jsonb_typeof(v_settings -> 'contactEmail') <> 'string' or pg_catalog.length(v_settings ->> 'contactEmail') > 320))
     or (v_settings ? 'addressOverride' and (jsonb_typeof(v_settings -> 'addressOverride') <> 'string' or pg_catalog.length(v_settings ->> 'addressOverride') > 500))
     or (v_settings ? 'privacyNotice' and (jsonb_typeof(v_settings -> 'privacyNotice') <> 'string' or pg_catalog.length(v_settings ->> 'privacyNotice') > 10000))
     or (v_settings ? 'messengerLink' and (jsonb_typeof(v_settings -> 'messengerLink') <> 'string' or pg_catalog.length(v_settings ->> 'messengerLink') > 500))
     or (v_settings ? 'bookingLink' and (jsonb_typeof(v_settings -> 'bookingLink') <> 'string' or pg_catalog.length(v_settings ->> 'bookingLink') > 500))
     or (v_settings ? 'operatingHours' and (jsonb_typeof(v_settings -> 'operatingHours') <> 'object' or pg_catalog.pg_column_size(v_settings -> 'operatingHours') > 2048))
     or (v_settings ? 'socialLinks' and (jsonb_typeof(v_settings -> 'socialLinks') <> 'object' or pg_catalog.pg_column_size(v_settings -> 'socialLinks') > 2048)) then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  insert into public.public_site_settings (
    organization_id,
    hero_heading,
    hero_subtext,
    about_text,
    contact_phone,
    contact_email,
    address_override,
    operating_hours,
    privacy_notice,
    messenger_link,
    booking_link,
    social_links,
    version,
    updated_at
  ) values (
    v_organization_id,
    v_settings ->> 'heroHeading',
    v_settings ->> 'heroSubtext',
    v_settings ->> 'aboutText',
    v_settings ->> 'contactPhone',
    v_settings ->> 'contactEmail',
    v_settings ->> 'addressOverride',
    coalesce(v_settings -> 'operatingHours', '{}'::jsonb),
    v_settings ->> 'privacyNotice',
    v_settings ->> 'messengerLink',
    v_settings ->> 'bookingLink',
    coalesce(v_settings -> 'socialLinks', '{}'::jsonb),
    1,
    pg_catalog.statement_timestamp()
  )
  on conflict on constraint public_site_settings_pkey do update set
    hero_heading = excluded.hero_heading,
    hero_subtext = excluded.hero_subtext,
    about_text = excluded.about_text,
    contact_phone = excluded.contact_phone,
    contact_email = excluded.contact_email,
    address_override = excluded.address_override,
    operating_hours = excluded.operating_hours,
    privacy_notice = excluded.privacy_notice,
    messenger_link = excluded.messenger_link,
    booking_link = excluded.booking_link,
    social_links = excluded.social_links,
    version = public.public_site_settings.version + 1,
    updated_at = pg_catalog.statement_timestamp()
  where public.public_site_settings.version = p_expected_version
  returning public.public_site_settings.organization_id, public.public_site_settings.version into v_organization_id_out, v_version_out;

  if not found then
    raise insufficient_privilege using message = 'stale version';
  end if;

  insert into public.audit_events (
    organization_id, branch_id, actor_user_id, actor_type, category, action,
    entity_type, entity_id, patient_id, result, metadata
  ) values (
    v_organization_id, p_acting_branch_id, v_actor_user_id, 'USER', 'SITE',
    'site.settings_updated', 'public_site_settings', v_organization_id_out, null,
    'SUCCESS', '{}'::jsonb
  );

  organization_id := v_organization_id_out;
  version := v_version_out;
  return next;
end;
$$;

revoke all on function public.update_public_site_settings(uuid, integer, jsonb)
from public, anon, authenticated, service_role;

comment on function public.update_public_site_settings(uuid, integer, jsonb) is
  'site.manage-gated upsert of the public site settings with a strict allowlist of exactly the admin-editable keys, bounded value lengths matching the table CHECKs, an optimistic version, and one site.settings_updated audit event with empty metadata.';